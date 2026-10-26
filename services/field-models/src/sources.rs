use crate::geo::{australian_albers, Bounds};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Where a raster lives. Every variant resolves to /vsicurl/ paths for a window.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Source {
    /// One national (or global) Cloud-Optimized GeoTIFF.
    Cog { url: String },
    /// Digital Earth Australia's 96 km tiles on the Australian Albers grid;
    /// `template` contains `{x}` and `{y}` tile indices.
    DeaAlbersTiles { template: String },
    /// Square lon/lat tiles of `sizeDegrees`. `template` may use `{lon}`/`{lat}`
    /// (integer south-west corner) or `{west}`/`{south}`/`{east}`/`{north}`
    /// (one decimal place).
    #[serde(rename_all = "camelCase")]
    GridTiles { template: String, size_degrees: f64 },
    /// A web coverage service that cuts the requested box on demand;
    /// `template` contains `{W}`, `{S}`, `{E}`, `{N}`. Such servers usually
    /// ignore range requests, so the clip is downloaded whole.
    Clip { template: String },
}

const DEA_TILE_M: f64 = 96_000.0;
const DEA_ORIGIN_X: f64 = -4_416_000.0;
const DEA_ORIGIN_Y: f64 = -6_912_000.0;

impl Source {
    pub fn paths_for(&self, bounds: Bounds) -> Vec<String> {
        match self {
            Source::Cog { url } => vec![vsicurl(url)],
            Source::DeaAlbersTiles { template } => dea_tiles(bounds)
                .into_iter()
                .map(|(x, y)| vsicurl(&template.replace("{x}", &x.to_string()).replace("{y}", &y.to_string())))
                .collect(),
            Source::GridTiles { template, size_degrees } => {
                let size = *size_degrees;
                let mut paths = Vec::new();
                let tile = |v: f64| (v / size).floor() as i64;
                for x in tile(bounds.west)..=tile(bounds.east - 1e-9) {
                    for y in tile(bounds.south)..=tile(bounds.north - 1e-9) {
                        let (west, south) = (x as f64 * size, y as f64 * size);
                        paths.push(vsicurl(
                            &template
                                .replace("{lon}", &format!("{}", west.round() as i64))
                                .replace("{lat}", &format!("{}", south.round() as i64))
                                .replace("{west}", &format!("{west:.1}"))
                                .replace("{south}", &format!("{south:.1}"))
                                .replace("{east}", &format!("{:.1}", west + size))
                                .replace("{north}", &format!("{:.1}", south + size)),
                        ));
                    }
                }
                paths
            }
            Source::Clip { .. } => Vec::new(),
        }
    }

    /// The URL to download for a clip source, with a margin so resampling at
    /// the edge has neighbours.
    pub fn clip_url(&self, bounds: Bounds) -> Option<String> {
        let Source::Clip { template } = self else { return None };
        let margin = 0.01;
        Some(
            template
                .replace("{W}", &format!("{:.6}", bounds.west - margin))
                .replace("{S}", &format!("{:.6}", bounds.south - margin))
                .replace("{E}", &format!("{:.6}", bounds.east + margin))
                .replace("{N}", &format!("{:.6}", bounds.north + margin)),
        )
    }

    pub fn is_tiled(&self) -> bool {
        !matches!(self, Source::Cog { .. })
    }
}

fn vsicurl(url: &str) -> String {
    if url.starts_with("/vsi") || url.starts_with('/') {
        url.to_string()
    } else {
        format!("/vsicurl/{url}")
    }
}

/// DEA tile indices touching a lon/lat box. The box edges are sampled densely
/// because the Albers projection curves lon/lat lines.
fn dea_tiles(bounds: Bounds) -> BTreeSet<(i64, i64)> {
    let mut tiles = BTreeSet::new();
    let steps = 8;
    for i in 0..=steps {
        for j in 0..=steps {
            let lon = bounds.west + (bounds.east - bounds.west) * i as f64 / steps as f64;
            let lat = bounds.south + (bounds.north - bounds.south) * j as f64 / steps as f64;
            let (x, y) = australian_albers(lon, lat);
            tiles.insert((
                ((x - DEA_ORIGIN_X) / DEA_TILE_M).floor() as i64,
                ((y - DEA_ORIGIN_Y) / DEA_TILE_M).floor() as i64,
            ));
        }
    }
    tiles
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dea_tile_for_laura_is_x59_y53() {
        // ga_ls_wo_fq_myear_3_x59y53 spans 143.59E-144.56E, 15.73S-16.51S.
        let tiles = dea_tiles(Bounds::around(144.05, -15.95, 500.0));
        assert_eq!(tiles.into_iter().collect::<Vec<_>>(), vec![(59, 53)]);
    }

    #[test]
    fn grid_tiles_cover_a_box_crossing_a_degree_line() {
        let source = Source::GridTiles { template: "https://x/{lon}_{lat}.tif".into(), size_degrees: 1.0 };
        let paths = source.paths_for(Bounds { west: 143.9, south: -16.1, east: 144.1, north: -15.9 });
        assert_eq!(paths.len(), 4);
        assert!(paths.contains(&"/vsicurl/https://x/143_-17.tif".to_string()));
        assert!(paths.contains(&"/vsicurl/https://x/144_-16.tif".to_string()));
    }

    #[test]
    fn ten_degree_tiles_name_their_north_west_corner() {
        let source = Source::GridTiles { template: "https://x/lat={north}_lon={west}.tif".into(), size_degrees: 10.0 };
        let paths = source.paths_for(Bounds { west: 143.6, south: -15.5, east: 144.1, north: -14.9 });
        assert_eq!(paths, vec!["/vsicurl/https://x/lat=-10.0_lon=140.0.tif".to_string()]);
    }

    #[test]
    fn clip_urls_carry_the_box() {
        let source = Source::Clip { template: "https://w?subset=Lat({S},{N})&subset=Long({W},{E})".into() };
        let url = source.clip_url(Bounds { west: 143.6, south: -15.5, east: 144.1, north: -14.9 }).unwrap();
        assert_eq!(url, "https://w?subset=Lat(-15.510000,-14.890000)&subset=Long(143.590000,144.110000)");
        assert!(source.paths_for(Bounds { west: 0.0, south: 0.0, east: 1.0, north: 1.0 }).is_empty());
    }
}
