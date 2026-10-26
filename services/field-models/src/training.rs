//! Turn observations into training rows, fit the regional and local models,
//! and produce prediction windows.

use crate::geo::{bearing_deg, haversine_m, Bounds};
use crate::model::{self, block_of, splitmix, Fitted, Importance, Label, Origin, Row, Validation};
use crate::raster::Gdal;
use crate::registry::{LocalStack, RegionalStack, Registry, Scale};
use crate::render::percentile_png;
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Observation {
    pub id: String,
    pub lon: f64,
    pub lat: f64,
    /// "presence" or "absence" (searched and not found).
    pub kind: Label,
    /// "field" for the operator's own finds, "public" for herbarium/ALA records.
    pub origin: Origin,
    #[serde(default)]
    pub uncertainty_m: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FitOptions {
    /// How much one field find counts relative to one public record.
    #[serde(default = "default_field_weight")]
    pub field_weight: f64,
    #[serde(default = "default_true")]
    pub use_public_records: bool,
    /// Public records with a worse stated uncertainty are left out of the local model.
    #[serde(default = "default_local_uncertainty")]
    pub local_max_uncertainty_m: f64,
    /// Cap on public-record windows read for the local model (each is a remote read).
    #[serde(default = "default_public_windows")]
    pub max_public_windows: usize,
    #[serde(default = "default_regional_background")]
    pub regional_background: usize,
    #[serde(default = "default_local_background")]
    pub local_background_per_window: usize,
    /// Background cells drawn across the prototype area.
    #[serde(default = "default_area_background")]
    pub area_background: usize,
    /// Public records farther than this from the prototype area are left out
    /// of the local model (they still inform the regional model).
    #[serde(default = "default_public_radius")]
    pub public_window_radius_km: f64,
    #[serde(default = "default_l2")]
    pub l2: f64,
}

fn default_field_weight() -> f64 {
    5.0
}
fn default_true() -> bool {
    true
}
fn default_local_uncertainty() -> f64 {
    250.0
}
fn default_public_windows() -> usize {
    150
}
fn default_regional_background() -> usize {
    20_000
}
fn default_local_background() -> usize {
    40
}
fn default_area_background() -> usize {
    10_000
}
fn default_public_radius() -> f64 {
    400.0
}
fn default_l2() -> f64 {
    0.002
}

impl Default for FitOptions {
    fn default() -> Self {
        serde_json::from_str("{}").expect("defaults")
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleCard {
    pub presences_field: usize,
    pub presences_public: usize,
    pub absences: usize,
    pub background: usize,
    pub windows: usize,
    pub validation: Validation,
    pub importance: Vec<Importance>,
    pub features: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCard {
    pub model_id: String,
    pub target_id: String,
    pub created_at_unix: u64,
    pub registry_id: String,
    pub registry_sha256: String,
    pub observations_sha256: String,
    pub options: FitOptions,
    pub regional: Option<ScaleCard>,
    pub local: Option<ScaleCard>,
    pub notes: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredModel {
    pub card: ModelCard,
    pub regional: Option<Fitted>,
    pub local: Option<Fitted>,
}

/// Reports progress to whoever is watching the job.
pub trait Progress: Sync {
    fn report(&self, fraction: f64, message: &str);
}

pub struct Engine {
    pub registry: Registry,
    pub registry_hash: String,
    pub gdal: Gdal,
    pub data_dir: PathBuf,
    point_cache: Mutex<PointCache>,
    area: std::sync::RwLock<Option<std::sync::Arc<LocalStack>>>,
}

/// Local feature vectors for points already read, keyed by rounded position,
/// so refitting after a new find only reads the new find's window.
struct PointCache {
    path: PathBuf,
    values: HashMap<(i64, i64), Vec<f32>>,
}

fn point_key(lon: f64, lat: f64) -> (i64, i64) {
    ((lon * 1e5).round() as i64, (lat * 1e5).round() as i64)
}

#[derive(Deserialize, Serialize)]
struct CachedPoint {
    lon: f64,
    lat: f64,
    values: Vec<Option<f32>>,
}

impl PointCache {
    fn open(path: PathBuf) -> Result<Self> {
        let mut values = HashMap::new();
        if path.exists() {
            for line in BufReader::new(std::fs::File::open(&path)?).lines() {
                let line = line?;
                if let Ok(point) = serde_json::from_str::<CachedPoint>(&line) {
                    let row = point.values.into_iter().map(|v| v.unwrap_or(f32::NAN)).collect();
                    values.insert(point_key(point.lon, point.lat), row);
                }
            }
        }
        Ok(Self { path, values })
    }

    fn insert_all(&mut self, points: &[(f64, f64, Vec<f32>)]) -> Result<()> {
        let mut file = OpenOptions::new().create(true).append(true).open(&self.path)?;
        for (lon, lat, row) in points {
            let stored = CachedPoint {
                lon: *lon,
                lat: *lat,
                values: row.iter().map(|v| if v.is_nan() { None } else { Some(*v) }).collect(),
            };
            writeln!(file, "{}", serde_json::to_string(&stored)?)?;
            self.values.insert(point_key(*lon, *lat), row.clone());
        }
        Ok(())
    }
}

/// A local window: a core box around a cluster of observations.
struct Window {
    core: Bounds,
    members: Vec<usize>,
    field: bool,
}

const WINDOW_HALF_M: f64 = 1_500.0;
/// Validation blocks inside the prototype area (~5.5 km).
const AREA_BLOCK_DEGREES: f64 = 0.05;
const CLUSTER_M: f64 = 2_000.0;

fn private_dir(path: &Path) -> Result<()> {
    std::fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

impl Engine {
    pub fn new(registry: Registry, registry_hash: String, data_dir: PathBuf) -> Result<Self> {
        private_dir(&data_dir)?;
        let gdal = Gdal::new(data_dir.join("scratch"))?;
        let cache_dir = data_dir.join("cache");
        private_dir(&cache_dir)?;
        let point_cache = PointCache::open(cache_dir.join(format!("local-points-{}.jsonl", registry.local_signature())))?;
        Ok(Self { registry, registry_hash, gdal, data_dir, point_cache: Mutex::new(point_cache), area: Default::default() })
    }

    fn area_dir(&self) -> Option<PathBuf> {
        let area = self.registry.area.as_ref()?;
        Some(self.cache_dir().join(format!("area-{}-{}", area.id, self.registry.local_signature())))
    }

    pub fn area_ready(&self) -> bool {
        self.area_dir().is_some_and(|d| d.join("meta.json").exists())
    }

    pub fn build_area(&self, progress: &dyn Progress) -> Result<()> {
        let area = self.registry.area.as_ref().context("no prototype area configured")?;
        progress.report(0.05, &format!("Reading every landscape layer for {}", area.title));
        let stack = LocalStack::build(&self.registry, &self.gdal, area.bounds)?;
        progress.report(0.9, "Saving the area grids");
        stack.save(&self.area_dir().unwrap())?;
        *self.area.write().unwrap() = Some(std::sync::Arc::new(stack));
        Ok(())
    }

    /// The prototype area's feature stack, if it has been built.
    pub fn area_stack(&self) -> Option<std::sync::Arc<LocalStack>> {
        if let Some(stack) = self.area.read().unwrap().as_ref() {
            return Some(stack.clone());
        }
        if !self.area_ready() {
            return None;
        }
        let stack = std::sync::Arc::new(LocalStack::load(&self.registry, &self.area_dir()?).ok()?);
        *self.area.write().unwrap() = Some(stack.clone());
        Some(stack)
    }

    pub fn cache_dir(&self) -> PathBuf {
        self.data_dir.join("cache")
    }

    pub fn models_dir(&self) -> PathBuf {
        self.data_dir.join("models")
    }

    pub fn regional_missing(&self) -> Vec<String> {
        RegionalStack::missing(&self.registry, &self.cache_dir())
    }

    pub fn build_regional(&self, progress: &dyn Progress) -> Result<()> {
        let missing = self.regional_missing();
        for (i, raster) in missing.iter().enumerate() {
            progress.report(i as f64 / missing.len() as f64, &format!("Reading {raster} for all of Australia"));
            RegionalStack::build_raster(&self.registry, &self.cache_dir(), &self.gdal, raster)?;
        }
        progress.report(1.0, "Regional grids ready");
        Ok(())
    }

    pub fn load_regional(&self) -> Result<RegionalStack> {
        RegionalStack::load(&self.registry, &self.cache_dir())
    }

    fn feature_ids(&self, scale: Scale) -> Vec<String> {
        self.registry.features_at(scale).iter().map(|f| f.id.clone()).collect()
    }

    pub fn fit(
        &self,
        target_id: &str,
        observations: &[Observation],
        options: &FitOptions,
        progress: &dyn Progress,
    ) -> Result<StoredModel> {
        if !target_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') || target_id.is_empty() {
            bail!("invalid target id");
        }
        let observations: Vec<Observation> = observations
            .iter()
            .filter(|o| options.use_public_records || o.origin == Origin::Field)
            .filter(|o| o.lon.is_finite() && o.lat.is_finite() && o.kind != Label::Background)
            .cloned()
            .collect();
        let mut notes = Vec::new();

        progress.report(0.02, "Loading the continental grids");
        let regional_stack = self.load_regional().context("regional grids are not built yet")?;
        let (regional, regional_card) = self.fit_regional(&regional_stack, &observations, options, &mut notes)?;
        progress.report(0.15, "Continental model fitted; reading landscape windows");

        let (local, local_card) = match self.fit_local(&observations, options, &mut notes, progress) {
            Ok((model, card)) => (Some(model), Some(card)),
            Err(error) => {
                notes.push(format!("Local model not fitted: {error:#}"));
                (None, None)
            }
        };

        let observations_sha256 = crate::registry::sha256_hex(&serde_json::to_vec(&observations)?);
        let created = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs();
        let model_id = format!("{target_id}-{created}-{}", &observations_sha256[..8]);
        let stored = StoredModel {
            card: ModelCard {
                model_id: model_id.clone(),
                target_id: target_id.to_string(),
                created_at_unix: created,
                registry_id: self.registry.registry_id.clone(),
                registry_sha256: self.registry_hash.clone(),
                observations_sha256,
                options: options.clone(),
                regional: Some(regional_card),
                local: local_card,
                notes,
            },
            regional: Some(regional),
            local,
        };

        progress.report(0.95, "Drawing the continental map");
        let dir = self.models_dir().join(&model_id);
        private_dir(&dir)?;
        let (bounds, width, height, percentiles) = self.regional_surface(&regional_stack, stored.regional.as_ref().unwrap());
        std::fs::write(dir.join("regional.png"), percentile_png(width, height, &percentiles)?)?;
        std::fs::write(dir.join("regional-bounds.json"), serde_json::to_vec(&bounds)?)?;
        if let (Some(area), Some(regional_model)) = (self.area_stack(), stored.regional.as_ref()) {
            progress.report(0.97, "Drawing the prototype-area map");
            let (bounds, width, height, scores) = self.area_surface(&area, &regional_stack, regional_model, stored.local.as_ref());
            // Rank within the area itself: "better than 90% of the station".
            let percentiles = rank_within(&scores);
            std::fs::write(dir.join("area.png"), percentile_png(width, height, &percentiles)?)?;
            std::fs::write(dir.join("area-bounds.json"), serde_json::to_vec(&bounds)?)?;
            let spots = best_spots(bounds, width, height, &percentiles, AREA_SPOTS, AREA_SPOT_SPACING_M);
            std::fs::write(dir.join("area-spots.json"), serde_json::to_vec(&spots)?)?;
        }
        std::fs::write(dir.join("model.json"), serde_json::to_vec_pretty(&stored)?)?;
        progress.report(1.0, "Model ready");
        Ok(stored)
    }

    fn fit_regional(
        &self,
        stack: &RegionalStack,
        observations: &[Observation],
        options: &FitOptions,
        notes: &mut Vec<String>,
    ) -> Result<(Fitted, ScaleCard)> {
        let feature_ids = self.feature_ids(Scale::Regional);
        let (bounds, width, height) = stack.shape();
        let cell = (bounds.east - bounds.west) / width as f64;
        let mut rows = Vec::new();
        // One public record per regional cell: herbarium collecting is clustered.
        let mut seen_public_cells = std::collections::HashSet::new();
        let (mut field, mut public, mut absences, mut outside) = (0, 0, 0, 0);
        for o in observations {
            if !bounds.contains(o.lon, o.lat) {
                outside += 1;
                continue;
            }
            let values = stack.sample(o.lon, o.lat);
            if values.iter().all(|v| v.is_nan()) {
                outside += 1;
                continue;
            }
            if o.origin == Origin::Public {
                let cell_key = (((o.lon - bounds.west) / cell) as i64, ((bounds.north - o.lat) / cell) as i64, o.kind == Label::Presence);
                if !seen_public_cells.insert(cell_key) {
                    continue;
                }
            }
            let weight = if o.origin == Origin::Field { options.field_weight } else { 1.0 };
            match (o.kind, o.origin) {
                (Label::Presence, Origin::Field) => field += 1,
                (Label::Presence, _) => public += 1,
                _ => absences += 1,
            }
            rows.push(Row { values, label: o.kind, origin: o.origin, weight, block: block_of(o.lon, o.lat, 2.0)});
        }
        if outside > 0 {
            notes.push(format!("{outside} observations fall outside the continental grid and were not used regionally."));
        }

        // Background: deterministic random land cells.
        let mut state = 0x5eed_u64;
        let mut background = 0;
        let mut attempts = 0;
        while background < options.regional_background && attempts < options.regional_background * 20 {
            attempts += 1;
            state = splitmix(state);
            let col = (state % width as u64) as usize;
            state = splitmix(state);
            let row = (state % height as u64) as usize;
            if !stack.is_land(col, row) {
                continue;
            }
            let (lon, lat) = (bounds.west + (col as f64 + 0.5) * cell, bounds.north - (row as f64 + 0.5) * cell);
            rows.push(Row {
                values: stack.cell_values(col, row),
                label: Label::Background,
                origin: Origin::Generated,
                weight: 1.0,
                block: block_of(lon, lat, 2.0),
            });
            background += 1;
        }

        let refs: Vec<&Row> = rows.iter().collect();
        let fitted = model::fit(&feature_ids, &refs, options.l2)?;
        let validation = model::validate(&feature_ids, &rows, options.l2, 5);
        let importance = model::permutation_importance(&fitted, &rows);
        if public > 0 {
            notes.push(
                "Public records cluster near roads, towns and herbaria; the continental map partly reflects where people collect."
                    .into(),
            );
        }
        let features = fitted.active_feature_ids().into_iter().map(String::from).collect();
        Ok((
            fitted,
            ScaleCard {
                presences_field: field,
                presences_public: public,
                absences,
                background,
                windows: 0,
                validation,
                importance,
                features,
            },
        ))
    }

    fn windows_for(&self, observations: &[Observation], options: &FitOptions, area: Option<&LocalStack>) -> Vec<Window> {
        let mut windows: Vec<Window> = Vec::new();
        let area_centre = area.map(|a| a.core.centre());
        let mut field_first: Vec<usize> = (0..observations.len()).collect();
        field_first.sort_by_key(|&i| (observations[i].origin != Origin::Field, i));
        let mut public_windows = 0;
        for i in field_first {
            let o = &observations[i];
            if o.origin == Origin::Public && o.uncertainty_m.is_none_or(|u| u > options.local_max_uncertainty_m) {
                continue;
            }
            if let Some(area) = area {
                if area.core.contains(o.lon, o.lat) {
                    continue;
                }
            }
            if let (Some((alon, alat)), Origin::Public) = (area_centre, o.origin) {
                if haversine_m(alon, alat, o.lon, o.lat) > options.public_window_radius_km * 1000.0 {
                    continue;
                }
            }
            if let Some(w) = windows.iter_mut().find(|w| {
                let (lon, lat) = w.core.centre();
                haversine_m(lon, lat, o.lon, o.lat) <= CLUSTER_M
            }) {
                w.members.push(i);
                w.field |= o.origin == Origin::Field;
                continue;
            }
            if o.origin == Origin::Public {
                if public_windows >= options.max_public_windows {
                    continue;
                }
                public_windows += 1;
            }
            windows.push(Window {
                core: Bounds::around(o.lon, o.lat, WINDOW_HALF_M + CLUSTER_M),
                members: vec![i],
                field: o.origin == Origin::Field,
            });
        }
        windows
    }

    fn fit_local(
        &self,
        observations: &[Observation],
        options: &FitOptions,
        notes: &mut Vec<String>,
        progress: &dyn Progress,
    ) -> Result<(Fitted, ScaleCard)> {
        let feature_ids = self.feature_ids(Scale::Local);
        let area = self.area_stack();
        let windows = self.windows_for(observations, options, area.as_deref());
        if windows.is_empty() && area.is_none() {
            bail!("no observations precise enough for landscape windows");
        }

        // Points to read per window: its members plus seeded background cells.
        let mut plan: Vec<Vec<(f64, f64)>> = Vec::new();
        for window in &windows {
            let mut points: Vec<(f64, f64)> = window.members.iter().map(|&i| (observations[i].lon, observations[i].lat)).collect();
            let (clon, clat) = window.core.centre();
            let mut state = splitmix(point_key(clon, clat).0 as u64 ^ (point_key(clon, clat).1 as u64) << 1);
            let cell = self.registry.local.cell_m;
            for _ in 0..options.local_background_per_window {
                state = splitmix(state);
                let fx = (state >> 11) as f64 / (1u64 << 53) as f64;
                state = splitmix(state);
                let fy = (state >> 11) as f64 / (1u64 << 53) as f64;
                // Snap to the local grid so the cache key is stable across refits.
                let lon = window.core.west + fx * (window.core.east - window.core.west);
                let lat = window.core.south + fy * (window.core.north - window.core.south);
                let snap = cell / 111_320.0;
                points.push(((lon / snap).round() * snap, (lat / snap).round() * snap));
            }
            plan.push(points);
        }

        let to_read: Vec<usize> = {
            let cache = self.point_cache.lock().unwrap();
            (0..windows.len())
                .filter(|&w| plan[w].iter().any(|&(lon, lat)| !cache.values.contains_key(&point_key(lon, lat))))
                .collect()
        };
        let mut read_failures = 0;
        for (n, &w) in to_read.iter().enumerate() {
            progress.report(
                0.15 + 0.7 * n as f64 / to_read.len().max(1) as f64,
                &format!("Reading landscape window {} of {}", n + 1, to_read.len()),
            );
            match LocalStack::build(&self.registry, &self.gdal, windows[w].core) {
                Ok(stack) => {
                    let sampled: Vec<(f64, f64, Vec<f32>)> =
                        plan[w].iter().map(|&(lon, lat)| (lon, lat, stack.sample(lon, lat))).collect();
                    self.point_cache.lock().unwrap().insert_all(&sampled)?;
                }
                Err(error) => {
                    read_failures += 1;
                    if windows[w].field {
                        notes.push(format!("Could not read the landscape around a field find: {error:#}"));
                    }
                }
            }
        }
        if read_failures > 0 {
            notes.push(format!("{read_failures} landscape windows could not be read and were skipped."));
        }

        let cache = self.point_cache.lock().unwrap();
        let mut rows = Vec::new();
        let (mut field, mut public, mut absences, mut background) = (0, 0, 0, 0);
        for (w, window) in windows.iter().enumerate() {
            // Hold whole landscapes out together in validation.
            let (clon, clat) = window.core.centre();
            let block = block_of(clon, clat, 0.25);
            for (k, &(lon, lat)) in plan[w].iter().enumerate() {
                let Some(values) = cache.values.get(&point_key(lon, lat)) else { continue };
                if values.iter().all(|v| v.is_nan()) {
                    continue;
                }
                if k < window.members.len() {
                    let o = &observations[window.members[k]];
                    let weight = if o.origin == Origin::Field { options.field_weight } else { 1.0 };
                    match (o.kind, o.origin) {
                        (Label::Presence, Origin::Field) => field += 1,
                        (Label::Presence, _) => public += 1,
                        _ => absences += 1,
                    }
                    rows.push(Row { values: values.clone(), label: o.kind, origin: o.origin, weight, block });
                } else {
                    background += 1;
                    rows.push(Row { values: values.clone(), label: Label::Background, origin: Origin::Generated, weight: 1.0, block });
                }
            }
        }
        drop(cache);

        // Inside the prototype area: finds and absences read the cached stack,
        // and the background is the whole area.
        if let Some(area) = &area {
            for o in observations {
                if !area.core.contains(o.lon, o.lat) {
                    continue;
                }
                let values = area.sample(o.lon, o.lat);
                if values.iter().all(|v| v.is_nan()) {
                    continue;
                }
                let weight = if o.origin == Origin::Field { options.field_weight } else { 1.0 };
                match (o.kind, o.origin) {
                    (Label::Presence, Origin::Field) => field += 1,
                    (Label::Presence, _) => public += 1,
                    _ => absences += 1,
                }
                rows.push(Row { values, label: o.kind, origin: o.origin, weight, block: block_of(o.lon, o.lat, AREA_BLOCK_DEGREES)});
            }
            let frame = area.frame();
            let mut state = 0xa5ea_u64;
            let mut drawn = 0;
            let mut attempts = 0;
            while drawn < options.area_background && attempts < options.area_background * 20 {
                attempts += 1;
                state = splitmix(state);
                let col = (state % frame.width as u64) as usize;
                state = splitmix(state);
                let row = (state % frame.height as u64) as usize;
                let (lon, lat) = frame.cell_centre(col, row);
                if !area.core.contains(lon, lat) {
                    continue;
                }
                let values = area.cell_values(col, row);
                if values.iter().all(|v| v.is_nan()) {
                    continue;
                }
                rows.push(Row { values, label: Label::Background, origin: Origin::Generated, weight: 1.0, block: block_of(lon, lat, AREA_BLOCK_DEGREES)});
                drawn += 1;
                background += 1;
            }
        }
        if field + public < 2 {
            bail!("need at least two presences with readable landscape data");
        }
        progress.report(0.88, "Fitting the landscape model");
        let refs: Vec<&Row> = rows.iter().collect();
        let fitted = model::fit(&feature_ids, &refs, options.l2)?;
        let validation = model::validate(&feature_ids, &rows, options.l2, 5);
        let importance = model::permutation_importance(&fitted, &rows);
        let features = fitted.active_feature_ids().into_iter().map(String::from).collect();
        Ok((
            fitted,
            ScaleCard { presences_field: field, presences_public: public, absences, background, windows: windows.len(), validation, importance, features },
        ))
    }

    fn regional_surface(&self, stack: &RegionalStack, model: &Fitted) -> (Bounds, usize, usize, Vec<f32>) {
        let (bounds, width, height) = stack.shape();
        let mut percentiles = vec![f32::NAN; width * height];
        for row in 0..height {
            for col in 0..width {
                if stack.is_land(col, row) {
                    percentiles[row * width + col] = model.percentile(model.score(&stack.cell_values(col, row))) as f32;
                }
            }
        }
        (bounds, width, height, percentiles)
    }

    /// Combined percentile at one place: the landscape model, tempered by the continental niche.
    fn combined(local: Option<(&Fitted, &[f32])>, regional_p: f64) -> f64 {
        match local {
            Some((model, values)) if !values.iter().all(|v| v.is_nan()) => 0.75 * model.percentile(model.score(values)) + 0.25 * regional_p,
            Some(_) => f64::NAN,
            None => regional_p,
        }
    }

    /// The whole prototype area at the local cell size, cropped to its core.
    fn area_surface(&self, area: &LocalStack, regional: &RegionalStack, regional_model: &Fitted, local: Option<&Fitted>) -> (Bounds, usize, usize, Vec<f32>) {
        let frame = area.frame();
        let (c0, r0, width, height, bounds) = core_window(area);
        let mut percentiles = vec![f32::NAN; width * height];
        for r in 0..height {
            for c in 0..width {
                let (lon, lat) = frame.cell_centre(c0 + c, r0 + r);
                let regional_p = regional_model.percentile(regional_model.score(&regional.sample(lon, lat)));
                let values = area.cell_values(c0 + c, r0 + r);
                percentiles[r * width + c] = Self::combined(local.map(|m| (m, values.as_slice())), regional_p) as f32;
            }
        }
        (bounds, width, height, percentiles)
    }

    /// A private basemap of the prototype area drawn from its own layers:
    /// hillshade, tinted by green cover, with surface water in blue.
    pub fn area_basemap(&self) -> Result<(Bounds, Vec<u8>)> {
        let area = self.area_stack().context("prototype area is not built")?;
        let dir = self.area_dir().context("no prototype area")?;
        let (c0, r0, width, height, bounds) = core_window(&area);
        let path = dir.join("basemap.png");
        if let Ok(png) = std::fs::read(&path) {
            return Ok((bounds, png));
        }
        let index = |id: &str| area.features.iter().position(|f| f.id == id);
        let elevation = &area.grids[index("elevation").context("no elevation feature")?];
        let water = index("water_frequency").map(|i| &area.grids[i]);
        let green = index("green_cover").map(|i| &area.grids[i]);
        let png = crate::render::basemap_png(elevation, water, green, c0, r0, width, height)?;
        std::fs::write(&path, &png)?;
        Ok((bounds, png))
    }

    pub fn load_model(&self, model_id: &str) -> Result<StoredModel> {
        if !model_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
            bail!("invalid model id");
        }
        let bytes = std::fs::read(self.models_dir().join(model_id).join("model.json")).context("model not found")?;
        Ok(serde_json::from_slice(&bytes)?)
    }

    /// Predict a landscape window around a point: a map image plus the best
    /// spots to walk to, combining the continental and landscape models.
    pub fn predict_window(&self, stored: &StoredModel, lon: f64, lat: f64, radius_m: f64, regional: &RegionalStack) -> Result<WindowPrediction> {
        let radius_m = radius_m.clamp(300.0, 4_000.0);
        let core = Bounds::around(lon, lat, radius_m);
        let local_model = stored.local.as_ref();
        let regional_model = stored.regional.as_ref().context("model has no continental part")?;
        // Inside the prototype area the cached stack answers without remote reads.
        let area = self.area_stack().filter(|a| a.frame().bounds.contains(core.west, core.south) && a.frame().bounds.contains(core.east, core.north));
        let stack = match (local_model, &area) {
            (Some(_), Some(area)) => Some(area.clone()),
            (Some(_), None) => Some(std::sync::Arc::new(LocalStack::build(&self.registry, &self.gdal, core)?)),
            (None, _) => None,
        };
        let (width, height) = core.pixels_for(self.registry.local.cell_m);
        let (dlon, dlat) = ((core.east - core.west) / width as f64, (core.north - core.south) / height as f64);
        let mut percentiles = vec![f32::NAN; width * height];
        let mut candidates = Vec::new();
        let regional_percentile = regional_model.percentile(regional_model.score(&regional.sample(lon, lat)));
        for r in 0..height {
            for c in 0..width {
                let (x, y) = (core.west + (c as f64 + 0.5) * dlon, core.north - (r as f64 + 0.5) * dlat);
                if haversine_m(lon, lat, x, y) > radius_m {
                    continue;
                }
                let regional_values = regional.sample(x, y);
                let regional_p = regional_model.percentile(regional_model.score(&regional_values));
                let values = stack.as_ref().map(|s| s.sample(x, y));
                let p = Self::combined(local_model.zip(values.as_deref()), regional_p);
                percentiles[r * width + c] = p as f32;
                if p.is_finite() {
                    candidates.push((p, x, y));
                }
            }
        }
        candidates.sort_by(|a, b| b.0.total_cmp(&a.0));
        let mut spots: Vec<Spot> = Vec::new();
        for (p, x, y) in candidates {
            if spots.len() >= 12 {
                break;
            }
            if spots.iter().any(|s| haversine_m(s.lon, s.lat, x, y) < 200.0) {
                continue;
            }
            spots.push(Spot {
                lon: x,
                lat: y,
                percentile: p,
                distance_m: haversine_m(lon, lat, x, y),
                bearing_deg: bearing_deg(lon, lat, x, y),
            });
        }
        let png = percentile_png(width, height, &percentiles)?;
        let mut coverage = BTreeMap::new();
        if let Some(stack) = &stack {
            coverage = stack.coverage.clone();
        }
        Ok(WindowPrediction { bounds: core, cell_m: self.registry.local.cell_m, png, spots, regional_percentile, coverage, used_local_model: local_model.is_some() })
    }
}

/// Spots kept for offline use across the prototype area.
const AREA_SPOTS: usize = 1_500;
const AREA_SPOT_SPACING_M: f64 = 300.0;

/// Each finite value's percentile rank among all finite values (0–100).
fn rank_within(values: &[f32]) -> Vec<f32> {
    let mut order: Vec<usize> = (0..values.len()).filter(|&i| values[i].is_finite()).collect();
    order.sort_by(|&a, &b| values[a].total_cmp(&values[b]));
    let mut ranks = vec![f32::NAN; values.len()];
    let n = order.len().max(1) as f32;
    for (rank, &i) in order.iter().enumerate() {
        ranks[i] = 100.0 * rank as f32 / n;
    }
    ranks
}

/// The core of an area stack as a cell window of its padded frame.
pub fn core_window(area: &LocalStack) -> (usize, usize, usize, usize, Bounds) {
    let frame = area.frame();
    let (c0, r0) = frame.cell_of(area.core.west, area.core.north).unwrap_or((0, 0));
    let (c1, r1) = frame.cell_of(area.core.east, area.core.south).unwrap_or((frame.width - 1, frame.height - 1));
    let (dlon, dlat) = frame.cell_degrees();
    let bounds = Bounds {
        west: frame.bounds.west + c0 as f64 * dlon,
        east: frame.bounds.west + (c1 + 1) as f64 * dlon,
        north: frame.bounds.north - r0 as f64 * dlat,
        south: frame.bounds.north - (r1 + 1) as f64 * dlat,
    };
    (c0, r0, c1 - c0 + 1, r1 - r0 + 1, bounds)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AreaSpot {
    pub lon: f64,
    pub lat: f64,
    pub percentile: f64,
}

/// The highest-scoring cells, at least `spacing_m` apart, best first.
fn best_spots(bounds: Bounds, width: usize, height: usize, percentiles: &[f32], limit: usize, spacing_m: f64) -> Vec<AreaSpot> {
    let (dlon, dlat) = ((bounds.east - bounds.west) / width as f64, (bounds.north - bounds.south) / height as f64);
    let mut order: Vec<usize> = (0..percentiles.len()).filter(|&i| percentiles[i] >= 90.0).collect();
    order.sort_by(|&a, &b| percentiles[b].total_cmp(&percentiles[a]));
    let mut spots: Vec<AreaSpot> = Vec::new();
    for i in order {
        if spots.len() >= limit {
            break;
        }
        let (c, r) = (i % width, i / width);
        let (lon, lat) = (bounds.west + (c as f64 + 0.5) * dlon, bounds.north - (r as f64 + 0.5) * dlat);
        if spots.iter().any(|s| haversine_m(s.lon, s.lat, lon, lat) < spacing_m) {
            continue;
        }
        spots.push(AreaSpot { lon, lat, percentile: percentiles[i] as f64 });
    }
    spots
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranks_are_relative_to_the_area() {
        let ranks = rank_within(&[10.0, f32::NAN, 30.0, 20.0]);
        assert_eq!(ranks[0], 0.0);
        assert!(ranks[1].is_nan());
        assert!((ranks[2] - 66.666).abs() < 0.01);
    }

    #[test]
    fn spots_are_spaced_and_best_first() {
        let bounds = Bounds { west: 0.0, south: 0.0, east: 0.01, north: 0.01 };
        let mut p = vec![0.0f32; 100];
        p[0] = 99.0;
        p[1] = 98.0; // ~110 m from the best: suppressed
        p[99] = 95.0;
        let spots = best_spots(bounds, 10, 10, &p, 10, 300.0);
        assert_eq!(spots.len(), 2);
        assert_eq!(spots[0].percentile, 99.0);
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Spot {
    pub lon: f64,
    pub lat: f64,
    pub percentile: f64,
    pub distance_m: f64,
    pub bearing_deg: f64,
}

pub struct WindowPrediction {
    pub bounds: Bounds,
    pub cell_m: f64,
    pub png: Vec<u8>,
    pub spots: Vec<Spot>,
    pub regional_percentile: f64,
    pub coverage: BTreeMap<String, f64>,
    pub used_local_model: bool,
}
