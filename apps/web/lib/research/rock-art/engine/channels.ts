/**
 * Colour-channel workbench (PRD §10.6): standard channels from several colour
 * spaces plus channel arithmetic through a small, safe expression compiler.
 *
 * Expressions are compiled to RPN by a shunting-yard parser — no eval, no
 * Function(). Available variables (per pixel, all derived from sRGB [0,1]):
 *   R G B          gamma-encoded sRGB
 *   Rl Gl Bl       linear-light RGB
 *   L a b          CIELAB (L* 0–100, a* and b* ±~100)
 *   Y Cb Cr        full-range BT.601
 *   H S V          HSV
 * Functions: log sqrt abs min max clamp pow exp; constant: e, pi, eps (1e-6).
 */

import { srgbToHsv, srgbToLab, srgbToLinear, srgbToYcbcr } from "./colorspace";

export const CHANNEL_VARS = [
  "R", "G", "B", "Rl", "Gl", "Bl", "L", "a", "b", "Y", "Cb", "Cr", "H", "S", "V",
] as const;
export type ChannelVar = (typeof CHANNEL_VARS)[number];

export interface ChannelPreset {
  id: string;
  label: string;
  expression: string;
  hint: string;
}

/** Transparent starting formulas (FR-CHAN-002); every one is editable. */
export const CHANNEL_PRESETS: ChannelPreset[] = [
  { id: "lab-a", label: "Lab a*", expression: "a", hint: "Red–green axis; the classic pictograph channel" },
  { id: "lab-b", label: "Lab b*", expression: "b", hint: "Yellow–blue axis" },
  { id: "lab-l", label: "Lab L*", expression: "L", hint: "Lightness only" },
  { id: "rg", label: "R − G", expression: "R - G", hint: "Simple red excess" },
  { id: "redness", label: "Red chromaticity", expression: "R / (R + G + B + eps)", hint: "Illumination-resistant red share" },
  { id: "logratio", label: "log(R/G)", expression: "log((R + eps) / (G + eps))", hint: "Ratio channel, stable under brightness change" },
  { id: "2rgb", label: "2R − G − B", expression: "2*R - G - B", hint: "Red opponent channel" },
  { id: "cr", label: "Cr", expression: "Cr", hint: "BT.601 red-difference chroma" },
  { id: "sat", label: "Saturation", expression: "S", hint: "HSV saturation" },
];

