//! The feature registry: which national rasters exist, and which model
//! features are derived from them at the regional (continental) and local
//! (landscape) scales.

use crate::geo::Bounds;
use crate::raster::{read_float_tiff, write_float_tiff, Gdal, Grid, NoData};
use crate::sources::Source;
use crate::terrain;
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Registry {
    pub schema_version: u8,
    pub registry_id: String,
    pub regional_grid: RegionalGrid,
    pub local: LocalSettings,
    /// The prototype area: its local features are read once and kept on disk,
    /// so training and prediction inside it need no remote reads.
    #[serde(default)]
    pub area: Option<Area>,
    pub rasters: Vec<RasterSpec>,
    pub features: Vec<FeatureSpec>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Area {
    pub id: String,
    pub title: String,
    pub bounds: Bounds,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegionalGrid {
    pub bounds: Bounds,
    pub cell_degrees: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalSettings {
    /// Output cell size for local windows.
    pub cell_m: f64,
    /// Extra margin read around every window so neighbourhood features
    /// (TPI, wetness, distance-to-water) are complete at the core's edge.
    pub pad_m: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RasterSpec {
    pub id: String,
    pub title: String,
    pub provider: String,
    pub licence: String,
    pub source: Source,
    /// GDAL resampling for local windows (regional builds use `regionalResampling`).
    pub resampling: String,
    #[serde(default)]
    pub regional_resampling: Option<String>,
    #[serde(default)]
    pub nodata: Option<f64>,
    /// Treat the file's declared nodata as a real value.
    #[serde(default)]
    pub ignore_file_nodata: bool,
    #[serde(default = "one")]
    pub scale: f64,
    #[serde(default)]
    pub offset: f64,
    #[serde(default)]
    pub valid_min: Option<f64>,
    #[serde(default)]
    pub valid_max: Option<f64>,
}

fn one() -> f64 {
    1.0
}

impl RasterSpec {
    fn nodata_rule(&self) -> NoData {
        match (self.nodata, self.ignore_file_nodata) {
            (Some(v), _) => NoData::Value(v),
            (None, true) => NoData::Ignore,
            (None, false) => NoData::File,
        }
    }

    /// Read this raster onto a lon/lat grid, downloading a clip when the
    /// source cuts windows on request.
    fn read(&self, gdal: &Gdal, bounds: Bounds, width: usize, height: usize, resampling: &str) -> Result<Grid> {
        let mut grid = match self.source.clip_url(bounds) {
            Some(url) => {
                let file = gdal.download(&url)?;
                let grid = gdal.warp(&[file.to_string_lossy().into_owned()], bounds, width, height, resampling, self.nodata_rule());
                let _ = std::fs::remove_file(&file);
                grid?
            }
            None => gdal.warp(&self.source.paths_for(bounds), bounds, width, height, resampling, self.nodata_rule())?,
        };
        apply_value_rules(&mut grid, self);
        Ok(grid)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Scale {
    Regional,
    Local,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Transform {
    #[default]
    None,
    Log1p,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum FeatureInput {
    Raster { raster: String },
    Slope { raster: String },
    Northness { raster: String },
    Eastness { raster: String },
    Tpi { raster: String, radius_m: f64 },
    Roughness { raster: String, radius_m: f64 },
    Wetness { raster: String },
    FocalMean { raster: String, radius_m: f64 },
    DistanceTo { raster: String, threshold: f32, cap_m: f32 },
}

impl FeatureInput {
    pub fn raster(&self) -> &str {
        match self {
            FeatureInput::Raster { raster }
            | FeatureInput::Slope { raster }
            | FeatureInput::Northness { raster }
            | FeatureInput::Eastness { raster }
            | FeatureInput::Tpi { raster, .. }
            | FeatureInput::Roughness { raster, .. }
            | FeatureInput::Wetness { raster }
            | FeatureInput::FocalMean { raster, .. }
            | FeatureInput::DistanceTo { raster, .. } => raster,
        }
    }

    fn neighbourhood_m(&self) -> f64 {
        match self {
            FeatureInput::Tpi { radius_m, .. }
            | FeatureInput::Roughness { radius_m, .. }
            | FeatureInput::FocalMean { radius_m, .. } => *radius_m,
            FeatureInput::DistanceTo { cap_m, .. } => *cap_m as f64,
            FeatureInput::Wetness { .. } => 0.0,
            _ => 0.0,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FeatureSpec {
    pub id: String,
    pub title: String,
    pub group: String,
    pub unit: String,
    pub scale: Scale,
    pub input: FeatureInput,
    #[serde(default)]
    pub transform: Transform,
}

impl Registry {
    pub fn load(path: &Path) -> Result<(Self, String)> {
        let bytes = std::fs::read(path).with_context(|| format!("read {}", path.display()))?;
        let registry: Registry = serde_json::from_slice(&bytes).with_context(|| format!("parse {}", path.display()))?;
        registry.validate()?;
        Ok((registry, hex::sha256(&bytes)))
    }

    fn validate(&self) -> Result<()> {
        if self.schema_version != 1 {
            bail!("unsupported registry schema {}", self.schema_version);
        }
        if !self.regional_grid.bounds.is_valid() || self.regional_grid.cell_degrees <= 0.0 {
            bail!("invalid regional grid");
        }
        if self.local.cell_m <= 0.0 || self.local.pad_m < 0.0 {
            bail!("invalid local settings");
        }
        if let Some(area) = &self.area {
            if !area.bounds.is_valid() || !area.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                bail!("invalid prototype area");
            }
        }
        let mut rasters = BTreeSet::new();
        for raster in &self.rasters {
            if !rasters.insert(raster.id.as_str()) {
                bail!("duplicate raster {}", raster.id);
            }
        }
        let mut features = BTreeSet::new();
        for feature in &self.features {
            if !features.insert(feature.id.as_str()) {
                bail!("duplicate feature {}", feature.id);
            }
            let raster = self
                .raster(feature.input.raster())
                .with_context(|| format!("feature {} names unknown raster", feature.id))?;
            if feature.scale == Scale::Regional {
                if !matches!(feature.input, FeatureInput::Raster { .. }) {
                    bail!("regional feature {} must read a raster directly", feature.id);
                }
                if raster.source.is_tiled() {
                    bail!("regional feature {} needs a single national raster, not tiles", feature.id);
                }
            }
            if feature.input.neighbourhood_m() > self.local.pad_m {
                bail!("feature {} reaches beyond the {} m window pad", feature.id, self.local.pad_m);
            }
        }
        Ok(())
    }

    /// Fingerprint of everything a regional grid for `raster` depends on.
    fn regional_signature(&self, raster: &RasterSpec) -> String {
        let value = serde_json::json!({ "grid": self.regional_grid, "raster": raster });
        sha256_hex(value.to_string().as_bytes())[..12].to_string()
    }

    /// Fingerprint of everything local feature values depend on, so caches
    /// survive registry edits that don't touch the local stack.
    pub fn local_signature(&self) -> String {
        let value = serde_json::json!({
            "local": self.local,
            "features": self.features_at(Scale::Local),
            "rasters": self.rasters_for(Scale::Local),
        });
        sha256_hex(value.to_string().as_bytes())[..12].to_string()
    }

    pub fn raster(&self, id: &str) -> Option<&RasterSpec> {
        self.rasters.iter().find(|r| r.id == id)
    }

    pub fn features_at(&self, scale: Scale) -> Vec<&FeatureSpec> {
        self.features.iter().filter(|f| f.scale == scale).collect()
    }

    fn rasters_for(&self, scale: Scale) -> Vec<&RasterSpec> {
        let ids: BTreeSet<&str> = self.features_at(scale).iter().map(|f| f.input.raster()).collect();
        self.rasters.iter().filter(|r| ids.contains(r.id.as_str())).collect()
    }
}

mod hex {
    use super::*;
    pub fn sha256(bytes: &[u8]) -> String {
        Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
    }
}
pub use hex::sha256 as sha256_hex;

fn apply_value_rules(grid: &mut Grid, raster: &RasterSpec) {
    for value in grid.data.iter_mut() {
        if value.is_nan() {
            continue;
        }
        let v = *value as f64 * raster.scale + raster.offset;
        let invalid = raster.valid_min.is_some_and(|min| v < min) || raster.valid_max.is_some_and(|max| v > max);
        *value = if invalid { f32::NAN } else { v as f32 };
    }
}

fn apply_transform(value: f32, transform: Transform) -> f32 {
    match transform {
        Transform::None => value,
        Transform::Log1p => {
            if value.is_nan() {
                value
            } else {
                value.max(0.0).ln_1p()
            }
        }
    }
}

/// Continental grids, one per regional raster, cached on disk after the first build.
pub struct RegionalStack {
    pub grids: HashMap<String, Grid>,
    pub features: Vec<FeatureSpec>,
}

impl RegionalStack {
    pub fn path(registry: &Registry, cache_dir: &Path, raster_id: &str) -> PathBuf {
        let signature = registry.raster(raster_id).map(|r| registry.regional_signature(r)).unwrap_or_default();
        cache_dir.join("regional").join(format!("{raster_id}-{signature}.tif"))
    }

    fn grid_shape(registry: &Registry) -> (Bounds, usize, usize) {
        let g = &registry.regional_grid;
        let width = ((g.bounds.east - g.bounds.west) / g.cell_degrees).round() as usize;
        let height = ((g.bounds.north - g.bounds.south) / g.cell_degrees).round() as usize;
        (g.bounds, width, height)
    }

    /// Load cached grids; returns the raster ids that still need building.
    pub fn missing(registry: &Registry, cache_dir: &Path) -> Vec<String> {
        registry
            .rasters_for(Scale::Regional)
            .into_iter()
            .filter(|r| !Self::path(registry, cache_dir, &r.id).exists())
            .map(|r| r.id.clone())
            .collect()
    }

    pub fn build_raster(registry: &Registry, cache_dir: &Path, gdal: &Gdal, raster_id: &str) -> Result<()> {
        let raster = registry.raster(raster_id).context("unknown raster")?;
        let (bounds, width, height) = Self::grid_shape(registry);
        let resampling = raster.regional_resampling.as_deref().unwrap_or("average");
        let grid = raster.read(gdal, bounds, width, height, resampling)?;
        let path = Self::path(registry, cache_dir, raster_id);
        std::fs::create_dir_all(path.parent().unwrap())?;
        write_float_tiff(&path, &grid)
    }

    pub fn load(registry: &Registry, cache_dir: &Path) -> Result<Self> {
        let (bounds, width, height) = Self::grid_shape(registry);
        let mut grids = HashMap::new();
        for raster in registry.rasters_for(Scale::Regional) {
            let grid = read_float_tiff(&Self::path(registry, cache_dir, &raster.id), bounds)?;
            if grid.width != width || grid.height != height {
                bail!("cached regional grid {} has the wrong shape", raster.id);
            }
            grids.insert(raster.id.clone(), grid);
        }
        Ok(Self { grids, features: registry.features_at(Scale::Regional).into_iter().cloned().collect() })
    }

    pub fn shape(&self) -> (Bounds, usize, usize) {
        let any = self.grids.values().next().expect("regional stack has grids");
        (any.bounds, any.width, any.height)
    }

    pub fn sample(&self, lon: f64, lat: f64) -> Vec<f32> {
        self.features
            .iter()
            .map(|f| apply_transform(self.grids[f.input.raster()].sample_bilinear(lon, lat), f.transform))
            .collect()
    }

    pub fn cell_values(&self, col: usize, row: usize) -> Vec<f32> {
        self.features
            .iter()
            .map(|f| apply_transform(self.grids[f.input.raster()].get(col, row), f.transform))
            .collect()
    }

    /// The land mask: cells where the first regional raster has data.
    pub fn is_land(&self, col: usize, row: usize) -> bool {
        let first = self.features.first().map(|f| f.input.raster()).unwrap_or_default();
        self.grids.get(first).is_some_and(|g| !g.get(col, row).is_nan())
    }
}

/// Every local feature for one window, on the padded grid.
pub struct LocalStack {
    pub core: Bounds,
    pub grids: Vec<Grid>,
    pub features: Vec<FeatureSpec>,
    pub coverage: BTreeMap<String, f64>,
}

impl LocalStack {
    pub fn build(registry: &Registry, gdal: &Gdal, core: Bounds) -> Result<Self> {
        let (lon, lat) = core.centre();
        let half_w = crate::geo::haversine_m(core.west, lat, core.east, lat) / 2.0;
        let half_h = crate::geo::haversine_m(lon, core.south, lon, core.north) / 2.0;
        let padded = Bounds::around(lon, lat, half_w.max(half_h) + registry.local.pad_m);
        let (width, height) = padded.pixels_for(registry.local.cell_m);
        let rasters = registry.rasters_for(Scale::Local);

        let mut loaded: HashMap<String, Grid> = HashMap::new();
        std::thread::scope(|scope| -> Result<()> {
            let handles: Vec<_> = rasters
                .iter()
                .map(|raster| {
                    scope.spawn(move || -> Result<(String, Grid)> {
                        let grid = raster
                            .read(gdal, padded, width, height, &raster.resampling)
                            .with_context(|| format!("read {}", raster.id))?;
                        Ok((raster.id.clone(), grid))
                    })
                })
                .collect();
            for handle in handles {
                let (id, grid) = handle.join().map_err(|_| anyhow::anyhow!("raster reader panicked"))??;
                loaded.insert(id, grid);
            }
            Ok(())
        })?;

        let features: Vec<FeatureSpec> = registry.features_at(Scale::Local).into_iter().cloned().collect();
        let mut grids = Vec::with_capacity(features.len());
        let mut wetness_cache: HashMap<String, Grid> = HashMap::new();
        for feature in &features {
            let source = &loaded[feature.input.raster()];
            let mut grid = match &feature.input {
                FeatureInput::Raster { .. } => source.clone(),
                FeatureInput::Slope { .. } => terrain::slope_degrees(source),
                FeatureInput::Northness { .. } => terrain::aspect_components(source).0,
                FeatureInput::Eastness { .. } => terrain::aspect_components(source).1,
                FeatureInput::Tpi { radius_m, .. } => terrain::tpi(source, *radius_m),
                FeatureInput::Roughness { radius_m, .. } => terrain::roughness(source, *radius_m),
                FeatureInput::FocalMean { radius_m, .. } => terrain::focal_mean(source, *radius_m),
                FeatureInput::Wetness { raster } => wetness_cache
                    .entry(raster.clone())
                    .or_insert_with(|| terrain::wetness_index(source))
                    .clone(),
                FeatureInput::DistanceTo { threshold, cap_m, .. } => terrain::distance_to(source, *threshold, *cap_m),
            };
            if feature.transform != Transform::None {
                grid.data.iter_mut().for_each(|v| *v = apply_transform(*v, feature.transform));
            }
            grids.push(grid);
        }

        let mut coverage = BTreeMap::new();
        for (feature, grid) in features.iter().zip(&grids) {
            let (mut valid, mut total) = (0usize, 0usize);
            for r in 0..grid.height {
                for c in 0..grid.width {
                    let (x, y) = grid.cell_centre(c, r);
                    if core.contains(x, y) {
                        total += 1;
                        valid += usize::from(!grid.get(c, r).is_nan());
                    }
                }
            }
            coverage.insert(feature.id.clone(), if total == 0 { 0.0 } else { valid as f64 / total as f64 });
        }
        Ok(Self { core, grids, features, coverage })
    }

    pub fn sample(&self, lon: f64, lat: f64) -> Vec<f32> {
        self.grids.iter().map(|g| g.sample_nearest(lon, lat)).collect()
    }

    pub fn cell_values(&self, col: usize, row: usize) -> Vec<f32> {
        self.grids.iter().map(|g| g.get(col, row)).collect()
    }

    /// The padded grid every feature shares.
    pub fn frame(&self) -> &Grid {
        &self.grids[0]
    }

    pub fn save(&self, dir: &Path) -> Result<()> {
        std::fs::create_dir_all(dir)?;
        for (feature, grid) in self.features.iter().zip(&self.grids) {
            write_float_tiff(&dir.join(format!("{}.tif", feature.id)), grid)?;
        }
        let meta = AreaMeta {
            core: self.core,
            padded: self.frame().bounds,
            features: self.features.iter().map(|f| f.id.clone()).collect(),
            coverage: self.coverage.clone(),
        };
        std::fs::write(dir.join("meta.json"), serde_json::to_vec_pretty(&meta)?)?;
        Ok(())
    }

    pub fn load(registry: &Registry, dir: &Path) -> Result<Self> {
        let meta: AreaMeta = serde_json::from_slice(&std::fs::read(dir.join("meta.json"))?)?;
        let features: Vec<FeatureSpec> = registry.features_at(Scale::Local).into_iter().cloned().collect();
        if meta.features != features.iter().map(|f| f.id.clone()).collect::<Vec<_>>() {
            bail!("cached area was built with different features");
        }
        let grids = features
            .iter()
            .map(|f| read_float_tiff(&dir.join(format!("{}.tif", f.id)), meta.padded))
            .collect::<Result<Vec<_>>>()?;
        Ok(Self { core: meta.core, grids, features, coverage: meta.coverage })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AreaMeta {
    core: Bounds,
    padded: Bounds,
    features: Vec<String>,
    coverage: BTreeMap<String, f64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shipped_registry_is_valid() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("registry/national-v1.json");
        let (registry, hash) = Registry::load(&path).unwrap();
        assert_eq!(hash.len(), 64);
        assert!(!registry.features_at(Scale::Regional).is_empty());
        assert!(!registry.features_at(Scale::Local).is_empty());
    }
}
