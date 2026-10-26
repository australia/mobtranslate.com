use serde::{Deserialize, Serialize};

const EARTH_RADIUS_M: f64 = 6_371_008.8;
const METRES_PER_DEGREE_LAT: f64 = 111_320.0;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub struct Bounds {
    pub west: f64,
    pub south: f64,
    pub east: f64,
    pub north: f64,
}

impl Bounds {
    /// A square of `half_m` metres either side of a point.
    pub fn around(lon: f64, lat: f64, half_m: f64) -> Self {
        let dlat = half_m / METRES_PER_DEGREE_LAT;
        let dlon = half_m / (METRES_PER_DEGREE_LAT * lat.to_radians().cos().max(0.05));
        Self { west: lon - dlon, south: lat - dlat, east: lon + dlon, north: lat + dlat }
    }

    pub fn contains(&self, lon: f64, lat: f64) -> bool {
        lon >= self.west && lon <= self.east && lat >= self.south && lat <= self.north
    }

    pub fn centre(&self) -> (f64, f64) {
        ((self.west + self.east) / 2.0, (self.south + self.north) / 2.0)
    }

    pub fn is_valid(&self) -> bool {
        [self.west, self.south, self.east, self.north].iter().all(|v| v.is_finite())
            && self.west < self.east
            && self.south < self.north
            && self.south >= -90.0
            && self.north <= 90.0
    }

    /// Grid size for a target cell size in metres, measured at the centre latitude.
    pub fn pixels_for(&self, cell_m: f64) -> (usize, usize) {
        let (_, lat) = self.centre();
        let width_m = (self.east - self.west) * METRES_PER_DEGREE_LAT * lat.to_radians().cos();
        let height_m = (self.north - self.south) * METRES_PER_DEGREE_LAT;
        (
            (width_m / cell_m).round().max(1.0) as usize,
            (height_m / cell_m).round().max(1.0) as usize,
        )
    }
}

pub fn haversine_m(lon1: f64, lat1: f64, lon2: f64, lat2: f64) -> f64 {
    let (p1, p2) = (lat1.to_radians(), lat2.to_radians());
    let dp = p2 - p1;
    let dl = (lon2 - lon1).to_radians();
    let h = (dp / 2.0).sin().powi(2) + p1.cos() * p2.cos() * (dl / 2.0).sin().powi(2);
    2.0 * EARTH_RADIUS_M * h.sqrt().asin()
}

/// Initial bearing from point 1 to point 2, degrees clockwise from north.
pub fn bearing_deg(lon1: f64, lat1: f64, lon2: f64, lat2: f64) -> f64 {
    let (p1, p2) = (lat1.to_radians(), lat2.to_radians());
    let dl = (lon2 - lon1).to_radians();
    let y = dl.sin() * p2.cos();
    let x = p1.cos() * p2.sin() - p1.sin() * p2.cos() * dl.cos();
    (y.atan2(x).to_degrees() + 360.0) % 360.0
}

/// GDA94 / Australian Albers (EPSG:3577), the grid DEA tiles its products on.
pub fn australian_albers(lon: f64, lat: f64) -> (f64, f64) {
    const A: f64 = 6_378_137.0;
    const F: f64 = 1.0 / 298.257_222_101;
    let e2 = F * (2.0 - F);
    let e = e2.sqrt();
    let q = |phi: f64| {
        let s = phi.sin();
        (1.0 - e2) * (s / (1.0 - e2 * s * s) - (1.0 / (2.0 * e)) * ((1.0 - e * s) / (1.0 + e * s)).ln())
    };
    let m = |phi: f64| phi.cos() / (1.0 - e2 * phi.sin().powi(2)).sqrt();
    let (phi1, phi2, phi0, lambda0) = ((-18f64).to_radians(), (-36f64).to_radians(), 0.0, 132f64.to_radians());
    let (m1, m2) = (m(phi1), m(phi2));
    let (q1, q2, q0) = (q(phi1), q(phi2), q(phi0));
    let n = (m1 * m1 - m2 * m2) / (q2 - q1);
    let c = m1 * m1 + n * q1;
    let rho0 = A * (c - n * q0).sqrt() / n;
    let rho = A * (c - n * q(lat.to_radians())).sqrt() / n;
    let theta = n * (lon.to_radians() - lambda0);
    (rho * theta.sin(), rho0 - rho * theta.cos())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn albers_matches_gdal() {
        // gdaltransform -s_srs EPSG:4326 -t_srs EPSG:3577 <<< "144.05 -15.95"
        let (x, y) = australian_albers(144.05, -15.95);
        assert!((x - 1_295_571.385).abs() < 0.5, "{x}");
        assert!((y - -1_757_089.491).abs() < 0.5, "{y}");
    }

    #[test]
    fn around_is_roughly_square_in_metres() {
        let b = Bounds::around(144.0, -16.0, 1000.0);
        let width = haversine_m(b.west, -16.0, b.east, -16.0);
        let height = haversine_m(144.0, b.south, 144.0, b.north);
        assert!((width - 2000.0).abs() < 15.0, "{width}");
        assert!((height - 2000.0).abs() < 15.0, "{height}");
    }

    #[test]
    fn bearing_points_north_and_east() {
        assert!(bearing_deg(144.0, -16.0, 144.0, -15.9) < 0.1);
        assert!((bearing_deg(144.0, -16.0, 144.1, -16.0) - 90.0).abs() < 0.1);
    }
}