type Token =
  | { kind: "num"; value: number }
  | { kind: "var"; name: ChannelVar }
  | { kind: "fn"; name: string; arity: number }
  | { kind: "op"; name: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

const FUNCTIONS: Record<string, number> = {
  log: 1, sqrt: 1, abs: 1, exp: 1, min: 2, max: 2, pow: 2, clamp: 3,
};
const CONSTANTS: Record<string, number> = { e: Math.E, pi: Math.PI, eps: 1e-6 };
const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "u-": 3, "^": 4 };
const RIGHT_ASSOC = new Set(["^", "u-"]);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at position ${i}`);
      tokens.push({ kind: "num", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      const word = m[0];
      i += word.length;
      if (word in FUNCTIONS) tokens.push({ kind: "fn", name: word, arity: FUNCTIONS[word] });
      else if (word in CONSTANTS) tokens.push({ kind: "num", value: CONSTANTS[word] });
      else if ((CHANNEL_VARS as readonly string[]).includes(word)) tokens.push({ kind: "var", name: word as ChannelVar });
      else throw new Error(`Unknown name "${word}" — channels are ${CHANNEL_VARS.join(" ")}`);
      continue;
    }
    if ("+-*/^".includes(ch)) { tokens.push({ kind: "op", name: ch }); i++; continue; }
    if (ch === "(") { tokens.push({ kind: "lparen" }); i++; continue; }
    if (ch === ")") { tokens.push({ kind: "rparen" }); i++; continue; }
    if (ch === ",") { tokens.push({ kind: "comma" }); i++; continue; }
    throw new Error(`Unexpected character "${ch}"`);
  }
  return tokens;
}

type RpnItem =
  | { kind: "num"; value: number }
  | { kind: "var"; index: number }
  | { kind: "op"; name: string }
  | { kind: "fn"; name: string; arity: number };

export interface CompiledExpression {
  rpn: RpnItem[];
  /** Which variables the expression actually reads (drives per-pixel work). */
  uses: Set<ChannelVar>;
  source: string;
}

/** Compile an expression, throwing a user-readable Error on invalid input. */
export function compileExpression(src: string): CompiledExpression {
  const tokens = tokenize(src);
  if (tokens.length === 0) throw new Error("Empty expression");
  const out: RpnItem[] = [];
  const stack: Token[] = [];
  const uses = new Set<ChannelVar>();
  let prev: Token | null = null;

  for (const tok of tokens) {
    switch (tok.kind) {
      case "num":
        out.push({ kind: "num", value: tok.value });
        break;
      case "var":
        uses.add(tok.name);
        out.push({ kind: "var", index: CHANNEL_VARS.indexOf(tok.name) });
        break;
      case "fn":
        stack.push(tok);
        break;
      case "comma": {
        while (stack.length && stack[stack.length - 1].kind !== "lparen") {
          const t = stack.pop()!;
          if (t.kind === "op") out.push({ kind: "op", name: t.name });
          else if (t.kind === "fn") out.push({ kind: "fn", name: t.name, arity: t.arity });
        }
        if (!stack.length) throw new Error("Comma outside a function call");
        break;
      }
      case "op": {
        const unary =
          tok.name === "-" &&
          (!prev || prev.kind === "op" || prev.kind === "lparen" || prev.kind === "comma");
        const name = unary ? "u-" : tok.name;
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top.kind !== "op") break;
          const pTop = PRECEDENCE[top.name];
          const pCur = PRECEDENCE[name];
          if (pTop > pCur || (pTop === pCur && !RIGHT_ASSOC.has(name))) {
            stack.pop();
            out.push({ kind: "op", name: top.name });
          } else break;
        }
        stack.push({ kind: "op", name });
        break;
      }
      case "lparen":
        stack.push(tok);
        break;
      case "rparen": {
        while (stack.length && stack[stack.length - 1].kind !== "lparen") {
          const t = stack.pop()!;
          if (t.kind === "op") out.push({ kind: "op", name: t.name });
          else if (t.kind === "fn") out.push({ kind: "fn", name: t.name, arity: t.arity });
        }
        if (!stack.length) throw new Error("Unbalanced parentheses");
        stack.pop(); // lparen
        const top = stack[stack.length - 1];
        if (top?.kind === "fn") {
          stack.pop();
          out.push({ kind: "fn", name: top.name, arity: top.arity });
        }
        break;
      }
    }
    prev = tok;
  }
  while (stack.length) {
    const t = stack.pop()!;
    if (t.kind === "lparen") throw new Error("Unbalanced parentheses");
    if (t.kind === "op") out.push({ kind: "op", name: t.name });
    else if (t.kind === "fn") out.push({ kind: "fn", name: t.name, arity: t.arity });
  }

  // Validate stack depth so evaluation can't underflow at runtime.
  let depth = 0;
  for (const item of out) {
    if (item.kind === "num" || item.kind === "var") depth++;
    else if (item.kind === "op") depth -= item.name === "u-" ? 0 : 1;
    else depth -= item.arity - 1;
    if (depth < 1) throw new Error("Malformed expression");
  }
  if (depth !== 1) throw new Error("Malformed expression");

  return { rpn: out, uses, source: src };
}

const evalStack = new Float64Array(64);

function evalRpn(rpn: RpnItem[], vars: Float64Array): number {
  let sp = 0;
  for (const item of rpn) {
    switch (item.kind) {
      case "num":
        evalStack[sp++] = item.value;
        break;
      case "var":
        evalStack[sp++] = vars[item.index];
        break;
      case "op": {
        if (item.name === "u-") {
          evalStack[sp - 1] = -evalStack[sp - 1];
          break;
        }
        const rhs = evalStack[--sp];
        const lhs = evalStack[sp - 1];
        switch (item.name) {
          case "+": evalStack[sp - 1] = lhs + rhs; break;
          case "-": evalStack[sp - 1] = lhs - rhs; break;
          case "*": evalStack[sp - 1] = lhs * rhs; break;
          case "/": evalStack[sp - 1] = Math.abs(rhs) < 1e-12 ? 0 : lhs / rhs; break;
          case "^": evalStack[sp - 1] = Math.pow(lhs, rhs); break;
        }
        break;
      }
      case "fn": {
        switch (item.name) {
          case "log": evalStack[sp - 1] = Math.log(Math.max(evalStack[sp - 1], 1e-12)); break;
          case "sqrt": evalStack[sp - 1] = Math.sqrt(Math.max(evalStack[sp - 1], 0)); break;
          case "abs": evalStack[sp - 1] = Math.abs(evalStack[sp - 1]); break;
          case "exp": evalStack[sp - 1] = Math.exp(evalStack[sp - 1]); break;
          case "min": { const r = evalStack[--sp]; evalStack[sp - 1] = Math.min(evalStack[sp - 1], r); break; }
          case "max": { const r = evalStack[--sp]; evalStack[sp - 1] = Math.max(evalStack[sp - 1], r); break; }
          case "pow": { const r = evalStack[--sp]; evalStack[sp - 1] = Math.pow(evalStack[sp - 1], r); break; }
          case "clamp": {
            const hi = evalStack[--sp];
            const lo = evalStack[--sp];
            evalStack[sp - 1] = Math.min(Math.max(evalStack[sp - 1], lo), hi);
            break;
          }
        }
        break;
      }
    }
  }
  return evalStack[0];
}

export interface ChannelRenderOptions {
  invert: boolean;
  /** Percentile normalisation bound, e.g. 0.5 clips 0.5% each end. */
  clipPercent: number;
}

/**
 * Evaluate a compiled expression per pixel and render it as a normalised
 * grayscale image. Returns min/max after percentile clipping for the UI.
 */
export function renderChannel(
  src: Uint8ClampedArray,
  out: Uint8ClampedArray,
  expr: CompiledExpression,
  opts: ChannelRenderOptions,
): { low: number; high: number } {
  const px = src.length / 4;
  const values = new Float32Array(px);
  const vars = new Float64Array(CHANNEL_VARS.length);
  const needLinear = expr.uses.has("Rl") || expr.uses.has("Gl") || expr.uses.has("Bl");
  const needLab = expr.uses.has("L") || expr.uses.has("a") || expr.uses.has("b");
  const needYcc = expr.uses.has("Y") || expr.uses.has("Cb") || expr.uses.has("Cr");
  const needHsv = expr.uses.has("H") || expr.uses.has("S") || expr.uses.has("V");

  for (let p = 0, i = 0; p < px; p++, i += 4) {
    const r = src[i] / 255;
    const g = src[i + 1] / 255;
    const b = src[i + 2] / 255;
    vars[0] = r;
    vars[1] = g;
    vars[2] = b;
    if (needLinear) {
      vars[3] = srgbToLinear(r);
      vars[4] = srgbToLinear(g);
      vars[5] = srgbToLinear(b);
    }
    if (needLab) {
      const lab = srgbToLab(r, g, b);
      vars[6] = lab[0];
      vars[7] = lab[1];
      vars[8] = lab[2];
    }
    if (needYcc) {
      const ycc = srgbToYcbcr(r, g, b);
      vars[9] = ycc[0];
      vars[10] = ycc[1];
      vars[11] = ycc[2];
    }
    if (needHsv) {
      const hsv = srgbToHsv(r, g, b);
      vars[12] = hsv[0];
      vars[13] = hsv[1];
      vars[14] = hsv[2];
    }
    values[p] = evalRpn(expr.rpn, vars);
  }

  // Percentile normalisation via histogram over the value range.
  let vmin = Infinity;
  let vmax = -Infinity;
  for (let p = 0; p < px; p++) {
    const v = values[p];
    if (Number.isFinite(v)) {
      if (v < vmin) vmin = v;
      if (v > vmax) vmax = v;
    }
  }
  if (!Number.isFinite(vmin) || vmax - vmin < 1e-12) {
    vmin = 0;
    vmax = 1;
  }
  const BINS = 2048;
  const hist = new Float64Array(BINS);
  const toBin = (v: number) =>
    Math.min(BINS - 1, Math.max(0, Math.floor(((v - vmin) / (vmax - vmin)) * BINS)));
  for (let p = 0; p < px; p++) {
    if (Number.isFinite(values[p])) hist[toBin(values[p])]++;
  }
  const clip = (Math.min(Math.max(opts.clipPercent, 0), 10) / 100) * px;
  let acc = 0;
  let low = vmin;
  for (let i = 0; i < BINS; i++) {
    acc += hist[i];
    if (acc >= clip) {
      low = vmin + (i / BINS) * (vmax - vmin);
      break;
    }
  }
  acc = 0;
  let high = vmax;
  for (let i = BINS - 1; i >= 0; i--) {
    acc += hist[i];
    if (acc >= clip) {
      high = vmin + ((i + 1) / BINS) * (vmax - vmin);
      break;
    }
  }
  const scale = 255 / Math.max(high - low, 1e-12);

  for (let p = 0, o = 0; p < px; p++, o += 4) {
    let v = (values[p] - low) * scale;
    if (!Number.isFinite(v)) v = 0;
    v = Math.min(255, Math.max(0, v));
    if (opts.invert) v = 255 - v;
    out[o] = out[o + 1] = out[o + 2] = v;
    out[o + 3] = 255;
  }
  return { low, high };
}
