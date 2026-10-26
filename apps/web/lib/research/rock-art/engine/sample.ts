/**
 * Synthetic sample panel: a procedurally generated weathered rock surface with
 * deliberately faint painted motifs. Used by the landing-page demo and the
 * workbench "load sample" empty state, so the engine can be exercised without
 * anyone's photographs and without publishing culturally sensitive imagery.
 *
 * Everything is seeded and deterministic.
 */

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 2D value noise with a couple of octaves. */
function makeNoise(seed: number, size: number): (x: number, y: number) => number {
  const rand = mulberry32(seed);
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const at = (x: number, y: number) =>
    grid[((y % size) + size) % size * size + (((x % size) + size) % size)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sample = (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y) =>
    0.55 * sample(x, y) + 0.3 * sample(x * 2.7 + 13, y * 2.7 + 7) + 0.15 * sample(x * 7.1 + 41, y * 7.1 + 29);
}

/**
 * Render the sample panel into a canvas 2D context.
 * `pigmentAlpha` controls how faint the motifs are (default is near-invisible).
 */
export function drawSamplePanel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pigmentAlpha = 0.05,
  seed = 20260817,
): void {
  const noise = makeNoise(seed, 64);
  const stain = makeNoise(seed + 1, 64);
  const img = ctx.createImageData(width, height);
  const d = img.data;

  // Weathered sandstone: warm grey-browns modulated by two noise fields.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = noise(x / 46, y / 46);
      const s = stain(x / 130, y / 130);
      const grain = noise(x / 3.1, y / 3.1);
      let r = 118 + n * 74 + grain * 22 - s * 28;
      let g = 104 + n * 66 + grain * 20 - s * 34;
      let b = 92 + n * 56 + grain * 18 - s * 38;
      // Occasional darker mineral streaking.
      if (s > 0.62) {
        const k = (s - 0.62) * 2.2;
        r -= k * 46;
        g -= k * 40;
        b -= k * 30;
      }
      const i = (y * width + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Faint red-ochre motifs. Painted at very low alpha so they sit at the
  // edge of visibility on the textured ground — the stretch recovers them.
  const u = Math.min(width, height) / 100;
  ctx.save();
  ctx.globalAlpha = pigmentAlpha;
  ctx.strokeStyle = "#7c2214";
  ctx.fillStyle = "#7c2214";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Concentric circles
  ctx.lineWidth = 1.7 * u;
  for (let ring = 1; ring <= 3; ring++) {
    ctx.beginPath();
    ctx.arc(width * 0.24, height * 0.34, ring * 5.4 * u, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Anthropomorph: body, arms raised, legs, head
  const ax = width * 0.52;
  const ay = height * 0.28;
  ctx.lineWidth = 2.6 * u;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax, ay + 26 * u); // body
  ctx.moveTo(ax, ay + 8 * u);
  ctx.lineTo(ax - 11 * u, ay - 2 * u); // left arm up
  ctx.moveTo(ax, ay + 8 * u);
  ctx.lineTo(ax + 11 * u, ay - 2 * u); // right arm up
  ctx.moveTo(ax, ay + 26 * u);
  ctx.lineTo(ax - 8 * u, ay + 40 * u); // left leg
  ctx.moveTo(ax, ay + 26 * u);
  ctx.lineTo(ax + 8 * u, ay + 40 * u); // right leg
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ax, ay - 5 * u, 4.4 * u, 0, Math.PI * 2);
  ctx.fill();

  // Macropod (kangaroo-like) profile
  const kx = width * 0.74;
  const ky = height * 0.62;
  ctx.lineWidth = 2.2 * u;
  ctx.beginPath();
  ctx.moveTo(kx - 16 * u, ky + 10 * u); // tail tip
  ctx.quadraticCurveTo(kx - 4 * u, ky + 12 * u, kx, ky + 2 * u); // tail→rump
  ctx.quadraticCurveTo(kx + 3 * u, ky - 8 * u, kx + 10 * u, ky - 9 * u); // back
  ctx.quadraticCurveTo(kx + 15 * u, ky - 10 * u, kx + 17 * u, ky - 14 * u); // neck
  ctx.lineTo(kx + 20 * u, ky - 17 * u); // head
  ctx.moveTo(kx + 2 * u, ky + 2 * u);
  ctx.lineTo(kx + 4 * u, ky + 14 * u); // hind leg
  ctx.moveTo(kx + 13 * u, ky - 7 * u);
  ctx.lineTo(kx + 14 * u, ky - 1 * u); // foreleg
  ctx.stroke();

  // Boomerang pair
  ctx.lineWidth = 2 * u;
  for (const [bx, by, rot] of [
    [width * 0.2, height * 0.72, 0.4],
    [width * 0.3, height * 0.78, -0.7],
  ] as const) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(-10 * u, 4 * u);
    ctx.quadraticCurveTo(0, -6 * u, 10 * u, 4 * u);
    ctx.stroke();
    ctx.restore();
  }

  // Barred design (comb motif)
  ctx.lineWidth = 1.6 * u;
  for (let bar = 0; bar < 6; bar++) {
    ctx.beginPath();
    ctx.moveTo(width * 0.55 + bar * 3.4 * u, height * 0.72);
    ctx.lineTo(width * 0.55 + bar * 3.4 * u, height * 0.85);
    ctx.stroke();
  }

  ctx.restore();
}
