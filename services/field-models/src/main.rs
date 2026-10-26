//! field-modeld: a localhost service that fits species/site suitability
//! models from field finds and public records against national rasters.
//! mobtranslate's admin API is its only client; it holds the observations
//! and enforces who may see them.

mod geo;
mod model;
mod raster;
mod registry;
mod render;
mod sources;
mod terrain;
mod training;

use anyhow::{Context, Result};
use axum::body::Bytes;
use axum::extract::{Path as UrlPath, Request, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::Engine as _;
use registry::{RegionalStack, Registry};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use training::{Engine, FitOptions, Observation, Progress};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobStatus {
    id: String,
    kind: String,
    state: &'static str,
    progress: f64,
    message: String,
    result: Option<Value>,
    error: Option<String>,
}

struct Job(Mutex<JobStatus>);

impl Progress for Job {
    fn report(&self, fraction: f64, message: &str) {
        let mut status = self.0.lock().unwrap();
        status.progress = fraction.clamp(0.0, 1.0);
        status.message = message.to_string();
    }
}

struct AppState {
    engine: Arc<Engine>,
    token: String,
    jobs: Mutex<HashMap<String, Arc<Job>>>,
    regional: RwLock<Option<Arc<RegionalStack>>>,
    /// Heavy jobs (regional builds, fits) run one at a time.
    heavy: Arc<tokio::sync::Semaphore>,
}

type Shared = Arc<AppState>;

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(json!({ "error": message.into() }))).into_response()
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

async fn require_token(State(state): State<Shared>, request: Request, next: Next) -> Response {
    let supplied = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or_default();
    if !constant_time_eq(supplied.as_bytes(), state.token.as_bytes()) {
        return error(StatusCode::UNAUTHORIZED, "unauthorized");
    }
    next.run(request).await
}

fn regional(state: &AppState) -> Result<Arc<RegionalStack>> {
    if let Some(stack) = state.regional.read().unwrap().as_ref() {
        return Ok(stack.clone());
    }
    let stack = Arc::new(state.engine.load_regional()?);
    *state.regional.write().unwrap() = Some(stack.clone());
    Ok(stack)
}

fn start_job<F>(state: &Shared, kind: &str, work: F) -> Response
where
    F: FnOnce(&Engine, &Job) -> Result<Value> + Send + 'static,
{
    let id = format!("{kind}-{}", model::splitmix(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos() as u64) % 1_000_000_000_000);
    let job = Arc::new(Job(Mutex::new(JobStatus {
        id: id.clone(),
        kind: kind.to_string(),
        state: "queued",
        progress: 0.0,
        message: "Waiting for the previous job to finish".into(),
        result: None,
        error: None,
    })));
    {
        let mut jobs = state.jobs.lock().unwrap();
        // Keep the job table small; finished jobs only need to outlive their poller.
        if jobs.len() > 200 {
            jobs.retain(|_, j| matches!(j.0.lock().unwrap().state, "queued" | "running"));
        }
        jobs.insert(id.clone(), job.clone());
    }
    let engine = state.engine.clone();
    let heavy = state.heavy.clone();
    tokio::spawn(async move {
        let _permit = heavy.acquire_owned().await;
        job.0.lock().unwrap().state = "running";
        let worker = job.clone();
        let outcome = tokio::task::spawn_blocking(move || work(&engine, &worker)).await;
        let mut status = job.0.lock().unwrap();
        match outcome {
            Ok(Ok(result)) => {
                status.state = "done";
                status.progress = 1.0;
                status.result = Some(result);
            }
            Ok(Err(e)) => {
                status.state = "failed";
                status.error = Some(format!("{e:#}"));
            }
            Err(e) => {
                status.state = "failed";
                status.error = Some(format!("job panicked: {e}"));
            }
        }
    });
    (StatusCode::ACCEPTED, Json(json!({ "jobId": id }))).into_response()
}

async fn health(State(state): State<Shared>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "registryId": state.engine.registry.registry_id,
        "regionalMissing": state.engine.regional_missing(),
        "area": state.engine.registry.area,
        "areaReady": state.engine.area_ready(),
    }))
}

async fn get_registry(State(state): State<Shared>) -> Json<Value> {
    Json(json!({ "registry": state.engine.registry, "sha256": state.engine.registry_hash }))
}

