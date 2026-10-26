//! Terrain and proximity derivatives computed on a local window. Windows are
//! padded by the caller so neighbourhood operations near the core are complete.

use crate::raster::Grid;
use std::cmp::Ordering;
use std::collections::BinaryHeap;

fn same_shape(grid: &Grid, data: Vec<f32>) -> Grid {
    Grid { bounds: grid.bounds, width: grid.width, height: grid.height, data }
}

/// Horn (1981) gradients in metres per metre: (dz/dx east, dz/dy north).
fn gradients(dem: &Grid) -> Vec<Option<(f32, f32)>> {
    let (dx, dy) = dem.cell_metres();
    let (w, h) = (dem.width, dem.height);
    let mut out = vec![None; w * h];
    for r in 1..h.saturating_sub(1) {
        for c in 1..w.saturating_sub(1) {
            let z = |cc: usize, rr: usize| dem.get(cc, rr);
            let n = [
                z(c - 1, r - 1), z(c, r - 1), z(c + 1, r - 1),
                z(c - 1, r), z(c + 1, r),
                z(c - 1, r + 1), z(c, r + 1), z(c + 1, r + 1),
            ];
            if n.iter().any(|v| v.is_nan()) {
                continue;
            }
            let gx = ((n[2] + 2.0 * n[4] + n[7]) - (n[0] + 2.0 * n[3] + n[5])) / (8.0 * dx as f32);
            // Row index grows southwards, so north-minus-south is top-minus-bottom.
            let gy = ((n[0] + 2.0 * n[1] + n[2]) - (n[5] + 2.0 * n[6] + n[7])) / (8.0 * dy as f32);
            out[r * w + c] = Some((gx, gy));
        }
    }
    out
}

pub fn slope_degrees(dem: &Grid) -> Grid {
    let data = gradients(dem)
        .into_iter()
        .map(|g| g.map_or(f32::NAN, |(gx, gy)| (gx.hypot(gy)).atan().to_degrees()))
        .collect();
    same_shape(dem, data)
}

/// cos/sin of the downslope aspect, scaled by how steep the cell is so flat
/// ground reads as zero rather than an arbitrary direction.
pub fn aspect_components(dem: &Grid) -> (Grid, Grid) {
    let grads = gradients(dem);
    let mut north = Vec::with_capacity(grads.len());
    let mut east = Vec::with_capacity(grads.len());
    for g in grads {
        match g {
            Some((gx, gy)) => {
                let steepness = (gx.hypot(gy)).atan().sin();
                let magnitude = gx.hypot(gy).max(1e-9);
                // Downslope direction is the negative gradient.
                north.push(-gy / magnitude * steepness);
                east.push(-gx / magnitude * steepness);
            }
            None => {
                north.push(f32::NAN);
                east.push(f32::NAN);
            }
        }
    }
    (same_shape(dem, north), same_shape(dem, east))
}

/// Summed-area tables of value, value² and valid-count for O(1) window stats.
struct Integral {
    width: usize,
    sum: Vec<f64>,
    sum_sq: Vec<f64>,
    count: Vec<f64>,
}

impl Integral {
    fn new(grid: &Grid) -> Self {
        let (w, h) = (grid.width, grid.height);
        let stride = w + 1;
        let mut sum = vec![0.0; stride * (h + 1)];
        let mut sum_sq = vec![0.0; stride * (h + 1)];
        let mut count = vec![0.0; stride * (h + 1)];
        for r in 0..h {
            let (mut rs, mut rq, mut rc) = (0.0, 0.0, 0.0);
            for c in 0..w {
                let v = grid.get(c, r);
                if !v.is_nan() {
                    rs += v as f64;
                    rq += (v as f64) * (v as f64);
                    rc += 1.0;
                }
                let i = (r + 1) * stride + c + 1;
                sum[i] = sum[i - stride] + rs;
                sum_sq[i] = sum_sq[i - stride] + rq;
                count[i] = count[i - stride] + rc;
            }
        }
        Self { width: w, sum, sum_sq, count }
    }

