//! Presence/background logistic models with ridge regularisation and
//! linear + quadratic feature terms (equivalent to a MaxEnt model restricted
//! to those feature classes), plus spatial-block validation.

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Label {
    Presence,
    Absence,
    Background,
}

impl Label {
    fn positive(self) -> bool {
        self == Label::Presence
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Origin {
    Field,
    Public,
    Generated,
}

#[derive(Clone, Debug)]
pub struct Row {
    pub values: Vec<f32>,
    pub label: Label,
    pub origin: Origin,
    pub weight: f64,
    /// Spatial block for cross-validation; rows in the same block are held out together.
    pub block: u64,
    /// Background drawn from where people recorded the target's group, not from the land at large.
    pub effort: bool,
    /// False for rows that only score the model in validation.
    pub train: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fitted {
    pub feature_ids: Vec<String>,
    /// Features kept after dropping mostly-missing or constant columns.
    pub active: Vec<bool>,
    pub means: Vec<f64>,
    pub sds: Vec<f64>,
    pub intercept: f64,
    pub linear: Vec<f64>,
    pub quadratic: Vec<f64>,
    pub l2: f64,
    /// Sorted background scores, for turning a score into a landscape percentile.
    pub background_scores: Vec<f64>,
}

const MAX_MISSING_FRACTION: f64 = 0.4;

impl Fitted {
    fn standardised(&self, values: &[f32]) -> Vec<f64> {
        values
            .iter()
            .enumerate()
            .filter(|(i, _)| self.active[*i])
            .map(|(i, &v)| if v.is_nan() { 0.0 } else { ((v as f64 - self.means[i]) / self.sds[i]).clamp(-6.0, 6.0) })
            .collect()
    }

    /// Linear predictor (log relative suitability).
    pub fn score(&self, values: &[f32]) -> f64 {
        let z = self.standardised(values);
        self.intercept
            + z.iter().zip(&self.linear).map(|(x, b)| x * b).sum::<f64>()
            + z.iter().zip(&self.quadratic).map(|(x, b)| x * x * b).sum::<f64>()
    }

    /// Share of the background (the landscape at large) scoring below this
    /// score, 0–100. 95 means "better than 95% of available ground".
    pub fn percentile(&self, score: f64) -> f64 {
        if self.background_scores.is_empty() {
            return f64::NAN;
        }
        let below = self.background_scores.partition_point(|&s| s < score);
        100.0 * below as f64 / self.background_scores.len() as f64
    }

    pub fn active_feature_ids(&self) -> Vec<&str> {
        self.feature_ids.iter().zip(&self.active).filter(|(_, a)| **a).map(|(f, _)| f.as_str()).collect()
    }
}

fn sigmoid(x: f64) -> f64 {
    if x >= 0.0 {
        1.0 / (1.0 + (-x).exp())
    } else {
        let e = x.exp();
        e / (1.0 + e)
    }
}

/// Solve a symmetric positive-definite system with Cholesky.
fn solve_spd(matrix: &mut [f64], rhs: &mut [f64], n: usize) -> Result<()> {
    for j in 0..n {
        let mut diagonal = matrix[j * n + j];
        for k in 0..j {
            diagonal -= matrix[j * n + k] * matrix[j * n + k];
        }
        if diagonal <= 1e-12 {
            bail!("system is not positive definite");
        }
        let diagonal = diagonal.sqrt();
        matrix[j * n + j] = diagonal;
        for i in j + 1..n {
            let mut value = matrix[i * n + j];
            for k in 0..j {
                value -= matrix[i * n + k] * matrix[j * n + k];
            }
            matrix[i * n + j] = value / diagonal;
        }
    }
    for i in 0..n {
        let mut value = rhs[i];
        for k in 0..i {
            value -= matrix[i * n + k] * rhs[k];
        }
        rhs[i] = value / matrix[i * n + i];
    }
    for i in (0..n).rev() {
        let mut value = rhs[i];
        for k in i + 1..n {
            value -= matrix[k * n + i] * rhs[k];
        }
        rhs[i] = value / matrix[i * n + i];
    }
    Ok(())
}

/// Fit on `rows`. Presence weight is rebalanced so presences and
/// non-presences carry equal total weight; within each class the caller's
/// weights set relative importance (e.g. field finds over public records).
pub fn fit(feature_ids: &[String], rows: &[&Row], l2: f64) -> Result<Fitted> {
    let rows: Vec<&Row> = rows.iter().copied().filter(|r| r.train).collect();
    let rows = rows.as_slice();
    let p_all = feature_ids.len();
    let positives = rows.iter().filter(|r| r.label.positive()).count();
    if positives < 2 {
        bail!("need at least two presences, have {positives}");
    }
    if positives == rows.len() {
        bail!("need background or absence rows");
    }

    // Standardise and rank against the land at large, even when the fit's background follows recording effort.
    let landscape: Vec<&&Row> = rows.iter().filter(|r| r.label == Label::Background && !r.effort).collect();
    let background: Vec<&&Row> =
        if landscape.is_empty() { rows.iter().filter(|r| r.label == Label::Background).collect() } else { landscape };
    let reference: Vec<&&Row> = if background.is_empty() { rows.iter().collect() } else { background };
    let mut active = vec![true; p_all];
    let mut means = vec![0.0; p_all];
    let mut sds = vec![1.0; p_all];
    for j in 0..p_all {
        let values: Vec<f64> = reference.iter().map(|r| r.values[j]).filter(|v| !v.is_nan()).map(f64::from).collect();
        let missing = 1.0 - values.len() as f64 / reference.len() as f64;
        if values.len() < 10 || missing > MAX_MISSING_FRACTION {
            active[j] = false;
            continue;
        }
        let mean = values.iter().sum::<f64>() / values.len() as f64;
        let sd = (values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64).sqrt();
        if sd < 1e-9 {
            active[j] = false;
            continue;
        }
        means[j] = mean;
        sds[j] = sd;
    }
    let p = active.iter().filter(|a| **a).count();
    if p == 0 {
        bail!("no usable features (all missing or constant)");
    }

    let mut model = Fitted {
        feature_ids: feature_ids.to_vec(),
        active,
        means,
        sds,
        intercept: 0.0,
        linear: vec![0.0; p],
        quadratic: vec![0.0; p],
        l2,
        background_scores: Vec::new(),
    };

    let design: Vec<Vec<f64>> = rows
        .iter()
        .map(|r| {
            let z = model.standardised(&r.values);
            let mut x = Vec::with_capacity(1 + 2 * p);
            x.push(1.0);
            x.extend(z.iter().copied());
            x.extend(z.iter().map(|v| v * v));
            x
        })
        .collect();
    let labels: Vec<f64> = rows.iter().map(|r| if r.label.positive() { 1.0 } else { 0.0 }).collect();
    let positive_weight: f64 = rows.iter().filter(|r| r.label.positive()).map(|r| r.weight).sum();
    let negative_weight: f64 = rows.iter().filter(|r| !r.label.positive()).map(|r| r.weight).sum();
    let total = positive_weight + negative_weight;
    let weights: Vec<f64> = rows
        .iter()
        .map(|r| {
            let class_total = if r.label.positive() { positive_weight } else { negative_weight };
            r.weight / class_total * total / 2.0
        })
        .collect();
    let weight_sum: f64 = weights.iter().sum();

    let k = 1 + 2 * p;
    let mut beta = vec![0.0; k];
    for _ in 0..50 {
        let mut hessian = vec![0.0; k * k];
        let mut gradient = vec![0.0; k];
        for ((x, &y), &w) in design.iter().zip(&labels).zip(&weights) {
            let eta: f64 = x.iter().zip(&beta).map(|(a, b)| a * b).sum();
            let mu = sigmoid(eta);
            let s = w * mu * (1.0 - mu);
            for a in 0..k {
                gradient[a] += w * (y - mu) * x[a];
                let sa = s * x[a];
                for b in 0..=a {
                    hessian[a * k + b] += sa * x[b];
                }
            }
        }
        // Ridge on everything but the intercept, scaled to the data weight.
        for a in 1..k {
            gradient[a] -= l2 * weight_sum * beta[a];
            hessian[a * k + a] += l2 * weight_sum;
        }
        hessian[0] += 1e-9;
        for a in 0..k {
            for b in 0..a {
                hessian[b * k + a] = hessian[a * k + b];
            }
        }
        let mut step = gradient;
        solve_spd(&mut hessian, &mut step, k)?;
        let change: f64 = step.iter().map(|s| s.abs()).fold(0.0, f64::max);
        for (b, s) in beta.iter_mut().zip(&step) {
            *b += s;
        }
        if change < 1e-7 {
            break;
        }
    }
    model.intercept = beta[0];
    model.linear = beta[1..1 + p].to_vec();
    model.quadratic = beta[1 + p..].to_vec();

    let any_landscape = rows.iter().any(|r| r.label == Label::Background && !r.effort);
    let mut scores: Vec<f64> = rows
        .iter()
        .filter(|r| r.label == Label::Background && !(any_landscape && r.effort))
        .map(|r| model.score(&r.values))
        .collect();
    scores.sort_by(|a, b| a.total_cmp(b));
    model.background_scores = scores;
    Ok(model)
}

/// Area under the ROC curve: presences against the given negatives.
pub fn auc(positive_scores: &[f64], negative_scores: &[f64]) -> Option<f64> {
    if positive_scores.is_empty() || negative_scores.is_empty() {
        return None;
    }
    let mut negatives = negative_scores.to_vec();
    negatives.sort_by(|a, b| a.total_cmp(b));
    let mut sum = 0.0;
    for &s in positive_scores {
        let below = negatives.partition_point(|&n| n < s);
        let equal = negatives[below..].partition_point(|&n| n <= s);
        sum += below as f64 + equal as f64 / 2.0;
    }
    Some(sum / (positive_scores.len() as f64 * negatives.len() as f64))
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Validation {
    pub folds: usize,
    /// Held-out presences (all origins) against held-out background.
    pub spatial_block_auc: Option<f64>,
    /// Held-out field finds only, against held-out background.
    pub field_find_auc: Option<f64>,
    /// Landscape percentile of each field find when its block was held out.
    pub held_out_field_percentiles: Vec<f64>,
    /// Held-out field absences, as landscape percentiles (lower is better).
    pub held_out_absence_percentiles: Vec<f64>,
    /// Held-out presences against held-out places where people recorded the
    /// target's group: how well the model finds the target rather than people.
    #[serde(default)]
    pub effort_auc: Option<f64>,
}

/// Leave-blocks-out validation. Blocks are assigned to `folds` folds; each
/// fold is fitted without its blocks and scored on them.
pub fn validate(feature_ids: &[String], rows: &[Row], l2: f64, folds: usize) -> Validation {
    let mut held_presence = Vec::new();
    let mut held_field = Vec::new();
    let mut held_background = Vec::new();
    let mut held_effort = Vec::new();
    let mut field_percentiles = Vec::new();
    let mut absence_percentiles = Vec::new();
    let mut used = 0;
    for fold in 0..folds as u64 {
        let in_fold = |r: &Row| splitmix(r.block) % folds as u64 == fold;
        let train: Vec<&Row> = rows.iter().filter(|r| !in_fold(r) && r.train).collect();
        let test: Vec<&Row> = rows.iter().filter(|r| in_fold(r)).collect();
        if !test.iter().any(|r| r.label.positive()) {
            continue;
        }
        let Ok(model) = fit(feature_ids, &train, l2) else { continue };
        used += 1;
        for r in test {
            let s = model.score(&r.values);
            match (r.label, r.origin) {
                (Label::Presence, Origin::Field) => {
                    held_presence.push(s);
                    held_field.push(s);
                    field_percentiles.push(model.percentile(s));
                }
                (Label::Presence, _) => held_presence.push(s),
                (Label::Background, _) if r.effort => held_effort.push(s),
                (Label::Background, _) => held_background.push(s),
                (Label::Absence, _) => absence_percentiles.push(model.percentile(s)),
            }
        }
    }
    Validation {
        folds: used,
        spatial_block_auc: auc(&held_presence, &held_background),
        field_find_auc: auc(&held_field, &held_background),
        held_out_field_percentiles: field_percentiles,
        held_out_absence_percentiles: absence_percentiles,
        effort_auc: auc(&held_presence, &held_effort),
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Importance {
    pub feature_id: String,
    /// Drop in training AUC when the feature's values are shuffled.
    pub auc_drop: f64,
}

pub fn permutation_importance(model: &Fitted, rows: &[Row]) -> Vec<Importance> {
    let score_all = |rows: &[Row], column: Option<(usize, &[f32])>| -> (Vec<f64>, Vec<f64>) {
        let mut positives = Vec::new();
        let mut negatives = Vec::new();
        for (i, r) in rows.iter().enumerate() {
            if !r.train {
                continue;
            }
            let s = match column {
                Some((j, shuffled)) => {
                    let mut values = r.values.clone();
                    values[j] = shuffled[i];
                    model.score(&values)
                }
                None => model.score(&r.values),
            };
            if r.label.positive() {
                positives.push(s);
            } else if r.label == Label::Background {
                negatives.push(s);
            }
        }
        (positives, negatives)
    };
    let (p, n) = score_all(rows, None);
    let Some(base) = auc(&p, &n) else { return Vec::new() };
    let mut out = Vec::new();
    for (j, id) in model.feature_ids.iter().enumerate() {
        if !model.active[j] {
            continue;
        }
        let mut shuffled: Vec<f32> = rows.iter().map(|r| r.values[j]).collect();
        let mut state = 0x9e37_79b9_7f4a_7c15u64 ^ j as u64;
        for i in (1..shuffled.len()).rev() {
            state = splitmix(state);
            shuffled.swap(i, (state % (i as u64 + 1)) as usize);
        }
        let (p, n) = score_all(rows, Some((j, &shuffled)));
        out.push(Importance { feature_id: id.clone(), auc_drop: base - auc(&p, &n).unwrap_or(base) });
    }
    out.sort_by(|a, b| b.auc_drop.total_cmp(&a.auc_drop));
    out
}

/// Deterministic 64-bit mixer, used for seeded sampling and fold assignment.
pub fn splitmix(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9e37_79b9_7f4a_7c15);
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}

/// A block id for a location on a grid of `size_degrees`.
pub fn block_of(lon: f64, lat: f64, size_degrees: f64) -> u64 {
    let x = (lon / size_degrees).floor() as i64;
    let y = (lat / size_degrees).floor() as i64;
    splitmix((x as u64).wrapping_mul(0x1000_0000_01b3) ^ (y as u64))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn synthetic() -> (Vec<String>, Vec<Row>) {
        // Presences prefer x0 near 1 (a peak, so the quadratic term matters); x1 is noise.
        let mut rows = Vec::new();
        let mut state = 7u64;
        let mut uniform = || {
            state = splitmix(state);
            (state >> 11) as f64 / (1u64 << 53) as f64
        };
        for i in 0..2000 {
            let x0 = uniform() * 4.0 - 2.0;
            let x1 = uniform() * 4.0 - 2.0;
            rows.push(Row { values: vec![x0 as f32, x1 as f32], label: Label::Background, origin: Origin::Generated, weight: 1.0, block: i % 20, effort: false, train: true });
        }
        for i in 0..200 {
            let x0 = 1.0 + (uniform() - 0.5) * 0.6;
            let x1 = uniform() * 4.0 - 2.0;
            let origin = if i % 4 == 0 { Origin::Field } else { Origin::Public };
            rows.push(Row { values: vec![x0 as f32, x1 as f32], label: Label::Presence, origin, weight: 1.0, block: i % 20, effort: false, train: true });
        }
        (vec!["x0".into(), "x1".into()], rows)
    }

    #[test]
    fn learns_a_unimodal_preference() {
        let (ids, rows) = synthetic();
        let refs: Vec<&Row> = rows.iter().collect();
        let model = fit(&ids, &refs, 0.001).unwrap();
        assert!(model.score(&[1.0, 0.0]) > model.score(&[-1.5, 0.0]));
        assert!(model.score(&[1.0, 0.0]) > model.score(&[2.0, 0.0]));
        assert!(model.percentile(model.score(&[1.0, 0.0])) > 85.0);
        let importance = permutation_importance(&model, &rows);
        assert_eq!(importance[0].feature_id, "x0");
    }

    #[test]
    fn spatial_validation_is_strong_on_learnable_data() {
        let (ids, rows) = synthetic();
        let v = validate(&ids, &rows, 0.001, 5);
        assert_eq!(v.folds, 5);
        assert!(v.spatial_block_auc.unwrap() > 0.9, "{:?}", v.spatial_block_auc);
        assert!(v.field_find_auc.unwrap() > 0.9);
        assert_eq!(v.held_out_field_percentiles.len(), 50);
    }

    #[test]
    fn missing_values_are_imputed_and_sparse_columns_dropped() {
        let (mut ids, mut rows) = synthetic();
        ids.push("mostly_missing".into());
        for (i, r) in rows.iter_mut().enumerate() {
            r.values.push(if i % 10 == 0 { 1.0 } else { f32::NAN });
        }
        let refs: Vec<&Row> = rows.iter().collect();
        let model = fit(&ids, &refs, 0.001).unwrap();
        assert_eq!(model.active, vec![true, true, false]);
        assert!(model.score(&[1.0, f32::NAN, f32::NAN]).is_finite());
    }

    #[test]
    fn evaluation_rows_score_but_do_not_train() {
        let (ids, mut rows) = synthetic();
        let refs: Vec<&Row> = rows.iter().collect();
        let plain = fit(&ids, &refs, 0.001).unwrap();
        // Recorders favour x0 near 1 too, so presences barely beat where people record.
        for i in 0..500u64 {
            let x0 = 1.0 + ((splitmix(i) % 1000) as f32 / 1000.0 - 0.5) * 0.8;
            rows.push(Row { values: vec![x0, 0.0], label: Label::Background, origin: Origin::Generated, weight: 1.0, block: i % 20, effort: true, train: false });
        }
        let refs: Vec<&Row> = rows.iter().collect();
        let same = fit(&ids, &refs, 0.001).unwrap();
        assert_eq!(plain.linear, same.linear);
        assert_eq!(plain.background_scores, same.background_scores);
        let v = validate(&ids, &rows, 0.001, 5);
        let effort = v.effort_auc.unwrap();
        assert!(effort < v.spatial_block_auc.unwrap() - 0.2, "{effort} vs {:?}", v.spatial_block_auc);
    }

    #[test]
    fn percentiles_rank_against_the_land_not_the_effort() {
        let (ids, mut rows) = synthetic();
        for r in rows.iter_mut().filter(|r| r.label == Label::Background).step_by(2) {
            r.effort = true;
        }
        let refs: Vec<&Row> = rows.iter().collect();
        let model = fit(&ids, &refs, 0.001).unwrap();
        let landscape = rows.iter().filter(|r| r.label == Label::Background && !r.effort).count();
        assert_eq!(model.background_scores.len(), landscape);
    }

    #[test]
    fn auc_handles_ties() {
        assert_eq!(auc(&[1.0], &[1.0]), Some(0.5));
        assert_eq!(auc(&[2.0, 3.0], &[1.0]), Some(1.0));
    }
}
