use anyhow::Result;

/// Colour stops for landscape percentile (0–100): pale and transparent where
/// the ground is ordinary, deepening to dark red in the top few percent.
const STOPS: [(f32, [u8; 4]); 6] = [
    (0.0, [255, 255, 204, 0]),
    (50.0, [255, 237, 160, 40]),
    (75.0, [254, 178, 76, 120]),
    (90.0, [253, 141, 60, 170]),
    (97.0, [227, 26, 28, 210]),
    (100.0, [128, 0, 38, 235]),
];

pub fn colour(percentile: f32) -> [u8; 4] {
    if percentile.is_nan() {
        return [0, 0, 0, 0];
    }
    let p = percentile.clamp(0.0, 100.0);
    for pair in STOPS.windows(2) {
        let ((a, ca), (b, cb)) = (pair[0], pair[1]);
        if p <= b {
            let t = if b > a { (p - a) / (b - a) } else { 0.0 };
            let mut out = [0u8; 4];
            for i in 0..4 {
                out[i] = (ca[i] as f32 + (cb[i] as f32 - ca[i] as f32) * t).round() as u8;
            }
            return out;
        }
    }
    STOPS[STOPS.len() - 1].1
}

/// Encode a north-up grid of percentiles as an RGBA PNG.
pub fn percentile_png(width: usize, height: usize, percentiles: &[f32]) -> Result<Vec<u8>> {
    let mut rgba = Vec::with_capacity(width * height * 4);
    for &p in percentiles {
        rgba.extend_from_slice(&colour(p));
    }
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width as u32, height as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Fast);
        let mut writer = encoder.write_header()?;
        writer.write_image_data(&rgba)?;
    }
    Ok(out)
}

/// Hillshade (sun from the north-west) of a window of `elevation`, tinted
/// from dry tan to green by green cover, with surface water drawn in blue.
pub fn basemap_png(
    elevation: &crate::raster::Grid,
    water: Option<&crate::raster::Grid>,
    green: Option<&crate::raster::Grid>,
    c0: usize,
    r0: usize,
    width: usize,
    height: usize,
) -> Result<Vec<u8>> {
    let (dx, dy) = elevation.cell_metres();
    let (azimuth, altitude) = (315f64.to_radians(), 45f64.to_radians());
    let exaggeration = 3.0;
    let mut rgba = Vec::with_capacity(width * height * 4);
    for r in r0..r0 + height {
        for c in c0..c0 + width {
            let z = |cc: usize, rr: usize| {
                let v = elevation.get(cc.min(elevation.width - 1), rr.min(elevation.height - 1));
                if v.is_nan() { elevation.get(c, r) } else { v }
            } as f64;
            let (cl, cr) = (c.saturating_sub(1), c + 1);
            let (ru, rd) = (r.saturating_sub(1), r + 1);
            let dzdx = (z(cr, r) - z(cl, r)) / (2.0 * dx) * exaggeration;
            let dzdy = (z(c, ru) - z(c, rd)) / (2.0 * dy) * exaggeration;
            let slope = dzdx.hypot(dzdy).atan();
            let aspect = dzdy.atan2(-dzdx);
            let shade = (altitude.sin() * slope.cos() + altitude.cos() * slope.sin() * (azimuth - aspect).cos()).clamp(0.0, 1.0);
            let g = green.map_or(0.4, |g| (g.get(c, r) as f64 / 100.0).clamp(0.0, 1.0));
            let g = if g.is_nan() { 0.4 } else { g };
            // Dry country (tan) to green country.
            let base = [214.0 - 110.0 * g, 196.0 - 40.0 * g, 160.0 - 80.0 * g];
            let light = 0.45 + 0.75 * shade;
            let mut pixel = base.map(|v| (v * light).clamp(0.0, 255.0));
            if let Some(w) = water.map(|w| w.get(c, r)) {
                if w.is_finite() && w > 0.02 {
                    let t = (w as f64 * 2.5).clamp(0.25, 1.0);
                    let blue = [40.0, 110.0, 200.0];
                    for i in 0..3 {
                        pixel[i] = pixel[i] * (1.0 - t) + blue[i] * t;
                    }
                }
            }
            rgba.extend_from_slice(&[pixel[0] as u8, pixel[1] as u8, pixel[2] as u8, 255]);
        }
    }
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width as u32, height as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header()?;
        writer.write_image_data(&rgba)?;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ramp_is_transparent_at_the_bottom_and_opaque_at_the_top() {
        assert_eq!(colour(0.0)[3], 0);
        assert!(colour(99.0)[3] > 200);
        assert_eq!(colour(f32::NAN), [0, 0, 0, 0]);
    }

    #[test]
    fn encodes_a_png() {
        let png = percentile_png(2, 1, &[10.0, 99.0]).unwrap();
        assert_eq!(&png[1..4], b"PNG");
    }
}
