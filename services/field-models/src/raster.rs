use crate::geo::Bounds;
use anyhow::{bail, Context, Result};
use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

/// A north-up lon/lat grid. Row 0 is the northern edge; NaN is nodata.
#[derive(Clone, Debug)]
pub struct Grid {
    pub bounds: Bounds,
    pub width: usize,
    pub height: usize,
    pub data: Vec<f32>,
}

impl Grid {
    pub fn filled(bounds: Bounds, width: usize, height: usize, value: f32) -> Self {
        Self { bounds, width, height, data: vec![value; width * height] }
    }

    pub fn cell_degrees(&self) -> (f64, f64) {
        (
            (self.bounds.east - self.bounds.west) / self.width as f64,
            (self.bounds.north - self.bounds.south) / self.height as f64,
        )
    }

    /// Cell width and height in metres at the grid's centre latitude.
    pub fn cell_metres(&self) -> (f64, f64) {
        let (dlon, dlat) = self.cell_degrees();
        let (_, lat) = self.bounds.centre();
        (dlon * 111_320.0 * lat.to_radians().cos(), dlat * 111_320.0)
    }

    #[inline]
    pub fn get(&self, col: usize, row: usize) -> f32 {
        self.data[row * self.width + col]
    }

    pub fn cell_centre(&self, col: usize, row: usize) -> (f64, f64) {
        let (dlon, dlat) = self.cell_degrees();
        (
            self.bounds.west + (col as f64 + 0.5) * dlon,
            self.bounds.north - (row as f64 + 0.5) * dlat,
        )
    }

    pub fn cell_of(&self, lon: f64, lat: f64) -> Option<(usize, usize)> {
        if !self.bounds.contains(lon, lat) {
            return None;
        }
        let (dlon, dlat) = self.cell_degrees();
        let col = (((lon - self.bounds.west) / dlon) as usize).min(self.width - 1);
        let row = (((self.bounds.north - lat) / dlat) as usize).min(self.height - 1);
        Some((col, row))
    }

    pub fn sample_nearest(&self, lon: f64, lat: f64) -> f32 {
        self.cell_of(lon, lat).map_or(f32::NAN, |(c, r)| self.get(c, r))
    }

    /// Bilinear interpolation between cell centres; falls back to the nearest
    /// cell when a neighbour is nodata.
    pub fn sample_bilinear(&self, lon: f64, lat: f64) -> f32 {
        if !self.bounds.contains(lon, lat) {
            return f32::NAN;
        }
        let (dlon, dlat) = self.cell_degrees();
        let x = ((lon - self.bounds.west) / dlon - 0.5).clamp(0.0, (self.width - 1) as f64);
        let y = ((self.bounds.north - lat) / dlat - 0.5).clamp(0.0, (self.height - 1) as f64);
        let (c0, r0) = (x.floor() as usize, y.floor() as usize);
        let (c1, r1) = ((c0 + 1).min(self.width - 1), (r0 + 1).min(self.height - 1));
        let (fx, fy) = ((x - c0 as f64) as f32, (y - r0 as f64) as f32);
        let corners = [self.get(c0, r0), self.get(c1, r0), self.get(c0, r1), self.get(c1, r1)];
        if corners.iter().any(|v| v.is_nan()) {
            return self.sample_nearest(lon, lat);
        }
        let top = corners[0] * (1.0 - fx) + corners[1] * fx;
        let bottom = corners[2] * (1.0 - fx) + corners[3] * fx;
        top * (1.0 - fy) + bottom * fy
    }
}

/// Thin wrapper over the GDAL command-line tools. Remote sources are read
/// through /vsicurl/, which fetches only the blocks (or overview blocks) a
/// window needs.
#[derive(Clone)]
pub struct Gdal {
    scratch: PathBuf,
}

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