    fn window(&self, c0: usize, r0: usize, c1: usize, r1: usize) -> (f64, f64, f64) {
        let stride = self.width + 1;
        let at = |table: &Vec<f64>| {
            table[(r1 + 1) * stride + c1 + 1] - table[r0 * stride + c1 + 1] - table[(r1 + 1) * stride + c0]
                + table[r0 * stride + c0]
        };
        (at(&self.sum), at(&self.sum_sq), at(&self.count))
    }
}

fn window_stat(grid: &Grid, radius_m: f64, stat: impl Fn(f32, f64, f64) -> f32) -> Grid {
    let integral = Integral::new(grid);
    let (dx, dy) = grid.cell_metres();
    let rc = ((radius_m / dx).round() as usize).max(1);
    let rr = ((radius_m / dy).round() as usize).max(1);
    let (w, h) = (grid.width, grid.height);
    let mut data = vec![f32::NAN; w * h];
    for r in 0..h {
        for c in 0..w {
            let v = grid.get(c, r);
            if v.is_nan() {
                continue;
            }
            let (c0, c1) = (c.saturating_sub(rc), (c + rc).min(w - 1));
            let (r0, r1) = (r.saturating_sub(rr), (r + rr).min(h - 1));
            let (s, q, n) = integral.window(c0, r0, c1, r1);
            if n < 3.0 {
                continue;
            }
            let mean = s / n;
            data[r * w + c] = stat(v, mean, (q / n - mean * mean).max(0.0));
        }
    }
    same_shape(grid, data)
}

/// Topographic position index: elevation minus the mean of a square window.
pub fn tpi(dem: &Grid, radius_m: f64) -> Grid {
    window_stat(dem, radius_m, |v, mean, _| v - mean as f32)
}

/// Standard deviation of elevation in a square window (a ruggedness measure).
pub fn roughness(dem: &Grid, radius_m: f64) -> Grid {
    window_stat(dem, radius_m, |_, _, variance| variance.sqrt() as f32)
}

/// Mean of a layer in a square window (e.g. how much surface water is nearby).
pub fn focal_mean(grid: &Grid, radius_m: f64) -> Grid {
    window_stat(grid, radius_m, |_, mean, _| mean as f32)
}

#[derive(Clone, Copy, PartialEq)]
struct Cell {
    elevation: f32,
    index: usize,
}

impl Eq for Cell {}

impl Ord for Cell {
    fn cmp(&self, other: &Self) -> Ordering {
        // Min-heap on elevation, ties broken by index for determinism.
        other
            .elevation
            .partial_cmp(&self.elevation)
            .unwrap_or(Ordering::Equal)
            .then_with(|| other.index.cmp(&self.index))
    }
}

impl PartialOrd for Cell {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const NEIGHBOURS: [(isize, isize); 8] = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)];

/// Priority-flood depression filling with a tiny gradient (Barnes et al. 2014),
/// so every cell has a downhill path to the window edge or a nodata hole.
fn fill_depressions(dem: &Grid) -> Vec<f32> {
    let (w, h) = (dem.width, dem.height);
    let mut filled = dem.data.clone();
    let mut done = vec![false; w * h];
    let mut heap = BinaryHeap::new();
    for r in 0..h {
        for c in 0..w {
            let i = r * w + c;
            if filled[i].is_nan() {
                done[i] = true;
                continue;
            }
            let edge = r == 0 || c == 0 || r == h - 1 || c == w - 1
                || NEIGHBOURS.iter().any(|(dc, dr)| {
                    let (cc, rr) = (c as isize + dc, r as isize + dr);
                    cc >= 0 && rr >= 0 && (cc as usize) < w && (rr as usize) < h
                        && filled[rr as usize * w + cc as usize].is_nan()
                });
            if edge {
                done[i] = true;
                heap.push(Cell { elevation: filled[i], index: i });
            }
        }
    }
    while let Some(Cell { elevation, index }) = heap.pop() {
        let (c, r) = ((index % w) as isize, (index / w) as isize);
        for (dc, dr) in NEIGHBOURS {
            let (cc, rr) = (c + dc, r + dr);
            if cc < 0 || rr < 0 || cc as usize >= w || rr as usize >= h {
                continue;
            }
            let j = rr as usize * w + cc as usize;
            if done[j] {
                continue;
            }
            done[j] = true;
            let minimum = elevation + 1e-4;
            if filled[j] < minimum {
                filled[j] = minimum;
            }
            heap.push(Cell { elevation: filled[j], index: j });
        }
    }
    filled
}