async fn build_regional(State(state): State<Shared>) -> Response {
    let shared = state.clone();
    start_job(&state, "regional", move |engine, job| {
        engine.build_regional(job)?;
        *shared.regional.write().unwrap() = None;
        Ok(json!({ "missing": engine.regional_missing() }))
    })
}

async fn build_area(State(state): State<Shared>) -> Response {
    if state.engine.registry.area.is_none() {
        return error(StatusCode::NOT_FOUND, "no prototype area configured");
    }
    start_job(&state, "area", move |engine, job| {
        engine.build_area(job)?;
        Ok(json!({ "areaReady": engine.area_ready() }))
    })
}

async fn area_basemap(State(state): State<Shared>) -> Response {
    let engine = state.engine.clone();
    match tokio::task::spawn_blocking(move || engine.area_basemap()).await {
        Ok(Ok((bounds, png))) => png_response(png, &serde_json::to_vec(&bounds).unwrap_or_default()),
        Ok(Err(e)) => error(StatusCode::NOT_FOUND, format!("{e:#}")),
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, format!("{e}")),
    }
}

fn png_response(png: Vec<u8>, bounds: &[u8]) -> Response {
    let mut response = Bytes::from(png).into_response();
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("image/png"));
    if let Ok(value) = HeaderValue::from_bytes(bounds) {
        headers.insert("x-bounds", value);
    }
    response
}

async fn area_spots(State(state): State<Shared>, UrlPath(id): UrlPath<String>) -> Response {
    if state.engine.load_model(&id).is_err() {
        return error(StatusCode::NOT_FOUND, "no such model");
    }
    match std::fs::read(state.engine.models_dir().join(&id).join("area-spots.json")) {
        Ok(bytes) => ([(header::CONTENT_TYPE, "application/json")], bytes).into_response(),
        Err(_) => error(StatusCode::NOT_FOUND, "no area spots for this model"),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FitRequest {
    target_id: String,
    observations: Vec<Observation>,
    #[serde(default)]
    options: FitOptions,
}

async fn fit(State(state): State<Shared>, Json(request): Json<FitRequest>) -> Response {
    if !state.engine.regional_missing().is_empty() {
        return error(StatusCode::CONFLICT, "continental grids are not built yet; build them first");
    }
    if request.observations.len() > 200_000 {
        return error(StatusCode::PAYLOAD_TOO_LARGE, "too many observations");
    }
    start_job(&state, "fit", move |engine, job| {
        let stored = engine.fit(&request.target_id, &request.observations, &request.options, job)?;
        Ok(serde_json::to_value(&stored.card)?)
    })
}

async fn job_status(State(state): State<Shared>, UrlPath(id): UrlPath<String>) -> Response {
    let job = state.jobs.lock().unwrap().get(&id).cloned();
    match job {
        Some(job) => Json(job.0.lock().unwrap().clone()).into_response(),
        None => error(StatusCode::NOT_FOUND, "no such job"),
    }
}

async fn model_card(State(state): State<Shared>, UrlPath(id): UrlPath<String>) -> Response {
    let engine = state.engine.clone();
    match tokio::task::spawn_blocking(move || engine.load_model(&id)).await {
        Ok(Ok(stored)) => Json(stored.card).into_response(),
        _ => error(StatusCode::NOT_FOUND, "no such model"),
    }
}

async fn regional_png(State(state): State<Shared>, UrlPath(id): UrlPath<String>) -> Response {
    model_png(&state, &id, "regional")
}

async fn area_png(State(state): State<Shared>, UrlPath(id): UrlPath<String>) -> Response {
    model_png(&state, &id, "area")
}

fn model_png(state: &AppState, id: &str, name: &str) -> Response {
    if state.engine.load_model(id).is_err() {
        return error(StatusCode::NOT_FOUND, "no such model");
    }
    let dir = state.engine.models_dir().join(id);
    let (Ok(png), Ok(bounds)) = (std::fs::read(dir.join(format!("{name}.png"))), std::fs::read(dir.join(format!("{name}-bounds.json")))) else {
        return error(StatusCode::NOT_FOUND, "no map");
    };
    png_response(png, &bounds)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WindowRequest {
    lon: f64,
    lat: f64,
    #[serde(default = "default_radius")]
    radius_m: f64,
}

fn default_radius() -> f64 {
    2_000.0
}

async fn predict_window(State(state): State<Shared>, UrlPath(id): UrlPath<String>, Json(request): Json<WindowRequest>) -> Response {
    if !(request.lon.is_finite() && request.lat.is_finite() && (-90.0..=90.0).contains(&request.lat)) {
        return error(StatusCode::BAD_REQUEST, "invalid position");
    }
    let shared = state.clone();
    let outcome = tokio::task::spawn_blocking(move || -> Result<Value> {
        let stored = shared.engine.load_model(&id)?;
        let stack = regional(&shared)?;
        let prediction = shared.engine.predict_window(&stored, request.lon, request.lat, request.radius_m, &stack)?;
        Ok(json!({
            "bounds": prediction.bounds,
            "cellM": prediction.cell_m,
            "spots": prediction.spots,
            "regionalPercentile": prediction.regional_percentile,
            "coverage": prediction.coverage,
            "usedLocalModel": prediction.used_local_model,
            "imagePngBase64": base64::engine::general_purpose::STANDARD.encode(&prediction.png),
        }))
    })
    .await;
    match outcome {
        Ok(Ok(value)) => Json(value).into_response(),
        Ok(Err(e)) => error(StatusCode::UNPROCESSABLE_ENTITY, format!("{e:#}")),
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, format!("{e}")),
    }
}

/// Feature values at points (for enriching a find with its landscape).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SampleRequest {
    lon: f64,
    lat: f64,
}

async fn sample(State(state): State<Shared>, Json(request): Json<SampleRequest>) -> Response {
    let shared = state.clone();
    let outcome = tokio::task::spawn_blocking(move || -> Result<Value> {
        let stack = regional(&shared)?;
        let regional_values = stack.sample(request.lon, request.lat);
        let local = registry::LocalStack::build(&shared.engine.registry, &shared.engine.gdal, geo::Bounds::around(request.lon, request.lat, 60.0))?;
        let local_values = local.sample(request.lon, request.lat);
        let named = |features: &[registry::FeatureSpec], values: &[f32]| -> serde_json::Map<String, Value> {
            features
                .iter()
                .zip(values)
                .map(|(f, v)| (f.id.clone(), if v.is_nan() { Value::Null } else { json!(*v) }))
                .collect()
        };
        Ok(json!({
            "regional": named(&stack.features, &regional_values),
            "local": named(&local.features, &local_values),
        }))
    })
    .await;
    match outcome {
        Ok(Ok(value)) => Json(value).into_response(),
        Ok(Err(e)) => error(StatusCode::UNPROCESSABLE_ENTITY, format!("{e:#}")),
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, format!("{e}")),
    }
}