impl Gdal {
    pub fn new(scratch: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&scratch).with_context(|| format!("create {}", scratch.display()))?;
        Ok(Self { scratch })
    }

    fn temp_path(&self, extension: &str) -> PathBuf {
        let n = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        self.scratch.join(format!("w{}-{n}.{extension}", std::process::id()))
    }

    fn command(program: &str) -> Command {
        let mut command = Command::new(program);
        command
            .env("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
            .env("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.tiff,.vrt")
            .env("GDAL_HTTP_MAX_RETRY", "4")
            .env("GDAL_HTTP_RETRY_DELAY", "1")
            .env("GDAL_HTTP_TIMEOUT", "90")
            .env("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
            .env("GDAL_HTTP_MULTIPLEX", "YES")
            .env("VSI_CACHE", "TRUE")
            .env("GDAL_CACHEMAX", "256");
        command
    }

    /// Download a whole response (for coverage services that ignore range
    /// requests). The caller removes the file.
    pub fn download(&self, url: &str) -> Result<PathBuf> {
        let path = self.temp_path("tif");
        let output = Command::new("curl")
            .args(["-sS", "--fail", "--location", "--max-time", "900", "--retry", "3", "-A", "field-models/0.1", "-o"])
            .arg(&path)
            .arg(url)
            .output()
            .context("run curl")?;
        if !output.status.success() {
            let _ = std::fs::remove_file(&path);
            bail!("download failed: {}", String::from_utf8_lossy(&output.stderr).trim());
        }
        Ok(path)
    }

    /// Resample `sources` (mosaicked when several) onto a lon/lat grid.
    /// Sources that cannot be opened (e.g. tiles over the sea) are skipped;
    /// if none open the grid is all nodata.
    pub fn warp(
        &self,
        sources: &[String],
        bounds: Bounds,
        width: usize,
        height: usize,
        resampling: &str,
        source_nodata: NoData,
    ) -> Result<Grid> {
        if sources.is_empty() {
            return Ok(Grid::filled(bounds, width, height, f32::NAN));
        }
        let mut cleanup = Vec::new();
        let input = if sources.len() == 1 {
            sources[0].clone()
        } else {
            let vrt = self.temp_path("vrt");
            let list = self.temp_path("txt");
            std::fs::write(&list, sources.join("\n"))?;
            cleanup.push(list.clone());
            let mut build = Self::command("gdalbuildvrt");
            build.arg("-q").arg("-input_file_list").arg(&list);
            if let Some(value) = source_nodata.argument() {
                build.arg("-srcnodata").arg(value);
            }
            build.arg(&vrt);
            let output = build.output().context("run gdalbuildvrt")?;
            cleanup.push(vrt.clone());
            if !output.status.success() || !vrt.exists() {
                remove_all(&cleanup);
                return Ok(Grid::filled(bounds, width, height, f32::NAN));
            }
            vrt.to_string_lossy().into_owned()
        };

        let out = self.temp_path("tif");
        cleanup.push(out.clone());
        let mut warp = Self::command("gdalwarp");
        warp.args(["-q", "-overwrite", "-of", "GTiff", "-ot", "Float32"])
            .args(["-t_srs", "EPSG:4326", "-te_srs", "EPSG:4326", "-te"])
            .args([bounds.west, bounds.south, bounds.east, bounds.north].map(|v| v.to_string()))
            .arg("-ts")
            .args([width.to_string(), height.to_string()])
            .args(["-r", resampling, "-dstnodata", "nan", "-wo", "INIT_DEST=NO_DATA"]);
        if let Some(value) = source_nodata.argument() {
            warp.arg("-srcnodata").arg(value);
        }
        warp.arg(&input).arg(&out);
        let output = warp.output().context("run gdalwarp")?;
        if !output.status.success() {
            remove_all(&cleanup);
            // A single remote source that is missing (HTTP 404) is a hole, not a failure.
            let stderr = String::from_utf8_lossy(&output.stderr);
            if sources.len() == 1 && (stderr.contains("404") || stderr.contains("does not exist")) {
                return Ok(Grid::filled(bounds, width, height, f32::NAN));
            }
            bail!("gdalwarp failed for {}: {}", sources[0], stderr.trim());
        }
        let grid = read_float_tiff(&out, bounds);
        remove_all(&cleanup);
        let grid = grid?;
        if grid.width != width || grid.height != height {
            bail!("gdalwarp returned {}x{}, expected {width}x{height}", grid.width, grid.height);
        }
        Ok(grid)
    }
}

/// How to treat source nodata when resampling.
#[derive(Clone, Copy, Debug)]
pub enum NoData {
    /// Use whatever the file declares.
    File,
    Value(f64),
    /// The file's declared nodata is a real value (e.g. 0 = "never burnt").
    Ignore,
}

impl NoData {
    fn argument(self) -> Option<String> {
        match self {
            NoData::File => None,
            NoData::Value(v) => Some(v.to_string()),
            NoData::Ignore => Some("None".into()),
        }
    }
}

fn remove_all(paths: &[PathBuf]) {
    for path in paths {
        let _ = std::fs::remove_file(path);
    }
}

/// Read a single-band Float32 GeoTIFF written by gdalwarp. The caller supplies
/// the bounds it asked for, so no georeferencing tags need parsing.
pub fn read_float_tiff(path: &Path, bounds: Bounds) -> Result<Grid> {
    let file = File::open(path).with_context(|| format!("open {}", path.display()))?;
    let mut decoder = tiff::decoder::Decoder::new(BufReader::new(file))
        .with_context(|| format!("decode {}", path.display()))?
        .with_limits(tiff::decoder::Limits::unlimited());
    let (width, height) = decoder.dimensions()?;
    let data = match decoder.read_image()? {
        tiff::decoder::DecodingResult::F32(values) => values,
        _ => bail!("{} is not Float32", path.display()),
    };
    Ok(Grid { bounds, width: width as usize, height: height as usize, data })
}

/// Write a Float32 grid as a plain (uncompressed) TIFF that read_float_tiff can load.
pub fn write_float_tiff(path: &Path, grid: &Grid) -> Result<()> {
    let temporary = path.with_extension("tmp");
    {
        let file = File::create(&temporary)?;
        let mut encoder = tiff::encoder::TiffEncoder::new(std::io::BufWriter::new(file))?;
        encoder.write_image::<tiff::encoder::colortype::Gray32Float>(
            grid.width as u32,
            grid.height as u32,
            &grid.data,
        )?;
    }
    std::fs::rename(&temporary, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grid() -> Grid {
        let bounds = Bounds { west: 0.0, south: 0.0, east: 2.0, north: 2.0 };
        Grid { bounds, width: 2, height: 2, data: vec![0.0, 1.0, 2.0, 3.0] }
    }

    #[test]
    fn rows_run_north_to_south() {
        let g = grid();
        assert_eq!(g.sample_nearest(0.5, 1.5), 0.0);
        assert_eq!(g.sample_nearest(1.5, 0.5), 3.0);
        assert!(g.sample_nearest(3.0, 0.5).is_nan());
    }

    #[test]
    fn bilinear_interpolates_between_centres() {
        let g = grid();
        assert!((g.sample_bilinear(1.0, 1.0) - 1.5).abs() < 1e-6);
    }

    #[test]
    fn float_tiff_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("g.tif");
        let mut g = grid();
        g.data[1] = f32::NAN;
        write_float_tiff(&path, &g).unwrap();
        let back = read_float_tiff(&path, g.bounds).unwrap();
        assert_eq!((back.width, back.height), (2, 2));
        assert!(back.data[1].is_nan());
        assert_eq!(back.data[3], 3.0);
    }
}