/// D8 upslope cell counts on the depression-filled surface. Catchments are
/// truncated at the window edge, so callers pad windows generously.
pub fn flow_accumulation(dem: &Grid) -> Grid {
    let (w, h) = (dem.width, dem.height);
    let (dx, dy) = dem.cell_metres();
    let filled = fill_depressions(dem);
    let mut order: Vec<usize> = (0..w * h).filter(|&i| !filled[i].is_nan()).collect();
    order.sort_by(|&a, &b| filled[b].partial_cmp(&filled[a]).unwrap_or(Ordering::Equal));
    let mut accumulation = vec![1.0f32; w * h];
    for &i in &order {
        let (c, r) = ((i % w) as isize, (i / w) as isize);
        let mut best: Option<(usize, f32)> = None;
        for (dc, dr) in NEIGHBOURS {
            let (cc, rr) = (c + dc, r + dr);
            if cc < 0 || rr < 0 || cc as usize >= w || rr as usize >= h {
                continue;
            }
            let j = rr as usize * w + cc as usize;
            if filled[j].is_nan() {
                continue;
            }
            let distance = ((dc as f64 * dx).powi(2) + (dr as f64 * dy).powi(2)).sqrt() as f32;
            let drop = (filled[i] - filled[j]) / distance;
            if drop > 0.0 && best.is_none_or(|(_, d)| drop > d) {
                best = Some((j, drop));
            }
        }
        if let Some((j, _)) = best {
            accumulation[j] += accumulation[i];
        }
    }
    for (i, value) in accumulation.iter_mut().enumerate() {
        if dem.data[i].is_nan() {
            *value = f32::NAN;
        }
    }
    same_shape(dem, accumulation)
}

/// Topographic wetness index ln(a / tan β) from D8 accumulation and slope.
pub fn wetness_index(dem: &Grid) -> Grid {
    let accumulation = flow_accumulation(dem);
    let slope = slope_degrees(dem);
    let (dx, dy) = dem.cell_metres();
    let contour = ((dx + dy) / 2.0) as f32;
    let cell_area = (dx * dy) as f32;
    let data = accumulation
        .data
        .iter()
        .zip(&slope.data)
        .map(|(&a, &s)| {
            if a.is_nan() || s.is_nan() {
                return f32::NAN;
            }
            let specific_area = a * cell_area / contour;
            let tan_beta = s.to_radians().tan().max(0.001);
            (specific_area / tan_beta).ln()
        })
        .collect();
    same_shape(dem, data)
}

