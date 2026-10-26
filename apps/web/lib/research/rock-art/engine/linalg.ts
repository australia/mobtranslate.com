/**
 * Minimal 3×3 linear algebra for the analysis engine.
 * Matrices are row-major number[9]; vectors are number[3].
 * Pixel convention: row vectors, y = (x − μ) · M + μ.
 */

export type Mat3 = number[]; // length 9, row-major
export type Vec3 = number[]; // length 3

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function matMul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] =
        a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

export function transpose(a: Mat3): Mat3 {
  return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
}

/** Row vector times matrix: v · M */
export function vecMat(v: Vec3, m: Mat3): Vec3 {
  return [
    v[0] * m[0] + v[1] * m[3] + v[2] * m[6],
    v[0] * m[1] + v[1] * m[4] + v[2] * m[7],
    v[0] * m[2] + v[1] * m[5] + v[2] * m[8],
  ];
}

export function matScaleAdd(a: Mat3, sa: number, b: Mat3, sb: number): Mat3 {
  const r = new Array<number>(9);
  for (let i = 0; i < 9; i++) r[i] = a[i] * sa + b[i] * sb;
  return r;
}

export interface EigenResult {
  /** Eigenvalues, sorted descending. */
  values: Vec3;
  /** Corresponding unit eigenvectors as matrix columns (row-major Mat3). */
  vectors: Mat3;
}

/**
 * Eigendecomposition of a symmetric 3×3 matrix by cyclic Jacobi rotations.
 * Deterministic, converges in a handful of sweeps for covariance matrices.
 */
export function eigenSym3(m: Mat3): EigenResult {
  // Work on copies: a is diagonalized, v accumulates rotations.
  const a = m.slice();
  const v = IDENTITY.slice();

  for (let sweep = 0; sweep < 50; sweep++) {
    const off =
      a[1] * a[1] + a[2] * a[2] + a[5] * a[5]; // upper off-diagonal energy
    if (off < 1e-30) break;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        const apq = a[p * 3 + q];
        if (Math.abs(apq) < 1e-30) continue;
        const app = a[p * 3 + p];
        const aqq = a[q * 3 + q];
        const theta = (aqq - app) / (2 * apq);
        const t =
          Math.sign(theta || 1) /
          (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        // Apply Givens rotation J(p,q,θ): a = Jᵀ a J
        for (let k = 0; k < 3; k++) {
          const akp = a[k * 3 + p];
          const akq = a[k * 3 + q];
          a[k * 3 + p] = c * akp - s * akq;
          a[k * 3 + q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p * 3 + k];
          const aqk = a[q * 3 + k];
          a[p * 3 + k] = c * apk - s * aqk;
          a[q * 3 + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k * 3 + p];
          const vkq = v[k * 3 + q];
          v[k * 3 + p] = c * vkp - s * vkq;
          v[k * 3 + q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const order = [0, 1, 2].sort((i, j) => a[j * 3 + j] - a[i * 3 + i]);
  const values: Vec3 = order.map((i) => a[i * 3 + i]);
  const vectors = new Array<number>(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      vectors[row * 3 + col] = v[row * 3 + order[col]];
    }
  }
  return { values, vectors };
}