fn env_path(name: &str) -> Result<PathBuf> {
    Ok(PathBuf::from(std::env::var(name).with_context(|| format!("{name} is not set"))?))
}

#[tokio::main]
async fn main() -> Result<()> {
    let token = std::env::var("FIELD_MODELS_TOKEN").context("FIELD_MODELS_TOKEN is not set")?;
    if token.len() < 32 {
        anyhow::bail!("FIELD_MODELS_TOKEN must be at least 32 characters");
    }
    let (registry, hash) = Registry::load(&env_path("FIELD_MODELS_REGISTRY")?)?;
    let engine = Arc::new(Engine::new(registry, hash, env_path("FIELD_MODELS_DATA_DIR")?)?);
    let bind = std::env::var("FIELD_MODELS_BIND").unwrap_or_else(|_| "127.0.0.1:7877".into());

    let state: Shared = Arc::new(AppState {
        engine,
        token,
        jobs: Mutex::new(HashMap::new()),
        regional: RwLock::new(None),
        heavy: Arc::new(tokio::sync::Semaphore::new(1)),
    });
    let protected = Router::new()
        .route("/registry", get(get_registry))
        .route("/regional/build", post(build_regional))
        .route("/area/build", post(build_area))
        .route("/area/basemap.png", get(area_basemap))
        .route("/fit", post(fit))
        .route("/jobs/{id}", get(job_status))
        .route("/models/{id}", get(model_card))
        .route("/models/{id}/regional.png", get(regional_png))
        .route("/models/{id}/area.png", get(area_png))
        .route("/models/{id}/area-spots", get(area_spots))
        .route("/models/{id}/window", post(predict_window))
        .route("/sample", post(sample))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_token));
    let app = Router::new()
        .route("/health", get(health))
        .merge(protected)
        .layer(axum::extract::DefaultBodyLimit::max(64 * 1024 * 1024))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind).await.with_context(|| format!("bind {bind}"))?;
    eprintln!("field-modeld listening on {bind}");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