/// Distance in metres to the nearest cell whose value is at least
/// `threshold`, capped at `cap_m` (also the value when none is in the window).
pub fn distance_to(grid: &Grid, threshold: f32, cap_m: f32) -> Grid {
    let (w, h) = (grid.width, grid.height);
    let (dx, dy) = grid.cell_metres();
    let (dx, dy) = (dx as f32, dy as f32);
    let diagonal = dx.hypot(dy);
    let mut distance: Vec<f32> = grid.data.iter().map(|&v| if v >= threshold { 0.0 } else { f32::INFINITY }).collect();
    // Two-pass chamfer transform: top-left to bottom-right, then back.
    let forward = [(-1isize, -1isize, diagonal), (0, -1, dy), (1, -1, diagonal), (-1, 0, dx)];
    let backward = [(1isize, 1isize, diagonal), (0, 1, dy), (-1, 1, diagonal), (1, 0, dx)];
    for (pass, reverse) in [(forward, false), (backward, true)] {
        for step_r in 0..h {
            let r = if reverse { h - 1 - step_r } else { step_r };
            for step_c in 0..w {
                let c = if reverse { w - 1 - step_c } else { step_c };
                let i = r * w + c;
                for (dc, dr, step) in pass {
                    let (cc, rr) = (c as isize + dc, r as isize + dr);
                    if cc < 0 || rr < 0 || cc as usize >= w || rr as usize >= h {
                        continue;
                    }
                    let candidate = distance[rr as usize * w + cc as usize] + step;
                    if candidate < distance[i] {
                        distance[i] = candidate;
                    }
                }
            }
        }
    }
    let data = distance.into_iter().map(|d| d.min(cap_m)).collect();
    same_shape(grid, data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geo::Bounds;

    /// A plane rising 1 m per cell to the east on ~30 m cells at the equator.
    fn ramp(w: usize, h: usize) -> Grid {
        let cell = 30.0 / 111_320.0;
        let bounds = Bounds { west: 0.0, south: -(h as f64) * cell / 2.0, east: w as f64 * cell, north: h as f64 * cell / 2.0 };
        let data = (0..w * h).map(|i| (i % w) as f32).collect();
        Grid { bounds, width: w, height: h, data }
    }

    #[test]
    fn slope_of_a_plane() {
        let g = ramp(10, 10);
        let s = slope_degrees(&g);
        let expected = (1.0f32 / 30.0).atan().to_degrees();
        assert!((s.get(5, 5) - expected).abs() < 0.05, "{}", s.get(5, 5));
        assert!(s.get(0, 0).is_nan());
    }

    #[test]
    fn east_rising_plane_faces_west() {
        let (north, east) = aspect_components(&ramp(10, 10));
        assert!(east.get(5, 5) < 0.0);
        assert!(north.get(5, 5).abs() < 1e-6);
    }

    #[test]
    fn tpi_is_zero_on_a_plane_and_positive_on_a_peak() {
        let g = ramp(21, 21);
        assert!(tpi(&g, 90.0).get(10, 10).abs() < 1e-3);
        let mut peak = g.clone();
        peak.data.iter_mut().for_each(|v| *v = 0.0);
        peak.data[10 * 21 + 10] = 10.0;
        assert!(tpi(&peak, 90.0).get(10, 10) > 9.0);
    }

    #[test]
    fn flow_gathers_downhill() {
        // Valley: elevation = distance from the centre column; flow collects there.
        let mut g = ramp(11, 11);
        for r in 0..11 {
            for c in 0..11 {
                g.data[r * 11 + c] = (c as f32 - 5.0).abs() + r as f32 * 0.1;
            }
        }
        let a = flow_accumulation(&g);
        let centre_bottom = a.get(5, 10);
        let side = a.get(1, 10);
        assert!(centre_bottom > side * 5.0, "{centre_bottom} vs {side}");
        let twi = wetness_index(&g);
        assert!(twi.get(5, 9) > twi.get(1, 9));
    }

    #[test]
    fn distance_to_wet_cells() {
        let mut g = ramp(10, 1);
        g.data.iter_mut().for_each(|v| *v = 0.0);
        g.data[0] = 1.0;
        let d = distance_to(&g, 0.5, 1000.0);
        assert_eq!(d.get(0, 0), 0.0);
        assert!((d.get(3, 0) - 90.0).abs() < 1.0, "{}", d.get(3, 0));
        let none = distance_to(&Grid { data: vec![0.0; 10], ..g }, 0.5, 250.0);
        assert_eq!(none.get(5, 0), 250.0);
    }
}
