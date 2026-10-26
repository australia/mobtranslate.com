"use client";

/**
 * The analysis workbench. Fully client-side: decode → hash → preview pyramid →
 * interactive stretch/channel processing → full-resolution export with a
 * reproducibility recipe. No pixel ever leaves the tab.
 *
 * Preview runs on a ≤2.2 MP pyramid level; export replays the identical code
 * path over the full-resolution pixels using the exact transform matrix the
 * preview computed (PRD §4.3, FR-DCS-007).
 */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { COLOUR_SPACES } from "@/lib/research/rock-art/engine/colorspace";
import { srgbToLab } from "@/lib/research/rock-art/engine/colorspace";
import {
  DEFAULT_PARAMS,
  type DStretchParams,
  type DStretchStats,
  type StatsRegion,
} from "@/lib/research/rock-art/engine/dstretch";
import {
  CHANNEL_PRESETS,
  compileExpression,
  renderChannel,
  type CompiledExpression,
} from "@/lib/research/rock-art/engine/channels";
import { Cancelled, runStretch } from "@/lib/research/rock-art/engine/process";
import { type ColourSample, deltaEMask, keepConnectedToSamples, sampleAt } from "@/lib/research/rock-art/engine/segment";
import { STRETCH_PRESETS } from "@/lib/research/rock-art/engine/presets";
import { buildRecipe, ENGINE_VERSION, sha256Hex } from "@/lib/research/rock-art/engine/recipe";
import { drawSamplePanel } from "@/lib/research/rock-art/engine/sample";

const PREVIEW_MP = 2_200_000;
const EXPORT_MP_CAP = 24_000_000;

interface LoadedImage {
  name: string;
  sha256: string | null;
  fullW: number;
  fullH: number;
  previewW: number;
  previewH: number;
  previewScale: number;
  previewData: ImageData;
  originalCanvas: HTMLCanvasElement;
  /** Source for full-resolution export (bitmap for files, canvas for sample). */
  fullSource: ImageBitmap | HTMLCanvasElement;
}

interface Diagnostics {
  stats: DStretchStats;
  clippedPercent: number;
  elapsedMs: number;
}

type Tab = "stretch" | "channels" | "palimpsest" | "info";
type Compare = "split" | "solo" | "blink";

/* ------------------------------------------------------------------ */
/* palimpsest — interpretive ML engine (server-side, opt-in)          */
/* ------------------------------------------------------------------ */

interface PalFigure {
  slot: number;
  objectness: number;
  class: string;
  class_probs: Record<string, number>;
  condition: string;
  condition_probs: Record<string, number>;
  order_score: number;
  visible_png: string;
  amodal_png: string;
}

interface PalAnalysis {
  figures: PalFigure[];
  harris_edges: { over_slot: number; under_slot: number; confidence: number }[];
  crop: { x: number; y: number; size: number; sent_width: number; sent_height: number };
  provenance: {
    engine: { name: string; version: string };
    decomposer: { sha256: string; step: number | null } | null;
    restorer: { sha256: string; step: number | null } | null;
    label: string;
  };
}

interface PalCompletion {
  slot: number;
  mean_png: string;
  alpha_png: string;
  uncertainty_png: string;
  candidates?: { rgb_png: string; alpha_png: string }[];
  mean_uncertainty: number;
  sampling: { samples: number; ddim_steps: number; seed: number };
}

type PalSourceName = "original" | "enhanced";

/** A figure hypothesis merged across analysis sources. */
interface MergedFigure extends PalFigure {
  source: PalSourceName;
  key: string;
  colourIdx: number;
}

interface MergedAnalysis {
  figures: MergedFigure[];
  harris: { source: PalSourceName; over_key: string; under_key: string; confidence: number }[];
  crop: PalAnalysis["crop"];
  provenance: PalAnalysis["provenance"];
}

const PAL_COLOURS = [
  "#e63c3c", "#3cc85a", "#4678f0", "#f0c83c", "#c850dc", "#46dcdc", "#f58c28", "#a0a0a0",
];

async function b64ToImage(b64: string): Promise<HTMLImageElement> {
  const img = new window.Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  return img;
}

/** Grayscale mask PNG → tinted translucent canvas (mask value drives alpha). */
async function tintMask(b64: string, hex: string, alphaScale: number): Promise<HTMLCanvasElement> {
  const img = await b64ToImage(b64);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext("2d")!;
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = d.data[i];
    d.data[i] = r;
    d.data[i + 1] = g;
    d.data[i + 2] = b;
    d.data[i + 3] = v * alphaScale;
  }
  x.putImageData(d, 0, 0);
  return c;
}

/** Completion (premultiplied RGB + alpha map) → composited RGBA canvas. */
async function completionCanvas(comp: PalCompletion): Promise<HTMLCanvasElement> {
  const [mean, alpha] = await Promise.all([b64ToImage(comp.mean_png), b64ToImage(comp.alpha_png)]);
  const c = document.createElement("canvas");
  c.width = mean.width;
  c.height = mean.height;
  const x = c.getContext("2d")!;
  x.drawImage(mean, 0, 0);
  const dm = x.getImageData(0, 0, c.width, c.height);
  const ca = document.createElement("canvas");
  ca.width = alpha.width;
  ca.height = alpha.height;
  const xa = ca.getContext("2d")!;
  xa.drawImage(alpha, 0, 0);
  const da = xa.getImageData(0, 0, ca.width, ca.height);
  for (let i = 0; i < dm.data.length; i += 4) {
    const a = da.data[i] / 255;
    // un-premultiply for display so pigment colour reads true at low alpha
    if (a > 0.02) {
      dm.data[i] = Math.min(255, dm.data[i] / a);
      dm.data[i + 1] = Math.min(255, dm.data[i + 1] / a);
      dm.data[i + 2] = Math.min(255, dm.data[i + 2] / a);
    }
    dm.data[i + 3] = da.data[i];
  }
  x.putImageData(dm, 0, 0);
  return c;
}

/** "Added only" view: completion alpha MINUS the user's remnant selection —
 * exactly what the model hypothesised, tinted pale gold. */
function addedOnlyCanvas(
  comp: PalCompletion,
  grayMask: HTMLCanvasElement,
  crop: PalAnalysis["crop"],
): Promise<HTMLCanvasElement> {
  return b64ToImage(comp.alpha_png).then((alphaImg) => {
    const n = alphaImg.width;
    const c = document.createElement("canvas");
    c.width = n;
    c.height = n;
    const x = c.getContext("2d")!;
    x.drawImage(alphaImg, 0, 0);
    const da = x.getImageData(0, 0, n, n);
    // remnant mask mapped into the analysed-square frame
    const mc = document.createElement("canvas");
    mc.width = n;
    mc.height = n;
    const mx = mc.getContext("2d")!;
    mx.drawImage(grayMask, crop.x, crop.y, crop.size, crop.size, 0, 0, n, n);
    const dm = mx.getImageData(0, 0, n, n);
    const out = x.createImageData(n, n);
    for (let i = 0; i < da.data.length; i += 4) {
      const added = Math.max(0, da.data[i] - (dm.data[i] > 127 ? 255 : 0));
      out.data[i] = 255;
      out.data[i + 1] = 235;
      out.data[i + 2] = 170;
      out.data[i + 3] = added * 0.9;
    }
    x.putImageData(out, 0, 0);
    return c;
  });
}

interface View {
  scale: number;
  tx: number;
  ty: number;
}

const fmt = (v: number, d = 3) =>
  Number.isFinite(v) ? v.toFixed(d) : "—";

export default function Workbench() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [params, setParams] = useState<DStretchParams>({ ...DEFAULT_PARAMS });
  const [presetId, setPresetId] = useState<string>("general-lab");
  const [tab, setTab] = useState<Tab>("stretch");
  const [roi, setRoi] = useState<StatsRegion | null>(null);
  const [roiMode, setRoiMode] = useState(false);
  const [compare, setCompare] = useState<Compare>("split");
  const [splitPos, setSplitPos] = useState(0.5);
  const [holdOriginal, setHoldOriginal] = useState(false);
  const [blinkPhase, setBlinkPhase] = useState(false);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<number | null>(null);
  const [channelExpr, setChannelExpr] = useState<string>("a");
  const [channelInvert, setChannelInvert] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);

  const [pal, setPal] = useState<MergedAnalysis | null>(null);
  const [palBusy, setPalBusy] = useState<false | "analyze" | "complete">(false);
  const [palError, setPalError] = useState<string | null>(null);
  const [palSelected, setPalSelected] = useState<string | null>(null);
  const [palCompletions, setPalCompletions] = useState<Record<string, PalCompletion>>({});
  const [palShowCompletion, setPalShowCompletion] = useState(true);
  const [palSource, setPalSource] = useState<"both" | "enhanced" | "original">("both");
  const [palOverlayTick, setPalOverlayTick] = useState(0);
  const [palPickMode, setPalPickMode] = useState(false);
  const [palSamples, setPalSamples] = useState<ColourSample[]>([]);
  const [palDeltaE, setPalDeltaE] = useState(16);
  const [palMaskCoverage, setPalMaskCoverage] = useState(0);
  const [palWhole, setPalWhole] = useState<(PalCompletion & { crop: PalAnalysis["crop"] }) | null>(null);
  const [palShowWhole, setPalShowWhole] = useState(true);
  const [palWholeView, setPalWholeView] = useState<"completion" | "added">("completion");
  // -1 = ensemble mean; 0..N-1 = an individual candidate hypothesis
  const [palCandidate, setPalCandidate] = useState(-1);
  const palMaskRef = useRef<{ tint: HTMLCanvasElement; gray: HTMLCanvasElement } | null>(null);
  const palWholeOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const palModalRef = useRef<HTMLDialogElement>(null);
  const palOverlayRef = useRef<{
    slot: number;
    vis: HTMLCanvasElement;
    amo: HTMLCanvasElement;
    comp: HTMLCanvasElement | null;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processedRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const roiDraftRef = useRef<StatsRegion | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  /* ------------------------------------------------------------------ */
  /* Drawing                                                            */
  /* ------------------------------------------------------------------ */

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "oklch(0.13 0.004 20)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!image) return;

    const { scale, tx, ty } = viewRef.current;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, tx * dpr, ty * dpr);
    ctx.imageSmoothingEnabled = scale < 3;

    const processed = processedRef.current;
    const showOriginalOnly =
      holdOriginal || (compare === "blink" && blinkPhase) || !processed;

    if (showOriginalOnly) {
      ctx.drawImage(image.originalCanvas, 0, 0);
    } else if (compare === "split") {
      ctx.drawImage(image.originalCanvas, 0, 0);
      const splitX = image.previewW * splitPos;
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, image.previewW - splitX, image.previewH);
      ctx.clip();
      ctx.drawImage(processed, 0, 0);
      ctx.restore();
      ctx.strokeStyle = "rgba(240,236,235,0.85)";
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, image.previewH);
      ctx.stroke();
    } else {
      ctx.drawImage(processed, 0, 0);
    }

    const activeRoi = roiDraftRef.current ?? roi;
    if (activeRoi) {
      ctx.strokeStyle = "oklch(0.7 0.18 12)";
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeRect(activeRoi.x, activeRoi.y, activeRoi.width, activeRoi.height);
      ctx.setLineDash([]);
    }

    // palimpsest figure overlays (masks live in sent-image == preview coords)
    const po = palOverlayRef.current;
    if (tab === "palimpsest" && pal && po && !showOriginalOnly) {
      const c = pal.crop;
      if (po.comp && palShowCompletion) {
        ctx.drawImage(po.comp, c.x, c.y, c.size, c.size);
      } else {
        ctx.drawImage(po.amo, c.x, c.y, c.size, c.size);
        ctx.drawImage(po.vis, c.x, c.y, c.size, c.size);
      }
    }
    // sampled-pigment selection (full preview coords) + whole-figure completion
    if (tab === "palimpsest" && !showOriginalOnly) {
      if (palWhole && palShowWhole && palWholeOverlayRef.current) {
        const c = palWhole.crop;
        ctx.drawImage(palWholeOverlayRef.current, c.x, c.y, c.size, c.size);
      } else if (palMaskRef.current && (palPickMode || palSamples.length > 0)) {
        ctx.drawImage(palMaskRef.current.tint, 0, 0);
      }
    }
  }, [image, compare, splitPos, holdOriginal, blinkPhase, roi, tab, pal, palShowCompletion,
      palOverlayTick, palWhole, palShowWhole, palPickMode, palSamples]);

  useEffect(() => {
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [draw, view, diag]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(() => requestAnimationFrame(draw));
    obs.observe(container);
    return () => obs.disconnect();
  }, [draw]);

  /* ------------------------------------------------------------------ */
  /* View helpers                                                       */
  /* ------------------------------------------------------------------ */

  const fitView = useCallback((img: LoadedImage) => {
    const container = containerRef.current;
    if (!container) return;
    const scale = Math.min(
      container.clientWidth / img.previewW,
      container.clientHeight / img.previewH,
    ) * 0.97;
    setView({
      scale,
      tx: (container.clientWidth - img.previewW * scale) / 2,
      ty: (container.clientHeight - img.previewH * scale) / 2,
    });
  }, []);

  const zoom100 = useCallback(() => {
    if (!image) return;
    const container = containerRef.current!;
    // 100% means one *source* pixel per CSS pixel: preview scale compensates.
    const scale = 1 / image.previewScale;
    setView({
      scale,
      tx: (container.clientWidth - image.previewW * scale) / 2,
      ty: (container.clientHeight - image.previewH * scale) / 2,
    });
  }, [image]);

  const toImageCoords = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const { scale, tx, ty } = viewRef.current;
    return {
      x: (clientX - rect.left - tx) / scale,
      y: (clientY - rect.top - ty) / scale,
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* Loading                                                            */
  /* ------------------------------------------------------------------ */

  const installImage = useCallback(
    (img: LoadedImage) => {
      processedRef.current = null;
      setDiag(null);
      setRoi(null);
      setRoiMode(false);
      setLoadError(null);
      setPal(null);
      setPalError(null);
      setPalSelected(null);
      setPalCompletions({});
      setPalPickMode(false);
      setPalSamples([]);
      setPalWhole(null);
      palMaskRef.current = null;
      palWholeOverlayRef.current = null;
      palOverlayRef.current = null;
      setImage(img);
      requestAnimationFrame(() => fitView(img));
    },
    [fitView],
  );

  const loadFile = useCallback(
    async (file: File) => {
      try {
        setBusy(true);
        const buf = await file.arrayBuffer();
        const sha256 = await sha256Hex(buf);
        const blob = new Blob([buf], { type: file.type });
        let bitmap: ImageBitmap;
        try {
          bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
        } catch {
          bitmap = await createImageBitmap(blob);
        }
        const fullW = bitmap.width;
        const fullH = bitmap.height;
        const previewScale = Math.min(1, Math.sqrt(PREVIEW_MP / (fullW * fullH)));
        const previewW = Math.max(1, Math.round(fullW * previewScale));
        const previewH = Math.max(1, Math.round(fullH * previewScale));
        const canvas = document.createElement("canvas");
        canvas.width = previewW;
        canvas.height = previewH;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0, previewW, previewH);
        installImage({
          name: file.name,
          sha256,
          fullW,
          fullH,
          previewW,
          previewH,
          previewScale,
          previewData: ctx.getImageData(0, 0, previewW, previewH),
          originalCanvas: canvas,
          fullSource: bitmap,
        });
      } catch {
        setLoadError(
          `Could not decode "${file.name}". The browser edition reads JPEG, PNG, WebP and AVIF (RAW and TIFF need the desktop build).`,
        );
      } finally {
        setBusy(false);
      }
    },
    [installImage],
  );

  const loadSample = useCallback(() => {
    const W = 1600;
    const H = 1000;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    drawSamplePanel(ctx, W, H);
    installImage({
      name: "sample-panel.synthetic",
      sha256: null,
      fullW: W,
      fullH: H,
      previewW: W,
      previewH: H,
      previewScale: 1,
      previewData: ctx.getImageData(0, 0, W, H),
      originalCanvas: canvas,
      fullSource: canvas,
    });
  }, [installImage]);

  /* ------------------------------------------------------------------ */
  /* Processing                                                         */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!image || tab !== "stretch") return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const out = new Uint8ClampedArray(image.previewW * image.previewH * 4);
        const run = await runStretch(
          image.previewData.data,
          image.previewW,
          image.previewH,
          params,
          out,
          { region: roi, signal: controller.signal },
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.previewW;
        canvas.height = image.previewH;
        canvas
          .getContext("2d")!
          .putImageData(new ImageData(out, image.previewW, image.previewH), 0, 0);
        processedRef.current = canvas;
        setDiag({
          stats: run.stats,
          clippedPercent: run.result.clippedPercent,
          elapsedMs: run.elapsedMs,
        });
      } catch (err) {
        if (!(err instanceof Cancelled)) throw err;
      } finally {
        if (abortRef.current === controller) setBusy(false);
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [image, params, roi, tab]);

  const compiledExpr: CompiledExpression | null = useMemo(() => {
    try {
      const c = compileExpression(channelExpr);
      setChannelError(null);
      return c;
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [channelExpr]);

  useEffect(() => {
    if (!image || tab !== "channels" || !compiledExpr) return;
    const timer = setTimeout(() => {
      setBusy(true);
      // Channel rendering is synchronous; yield one frame so the busy state paints.
      requestAnimationFrame(() => {
        const out = new Uint8ClampedArray(image.previewW * image.previewH * 4);
        renderChannel(image.previewData.data, out, compiledExpr, {
          invert: channelInvert,
          clipPercent: 0.5,
        });
        const canvas = document.createElement("canvas");
        canvas.width = image.previewW;
        canvas.height = image.previewH;
        canvas
          .getContext("2d")!
          .putImageData(new ImageData(out, image.previewW, image.previewH), 0, 0);
        processedRef.current = canvas;
        setBusy(false);
        requestAnimationFrame(draw);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [image, tab, compiledExpr, channelInvert, draw]);

  /* ------------------------------------------------------------------ */
  /* palimpsest requests + overlays                                     */
  /* ------------------------------------------------------------------ */

  const sendCanvas = useCallback(async (url: string, canvas: HTMLCanvasElement) => {
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("could not encode image"))),
        "image/jpeg",
        0.9,
      ),
    );
    const r = await fetch(url, { method: "POST", body: blob });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j;
  }, []);

  const palAnalyze = useCallback(async () => {
    if (!image) return;
    setPalBusy("analyze");
    setPalError(null);
    try {
      // Analyse the original photograph AND the current enhancement (when one
      // exists), then merge: the model was trained on natural colour, so the
      // original usually detects more — but faint pigment sometimes only
      // separates after a stretch. Both perspectives are hypotheses.
      const sources: [PalSourceName, HTMLCanvasElement][] = [];
      if (palSource !== "enhanced") sources.push(["original", image.originalCanvas]);
      if (palSource !== "original" && processedRef.current)
        sources.push(["enhanced", processedRef.current]);
      if (sources.length === 0) sources.push(["original", image.originalCanvas]);

      const figures: MergedFigure[] = [];
      const harris: MergedAnalysis["harris"] = [];
      let crop: PalAnalysis["crop"] | null = null;
      let prov: PalAnalysis["provenance"] | null = null;
      for (const [source, canvas] of sources) {
        const j = (await sendCanvas("/api/admin/research/rock-art/palimpsest/analyze", canvas)) as PalAnalysis;
        crop = j.crop;
        prov = j.provenance;
        for (const f of j.figures) {
          figures.push({ ...f, source, key: `${source}:${f.slot}`, colourIdx: 0 });
        }
        for (const e of j.harris_edges) {
          harris.push({
            source,
            over_key: `${source}:${e.over_slot}`,
            under_key: `${source}:${e.under_slot}`,
            confidence: e.confidence,
          });
        }
      }
      figures.sort((a, b) => b.objectness - a.objectness);
      figures.forEach((f, i) => {
        f.colourIdx = i % PAL_COLOURS.length;
      });
      setPal(crop && prov ? { figures, harris, crop, provenance: prov } : null);
      setPalCompletions({});
      setPalSelected(figures.length ? figures[0].key : null);
    } catch (err) {
      setPalError(err instanceof Error ? err.message : String(err));
    } finally {
      setPalBusy(false);
    }
  }, [image, palSource, sendCanvas]);

  const palComplete = useCallback(async () => {
    const fig = pal?.figures.find((f) => f.key === palSelected);
    if (!image || !fig) return;
    setPalBusy("complete");
    setPalError(null);
    try {
      const canvas =
        fig.source === "enhanced" && processedRef.current
          ? processedRef.current
          : image.originalCanvas;
      const j = (await sendCanvas(
        `/api/admin/research/rock-art/palimpsest/complete?slot=${fig.slot}`,
        canvas,
      )) as PalCompletion;
      setPalCompletions((m) => ({ ...m, [fig.key]: j }));
      setPalShowCompletion(true);
    } catch (err) {
      setPalError(err instanceof Error ? err.message : String(err));
    } finally {
      setPalBusy(false);
    }
  }, [image, pal, palSelected, sendCanvas]);

  useEffect(() => {
    let cancelled = false;
    const fig = pal?.figures.find((f) => f.key === palSelected);
    if (!fig) {
      palOverlayRef.current = null;
      setPalOverlayTick((t) => t + 1);
      return;
    }
    const colour = PAL_COLOURS[fig.colourIdx];
    const comp = palCompletions[fig.key];
    Promise.all([
      tintMask(fig.visible_png, colour, 0.55),
      tintMask(fig.amodal_png, "#f0a028", 0.3),
      comp ? completionCanvas(comp) : Promise.resolve(null),
    ]).then(([vis, amo, compCanvas]) => {
      if (cancelled) return;
      palOverlayRef.current = { slot: fig.slot, vis, amo, comp: compCanvas };
      setPalOverlayTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [pal, palSelected, palCompletions]);

  // live ΔE selection mask from sampled pigment colours
  useEffect(() => {
    if (!image || palSamples.length === 0) {
      palMaskRef.current = null;
      setPalMaskCoverage(0);
      setPalOverlayTick((t) => t + 1);
      return;
    }
    const timer = setTimeout(() => {
      const { previewW: w, previewH: h, previewData } = image;
      const mask = new Uint8ClampedArray(w * h);
      deltaEMask(previewData, palSamples, palDeltaE, mask);
      // keep only what's connected to the user's clicks — drops colour-alike
      // speckle elsewhere on the panel
      const coverage = keepConnectedToSamples(mask, w, h, palSamples);
      const gray = document.createElement("canvas");
      gray.width = w;
      gray.height = h;
      const gx = gray.getContext("2d")!;
      const gd = gx.createImageData(w, h);
      const tint = document.createElement("canvas");
      tint.width = w;
      tint.height = h;
      const tx = tint.getContext("2d")!;
      const td = tx.createImageData(w, h);
      for (let p = 0, o = 0; p < mask.length; p++, o += 4) {
        const v = mask[p];
        gd.data[o] = gd.data[o + 1] = gd.data[o + 2] = v;
        gd.data[o + 3] = 255;
        td.data[o] = 60;
        td.data[o + 1] = 200;
        td.data[o + 2] = 90;
        td.data[o + 3] = v ? 110 : 0;
      }
      gx.putImageData(gd, 0, 0);
      tx.putImageData(td, 0, 0);
      palMaskRef.current = { tint, gray };
      setPalMaskCoverage(coverage);
      setPalOverlayTick((t) => t + 1);
    }, 120);
    return () => clearTimeout(timer);
  }, [image, palSamples, palDeltaE]);

  const palCompleteWhole = useCallback(async () => {
    if (!image || !palMaskRef.current) return;
    setPalBusy("complete");
    setPalError(null);
    try {
      const image_b64 = image.originalCanvas.toDataURL("image/jpeg", 0.9).split(",")[1];
      const mask_b64 = palMaskRef.current.gray.toDataURL("image/png").split(",")[1];
      const r = await fetch("/api/admin/research/rock-art/palimpsest/complete-mask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image_b64, mask_b64 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setPalWhole(j);
      setPalShowWhole(true);
      setPalCandidate(-1);
    } catch (err) {
      setPalError(err instanceof Error ? err.message : String(err));
    } finally {
      setPalBusy(false);
    }
  }, [image]);

  // whole-figure overlay canvas follows the completion + selected view mode
  // and candidate (-1 = ensemble mean, otherwise one discrete hypothesis)
  useEffect(() => {
    let cancelled = false;
    if (!palWhole) {
      palWholeOverlayRef.current = null;
      setPalOverlayTick((t) => t + 1);
      return;
    }
    const cand = palWhole.candidates?.[palCandidate];
    const source: PalCompletion = cand
      ? { ...palWhole, mean_png: cand.rgb_png, alpha_png: cand.alpha_png }
      : palWhole;
    const build =
      palWholeView === "added" && palMaskRef.current
        ? addedOnlyCanvas(source, palMaskRef.current.gray, palWhole.crop)
        : completionCanvas(source);
    build.then((c) => {
      if (cancelled) return;
      palWholeOverlayRef.current = c;
      setPalOverlayTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [palWhole, palWholeView, palCandidate]);

  /* ------------------------------------------------------------------ */
  /* Export                                                             */
  /* ------------------------------------------------------------------ */

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const recipe = useMemo(() => {
    if (!image || !diag) return null;
    return buildRecipe(
      presetId ?? "custom",
      image.name,
      image.sha256,
      image.fullW,
      image.fullH,
      params,
      roi
        ? {
            x: roi.x / image.previewScale,
            y: roi.y / image.previewScale,
            width: roi.width / image.previewScale,
            height: roi.height / image.previewScale,
          }
        : null,
      diag.stats,
    );
  }, [image, diag, params, roi, presetId]);

  const exportPng = useCallback(async () => {
    if (!image) return;
    setExporting(0);
    try {
      // Full-resolution replay, capped for browser memory.
      const mp = image.fullW * image.fullH;
      const exportScale = Math.min(1, Math.sqrt(EXPORT_MP_CAP / mp));
      const W = Math.round(image.fullW * exportScale);
      const H = Math.round(image.fullH * exportScale);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image.fullSource, 0, 0, W, H);
      const src = ctx.getImageData(0, 0, W, H);
      const out = new Uint8ClampedArray(W * H * 4);
      let suffix: string;
      if (tab === "channels" && compiledExpr) {
        renderChannel(src.data, out, compiledExpr, {
          invert: channelInvert,
          clipPercent: 0.5,
        });
        suffix = "channel";
      } else if (diag) {
        await runStretch(src.data, W, H, params, out, {
          fixedStats: { mean: diag.stats.mean, transform: diag.stats.transform },
          onProgress: setExporting,
        });
        suffix = `dstretch-${params.colourSpace}-s${params.strength}`;
      } else {
        return;
      }
      ctx.putImageData(new ImageData(out, W, H), 0, 0);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("encode failed");
      const stem = image.name.replace(/\.[^.]+$/, "");
      const short = image.sha256 ? image.sha256.slice(0, 8) : "synthetic";
      downloadBlob(blob, `${stem}_${suffix}_${short}.png`);
      if (recipe) {
        downloadBlob(
          new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }),
          `${stem}_${suffix}_${short}.recipe.json`,
        );
      }
    } finally {
      setExporting(null);
    }
  }, [image, tab, compiledExpr, channelInvert, diag, params, recipe]);

  /* ------------------------------------------------------------------ */
  /* Pointer + keyboard                                                 */
  /* ------------------------------------------------------------------ */

  const updateInspector = useCallback(
    (clientX: number, clientY: number) => {
      const el = statusRef.current;
      if (!el || !image) return;
      const { x, y } = toImageCoords(clientX, clientY);
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      if (xi < 0 || yi < 0 || xi >= image.previewW || yi >= image.previewH) {
        el.textContent = "";
        return;
      }
      const i = (yi * image.previewW + xi) * 4;
      const d = image.previewData.data;
      const [L, a, b] = srgbToLab(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      const sx = Math.round(xi / image.previewScale);
      const sy = Math.round(yi / image.previewScale);
      el.textContent = `${sx},${sy}  RGB ${d[i]} ${d[i + 1]} ${d[i + 2]}  L* ${L.toFixed(1)} a* ${a.toFixed(1)} b* ${b.toFixed(1)}`;
    },
    [image, toImageCoords],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!image) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (tab === "palimpsest" && palPickMode) {
      const p = toImageCoords(e.clientX, e.clientY);
      const xi = Math.round(p.x);
      const yi = Math.round(p.y);
      if (xi >= 0 && yi >= 0 && xi < image.previewW && yi < image.previewH) {
        setPalWhole(null);
        palWholeOverlayRef.current = null;
        setPalSamples((s) => [...s.slice(-5), sampleAt(image.previewData, xi, yi)]);
      }
      return;
    }
    if (roiMode) {
      const p = toImageCoords(e.clientX, e.clientY);
      roiDraftRef.current = { x: p.x, y: p.y, width: 0, height: 0 };
    } else {
      panRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: viewRef.current.tx,
        ty: viewRef.current.ty,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    updateInspector(e.clientX, e.clientY);
    if (roiMode && roiDraftRef.current) {
      const p = toImageCoords(e.clientX, e.clientY);
      const d = roiDraftRef.current;
      roiDraftRef.current = { ...d, width: p.x - d.x, height: p.y - d.y };
      requestAnimationFrame(draw);
    } else if (panRef.current) {
      const p = panRef.current;
      setView((v) => ({
        ...v,
        tx: p.tx + (e.clientX - p.x),
        ty: p.ty + (e.clientY - p.y),
      }));
    }
  };

  const onPointerUp = () => {
    if (roiMode && roiDraftRef.current) {
      let { x, y, width, height } = roiDraftRef.current;
      if (width < 0) {
        x += width;
        width = -width;
      }
      if (height < 0) {
        y += height;
        height = -height;
      }
      roiDraftRef.current = null;
      if (width > 8 && height > 8 && image) {
        setRoi({
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: Math.min(width, image.previewW - Math.max(0, x)),
          height: Math.min(height, image.previewH - Math.max(0, y)),
        });
      }
      setRoiMode(false);
    }
    panRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!image) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const scale = Math.min(64, Math.max(0.02, v.scale * factor));
      const k = scale / v.scale;
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  };

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement;
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setHoldOriginal(true);
      } else if (e.key === "b" || e.key === "B") {
        setCompare((c) => (c === "blink" ? "split" : "blink"));
      } else if (e.key === "f" || e.key === "F") {
        if (image) fitView(image);
      } else if (e.key === "1") {
        zoom100();
      } else if (e.key === "r" || e.key === "R") {
        setRoiMode((m) => !m);
      } else if (e.key === "Escape") {
        setRoiMode(false);
        setPalPickMode(false);
        roiDraftRef.current = null;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setHoldOriginal(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [image, fitView, zoom100]);

  useEffect(() => {
    if (compare !== "blink") return;
    const t = setInterval(() => setBlinkPhase((p) => !p), 400);
    return () => clearInterval(t);
  }, [compare]);

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  const setParam = <K extends keyof DStretchParams>(key: K, value: DStretchParams[K]) => {
    setPresetId("custom");
    setParams((p) => ({ ...p, [key]: value }));
  };

  return (
    <div className="flex h-[calc(100dvh-var(--research-bar-height,0px))] flex-col bg-ra-bg text-ra-ink">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ra-line px-4 py-2">
        <Link href="/admin/research/rock-art" className="font-mono text-xs text-ra-ink-2 hover:text-ra-ink">
          rockpaintings
        </Link>
        <span className="hidden font-mono text-xs text-ra-ink-3 sm:inline">workbench</span>
        <div className="mx-2 h-4 w-px bg-ra-line" aria-hidden />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="border border-ra-line-strong px-3 py-1.5 text-xs font-bold hover:border-ra-ink"
        >
          Open photograph…
        </button>
        <button
          type="button"
          onClick={loadSample}
          className="border border-ra-line px-3 py-1.5 text-xs text-ra-ink-2 hover:border-ra-line-strong hover:text-ra-ink"
        >
          Load sample panel
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadFile(f);
            e.target.value = "";
          }}
        />
        {image && (
          <span className="max-w-56 truncate font-mono text-xs text-ra-ink-3" title={image.name}>
            {image.name} · {image.fullW}×{image.fullH}
          </span>
        )}
        <div className="ms-auto flex items-center gap-2">
          {image && (
            <>
              <div className="flex" role="group" aria-label="Comparison mode">
                {(["split", "solo", "blink"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCompare(m)}
                    aria-pressed={compare === m}
                    className={`border border-ra-line px-2.5 py-1.5 text-xs first:rounded-s last:rounded-e ${
                      compare === m
                        ? "border-ra-line-strong bg-ra-panel-2 text-ra-ink"
                        : "text-ra-ink-2 hover:text-ra-ink"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={exportPng}
                disabled={exporting !== null || (!diag && tab !== "channels")}
                className="border border-ra-red bg-ra-red-deep/40 px-3 py-1.5 text-xs font-bold hover:bg-ra-red-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                {exporting !== null
                  ? `Exporting ${Math.round(exporting * 100)}%`
                  : "Export PNG + recipe"}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Canvas */}
        <div
          ref={containerRef}
          className="relative min-w-0 flex-1 overflow-hidden bg-ra-bg-deep"
          style={{ cursor: roiMode || (tab === "palimpsest" && palPickMode) ? "crosshair" : panRef.current ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) loadFile(f);
          }}
        >
          <canvas ref={canvasRef} className="block h-full w-full" />

          {!image && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md border border-ra-line bg-ra-panel p-8 text-center">
                <h1 className="text-lg font-extrabold" style={{ fontStretch: "112%" }}>
                  Drop a photograph anywhere
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-ra-ink-2">
                  It is decoded and analysed in this tab. Nothing uploads, the file is
                  never modified, and closing the tab leaves no trace.
                </p>
                <div className="mt-6 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-ra-red bg-ra-red-deep/40 px-4 py-2 text-sm font-bold hover:bg-ra-red-deep"
                  >
                    Choose a file
                  </button>
                  <button
                    type="button"
                    onClick={loadSample}
                    className="text-sm text-ra-ink-2 underline decoration-ra-line-strong underline-offset-4 hover:text-ra-ink"
                  >
                    …or load the synthetic sample panel
                  </button>
                </div>
                {loadError && (
                  <p className="mt-4 border border-ra-warn/40 bg-ra-warn/10 p-2 font-mono text-xs text-ra-warn">
                    {loadError}
                  </p>
                )}
                <p className="mt-6 font-mono text-[11px] leading-relaxed text-ra-ink-3">
                  JPEG · PNG · WebP · AVIF — hold Space for the original, drag with R
                  for region statistics, F fits, 1 is 100%
                </p>
              </div>
            </div>
          )}

          {roiMode && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 border border-ra-red bg-ra-bg/90 px-3 py-1.5 font-mono text-xs text-ra-red-bright">
              drag a rectangle — statistics will come from it (Esc cancels)
            </div>
          )}
          {tab === "palimpsest" && palPickMode && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 border border-ra-red bg-ra-bg/90 px-3 py-1.5 font-mono text-xs text-ra-red-bright">
              click points on the figure&apos;s pigment — green = selected remnant (Esc when done)
            </div>
          )}
          {holdOriginal && image && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 border border-ra-line bg-ra-bg/90 px-3 py-1.5 font-mono text-xs text-ra-ink-2">
              original
            </div>
          )}
        </div>

        {/* Control panel */}
        {image && (
          <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-s border-ra-line bg-ra-panel">
            <nav className="flex border-b border-ra-line" role="tablist">
              {(["stretch", "channels", "palimpsest", "info"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-3 py-2.5 text-xs font-bold ${
                    tab === t
                      ? "border-b-2 border-ra-red-bright text-ra-ink"
                      : "text-ra-ink-3 hover:text-ra-ink-2"
                  }`}
                >
                  {t}
                </button>
              ))}
            </nav>

            {tab === "stretch" && (
              <div className="flex flex-col gap-5 p-4">
                <div>
                  <span className="font-mono text-[11px] text-ra-ink-3">presets — named parameter sets, nothing hidden</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {STRETCH_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        title={p.hint}
                        onClick={() => {
                          setPresetId(p.id);
                          setParams({ ...p.params });
                        }}
                        className={`border px-2 py-1 text-xs ${
                          presetId === p.id
                            ? "border-ra-red bg-ra-red-deep/40 text-ra-ink"
                            : "border-ra-line text-ra-ink-2 hover:border-ra-line-strong"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold">Colour space</span>
                  <select
                    value={params.colourSpace}
                    onChange={(e) => setParam("colourSpace", e.target.value as DStretchParams["colourSpace"])}
                    className="border border-ra-line bg-ra-panel-2 px-2 py-1.5 text-sm"
                  >
                    {COLOUR_SPACES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold">Statistics matrix</span>
                  <select
                    value={params.matrixMode}
                    onChange={(e) => setParam("matrixMode", e.target.value as DStretchParams["matrixMode"])}
                    className="border border-ra-line bg-ra-panel-2 px-2 py-1.5 text-sm"
                  >
                    <option value="covariance">Covariance</option>
                    <option value="correlation">Correlation</option>
                  </select>
                </label>

                <Slider
                  label="Strength"
                  value={params.strength}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => setParam("strength", v)}
                />
                <Slider
                  label="Maximum gain"
                  value={params.maxGain}
                  min={1}
                  max={20}
                  step={0.5}
                  onChange={(v) => setParam("maxGain", v)}
                />
                <Slider
                  label="Clip percentile"
                  value={params.clipPercent}
                  min={0}
                  max={5}
                  step={0.05}
                  onChange={(v) => setParam("clipPercent", v)}
                  suffix="%"
                />
                <Slider
                  label="Saturation"
                  value={params.saturation}
                  min={0}
                  max={2}
                  step={0.05}
                  onChange={(v) => setParam("saturation", v)}
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRoiMode((m) => !m)}
                    aria-pressed={roiMode}
                    className={`border px-2.5 py-1.5 text-xs ${
                      roiMode
                        ? "border-ra-red bg-ra-red-deep/40"
                        : "border-ra-line text-ra-ink-2 hover:border-ra-line-strong"
                    }`}
                  >
                    {roi ? "Redraw statistics region" : "Statistics from region (R)"}
                  </button>
                  {roi && (
                    <button
                      type="button"
                      onClick={() => setRoi(null)}
                      className="text-xs text-ra-ink-3 underline underline-offset-2 hover:text-ra-ink"
                    >
                      clear
                    </button>
                  )}
                </div>
                {roi && (
                  <p className="font-mono text-[11px] text-ra-ink-3">
                    statistics: {Math.round(roi.width)}×{Math.round(roi.height)} px region ·
                    transform still applies to the whole image
                  </p>
                )}

                {diag && <DiagnosticsPanel diag={diag} />}
              </div>
            )}

            {tab === "channels" && (
              <div className="flex flex-col gap-5 p-4">
                <div>
                  <span className="font-mono text-[11px] text-ra-ink-3">channel formulas</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CHANNEL_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        title={p.hint}
                        onClick={() => setChannelExpr(p.expression)}
                        className={`border px-2 py-1 font-mono text-xs ${
                          channelExpr === p.expression
                            ? "border-ra-red bg-ra-red-deep/40 text-ra-ink"
                            : "border-ra-line text-ra-ink-2 hover:border-ra-line-strong"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold">Expression</span>
                  <input
                    value={channelExpr}
                    onChange={(e) => setChannelExpr(e.target.value)}
                    spellCheck={false}
                    className={`border bg-ra-panel-2 px-2 py-1.5 font-mono text-sm ${
                      channelError ? "border-ra-warn" : "border-ra-line"
                    }`}
                    aria-invalid={!!channelError}
                    aria-describedby="expr-help"
                  />
                  {channelError ? (
                    <span className="font-mono text-[11px] text-ra-warn">{channelError}</span>
                  ) : (
                    <span id="expr-help" className="font-mono text-[11px] leading-relaxed text-ra-ink-3">
                      channels R G B · Rl Gl Bl · L a b · Y Cb Cr · H S V — functions log
                      sqrt abs exp pow min max clamp · constant eps
                    </span>
                  )}
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={channelInvert}
                    onChange={(e) => setChannelInvert(e.target.checked)}
                    className="accent-[oklch(0.54_0.2_8)]"
                  />
                  Invert
                </label>

                <p className="font-mono text-[11px] leading-relaxed text-ra-ink-3">
                  Output is the expression evaluated per pixel, percentile-normalised
                  (0.5%) to grayscale. Lab a* is the classic first look for red pigment.
                </p>
              </div>
            )}

            {tab === "palimpsest" && (
              <div className="flex flex-col gap-4 p-4">
                <p className="text-[13px] leading-relaxed text-ra-ink-2">
                  Finds the individual figures in this panel — even where they
                  overlap — and can sketch what each may have looked like whole.
                </p>
                <div className="flex items-baseline justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => palModalRef.current?.showModal()}
                    className="text-xs text-ra-red-bright underline decoration-ra-red-deep underline-offset-4 hover:decoration-ra-red-bright"
                  >
                    How it works — and what to trust
                  </button>
                  <span className="font-mono text-[10px] text-ra-ink-3">
                    uses this site&apos;s server
                  </span>
                </div>
                <button
                  type="button"
                  onClick={palAnalyze}
                  disabled={palBusy !== false}
                  className="border border-ra-red bg-ra-red-deep/40 px-3 py-2 text-xs font-bold hover:bg-ra-red-deep disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {palBusy === "analyze"
                    ? "Analysing…"
                    : pal
                      ? "Re-analyse"
                      : "Find the figures"}
                </button>
                <details className="border border-ra-line">
                  <summary className="cursor-pointer px-2.5 py-2 text-xs font-bold text-ra-ink-2">
                    Options
                  </summary>
                  <div className="flex flex-col gap-1.5 border-t border-ra-line p-2.5">
                    <span className="text-xs font-bold">Analysis source</span>
                    <div className="flex" role="group" aria-label="Analysis source">
                      {(
                        [
                          ["both", "both"],
                          ["original", "original"],
                          ["enhanced", "enhancement"],
                        ] as const
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPalSource(v)}
                          aria-pressed={palSource === v}
                          className={`flex-1 border border-ra-line px-2 py-1.5 text-xs ${
                            palSource === v
                              ? "border-ra-line-strong bg-ra-panel-2 text-ra-ink"
                              : "text-ra-ink-2 hover:text-ra-ink"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <span className="font-mono text-[10px] leading-relaxed text-ra-ink-3">
                      the model reads natural colour best, but faint pigment
                      sometimes only separates after a stretch — &ldquo;both&rdquo;
                      analyses each and merges the hypotheses
                    </span>
                  </div>
                </details>
                {palError && (
                  <p className="border border-ra-warn/40 bg-ra-warn/10 p-2 font-mono text-[11px] text-ra-warn">
                    {palError}
                  </p>
                )}

                {pal && pal.figures.length === 0 && (
                  <p className="font-mono text-[11px] text-ra-ink-3">
                    No figure hypotheses above threshold.
                  </p>
                )}

                {pal && pal.figures.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-[11px] text-ra-ink-3">
                      figure hypotheses — select to overlay
                    </span>
                    {pal.figures.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setPalSelected(f.key)}
                        aria-pressed={palSelected === f.key}
                        className={`flex items-baseline gap-2 border px-2 py-1.5 text-left text-xs ${
                          palSelected === f.key
                            ? "border-ra-line-strong bg-ra-panel-2"
                            : "border-ra-line text-ra-ink-2 hover:border-ra-line-strong"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="inline-block size-2.5 shrink-0 self-center rounded-full"
                          style={{ background: PAL_COLOURS[f.colourIdx] }}
                        />
                        <span className="font-bold">{f.class}</span>
                        <span className="font-mono text-[11px] text-ra-ink-3">
                          p={f.objectness.toFixed(2)} · {f.condition} ·{" "}
                          {f.source === "enhanced" ? "enh" : "orig"}
                        </span>
                      </button>
                    ))}
                    <p className="font-mono text-[10px] leading-relaxed text-ra-ink-3">
                      overlay: figure colour = visible remnant · orange = inferred
                      full extent (amodal)
                    </p>
                  </div>
                )}

                {pal && palSelected !== null && (
                  <div className="flex flex-col gap-2 border-t border-ra-line pt-3">
                    <span className="text-xs font-bold">Completion (hypothesis)</span>
                    {palCompletions[palSelected] ? (
                      <>
                        <div className="flex gap-2">
                          {(
                            [
                              ["mean_png", "mean of 4 samples"],
                              ["uncertainty_png", "uncertainty (hot = unsure)"],
                            ] as const
                          ).map(([k, label]) => (
                            <figure key={k} className="m-0 flex-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`data:image/png;base64,${palCompletions[palSelected][k]}`}
                                alt={label}
                                className="w-full border border-ra-line"
                                style={{ imageRendering: "pixelated" }}
                              />
                              <figcaption className="mt-1 font-mono text-[10px] text-ra-ink-3">
                                {label}
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                        <label className="flex items-center gap-2 text-xs text-ra-ink-2">
                          <input
                            type="checkbox"
                            checked={palShowCompletion}
                            onChange={(e) => setPalShowCompletion(e.target.checked)}
                            className="accent-[oklch(0.54_0.2_8)]"
                          />
                          overlay completion on the image
                        </label>
                        <p className="font-mono text-[10px] text-ra-ink-3">
                          mean uncertainty {palCompletions[palSelected].mean_uncertainty.toFixed(3)} ·{" "}
                          {palCompletions[palSelected].sampling.samples} samples ·{" "}
                          {palCompletions[palSelected].sampling.ddim_steps} DDIM steps · seed{" "}
                          {palCompletions[palSelected].sampling.seed}
                        </p>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={palComplete}
                        disabled={palBusy !== false}
                        className="border border-ra-line-strong px-3 py-2 text-xs font-bold hover:border-ra-ink disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {palBusy === "complete"
                          ? "Sampling diffusion model… (~2 min on CPU)"
                          : "Generate completion (~2 min)"}
                      </button>
                    )}
                  </div>
                )}

                {image && (
                  <div className="flex flex-col gap-2 border-t border-ra-line pt-3">
                    <span className="text-xs font-bold">Whole-figure completion</span>
                    <p className="font-mono text-[10px] leading-relaxed text-ra-ink-3">
                      When one figure spans the panel, complete it as a single
                      piece: sample its pigment colour, tune the selection, then
                      let the model hypothesise the whole figure — including the
                      missing parts.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPalPickMode((m) => !m)}
                        aria-pressed={palPickMode}
                        className={`border px-2.5 py-1.5 text-xs ${
                          palPickMode
                            ? "border-ra-red bg-ra-red-deep/40"
                            : "border-ra-line text-ra-ink-2 hover:border-ra-line-strong"
                        }`}
                      >
                        {palPickMode
                          ? "Picking… (Esc to finish)"
                          : palSamples.length
                            ? `Sample pigment (${palSamples.length} points)`
                            : "Sample pigment"}
                      </button>
                      {palSamples.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPalSamples([]);
                            setPalWhole(null);
                            palWholeOverlayRef.current = null;
                          }}
                          className="text-xs text-ra-ink-3 underline underline-offset-2 hover:text-ra-ink"
                        >
                          clear
                        </button>
                      )}
                    </div>
                    {palSamples.length > 0 && (
                      <>
                        <Slider
                          label="Colour tolerance (ΔE)"
                          value={palDeltaE}
                          min={4}
                          max={40}
                          step={1}
                          onChange={(v) => {
                            setPalDeltaE(v);
                            setPalWhole(null);
                            palWholeOverlayRef.current = null;
                          }}
                        />
                        <span className="font-mono text-[10px] text-ra-ink-3">
                          selection covers {(palMaskCoverage * 100).toFixed(1)}% of the image
                        </span>
                        <button
                          type="button"
                          onClick={palCompleteWhole}
                          disabled={palBusy !== false || palMaskCoverage < 0.002}
                          className="border border-ra-red bg-ra-red-deep/40 px-3 py-2 text-xs font-bold hover:bg-ra-red-deep disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {palBusy === "complete"
                            ? "Sampling diffusion model… (~2 min)"
                            : "Complete the whole selection (~2 min)"}
                        </button>
                      </>
                    )}
                    {palWhole && (
                      <>
                        <div className="flex gap-2">
                          {(
                            [
                              ["mean_png", "mean of 4 samples"],
                              ["uncertainty_png", "uncertainty (hot = unsure)"],
                            ] as const
                          ).map(([k, label]) => (
                            <figure key={k} className="m-0 flex-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`data:image/png;base64,${palWhole[k]}`}
                                alt={label}
                                className="w-full border border-ra-line"
                                style={{ imageRendering: "pixelated" }}
                              />
                              <figcaption className="mt-1 font-mono text-[10px] text-ra-ink-3">
                                {label}
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                        <label className="flex items-center gap-2 text-xs text-ra-ink-2">
                          <input
                            type="checkbox"
                            checked={palShowWhole}
                            onChange={(e) => setPalShowWhole(e.target.checked)}
                            className="accent-[oklch(0.54_0.2_8)]"
                          />
                          overlay on the image
                        </label>
                        {palShowWhole && (
                          <div className="flex" role="group" aria-label="Overlay view">
                            {(
                              [
                                ["completion", "completion"],
                                ["added", "added only"],
                              ] as const
                            ).map(([v, label]) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setPalWholeView(v)}
                                aria-pressed={palWholeView === v}
                                className={`flex-1 border border-ra-line px-2 py-1 text-[11px] ${
                                  palWholeView === v
                                    ? "border-ra-line-strong bg-ra-panel-2 text-ra-ink"
                                    : "text-ra-ink-2 hover:text-ra-ink"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                        {palShowWhole && palWhole.candidates && palWhole.candidates.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap gap-1" role="group" aria-label="Hypothesis candidate">
                              <button
                                type="button"
                                onClick={() => setPalCandidate(-1)}
                                aria-pressed={palCandidate === -1}
                                className={`border px-2 py-1 text-[11px] ${
                                  palCandidate === -1
                                    ? "border-ra-red bg-ra-red-deep/40 text-ra-ink"
                                    : "border-ra-line text-ra-ink-2 hover:text-ra-ink"
                                }`}
                              >
                                mean
                              </button>
                              {palWhole.candidates.map((_, i) => (
                                <button
                                  // biome-ignore lint: stable list
                                  key={i}
                                  type="button"
                                  onClick={() => setPalCandidate(i)}
                                  aria-pressed={palCandidate === i}
                                  className={`border px-2 py-1 font-mono text-[11px] ${
                                    palCandidate === i
                                      ? "border-ra-red bg-ra-red-deep/40 text-ra-ink"
                                      : "border-ra-line text-ra-ink-2 hover:text-ra-ink"
                                  }`}
                                >
                                  {i + 1}
                                </button>
                              ))}
                            </div>
                            <span className="font-mono text-[10px] leading-relaxed text-ra-ink-3">
                              discrete hypotheses — the ensemble mean is safest, but
                              the best single candidate usually beats it; judging
                              which is yours to do, against the rock
                            </span>
                          </div>
                        )}
                        <p className="font-mono text-[10px] text-ra-ink-3">
                          HYPOTHESIS · mean uncertainty {palWhole.mean_uncertainty.toFixed(3)} ·{" "}
                          {palWhole.sampling.samples} samples · {palWhole.sampling.ddim_steps} DDIM
                          steps · seed {palWhole.sampling.seed} · &ldquo;added only&rdquo; shows
                          exactly what the model invented
                        </p>
                      </>
                    )}
                  </div>
                )}

                {pal && pal.harris.length > 0 && (
                  <details className="border border-ra-line">
                    <summary className="cursor-pointer px-2.5 py-2 text-xs font-bold text-ra-ink-2">
                      Which was painted first? ({pal.harris.length} relations)
                    </summary>
                    <div className="flex flex-col gap-1 border-t border-ra-line p-2.5">
                      {pal.harris.map((e, i) => {
                        const over = pal.figures.find((f) => f.key === e.over_key);
                        const under = pal.figures.find((f) => f.key === e.under_key);
                        return (
                          // biome-ignore lint: static list
                          <span key={i} className="font-mono text-[11px] text-ra-ink-2">
                            {over?.class ?? e.over_key} <span className="text-ra-red-bright">over</span>{" "}
                            {under?.class ?? e.under_key}{" "}
                            <span className="text-ra-ink-3">
                              ({(e.confidence * 100).toFixed(0)}%
                              {e.source === "enhanced" ? " · enh" : ""})
                            </span>
                          </span>
                        );
                      })}
                      <span className="font-mono text-[10px] text-ra-ink-3">
                        overlap order = relative chronology (a Harris matrix)
                      </span>
                    </div>
                  </details>
                )}

                {pal && (
                  <details className="border border-ra-line">
                    <summary className="cursor-pointer px-2.5 py-2 text-xs font-bold text-ra-ink-2">
                      Provenance
                    </summary>
                    <p className="border-t border-ra-line p-2.5 font-mono text-[10px] leading-relaxed text-ra-ink-3">
                      {pal.provenance.engine.name} {pal.provenance.engine.version} · decomposer{" "}
                      {pal.provenance.decomposer?.sha256.slice(0, 8)} step{" "}
                      {pal.provenance.decomposer?.step} · restorer{" "}
                      {pal.provenance.restorer?.sha256.slice(0, 8) ?? "—"} · trained on synthetic
                      panels only — classes are indicative, not identifications
                    </p>
                  </details>
                )}
              </div>
            )}

            {tab === "info" && (
              <div className="flex flex-col gap-4 p-4 text-sm">
                <InfoRow label="file" value={image.name} mono />
                <InfoRow
                  label="dimensions"
                  value={`${image.fullW} × ${image.fullH} (${((image.fullW * image.fullH) / 1e6).toFixed(1)} MP)`}
                  mono
                />
                <InfoRow
                  label="preview level"
                  value={
                    image.previewScale === 1
                      ? "full resolution"
                      : `${(image.previewScale * 100).toFixed(0)}% (${image.previewW}×${image.previewH}) — export replays at full resolution`
                  }
                  mono
                />
                <InfoRow
                  label="sha-256"
                  value={image.sha256 ?? "synthetic panel (generated, unhashed)"}
                  mono
                  wrap
                />
                <InfoRow label="engine" value={`rockpaintings-engine ${ENGINE_VERSION}`} mono />
                {recipe && (
                  <div>
                    <span className="text-xs font-bold">Current recipe</span>
                    <pre className="mt-2 max-h-72 overflow-auto border border-ra-line bg-ra-bg-deep p-2 font-mono text-[10px] leading-relaxed text-ra-ink-2">
                      {JSON.stringify(recipe, null, 2)}
                    </pre>
                    <button
                      type="button"
                      onClick={() =>
                        downloadBlob(
                          new Blob([JSON.stringify(recipe, null, 2)], {
                            type: "application/json",
                          }),
                          `${image.name.replace(/\.[^.]+$/, "")}.recipe.json`,
                        )
                      }
                      className="mt-2 border border-ra-line-strong px-3 py-1.5 text-xs font-bold hover:border-ra-ink"
                    >
                      Download recipe JSON
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Status bar */}
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-ra-line px-4 py-1.5 font-mono text-[11px] text-ra-ink-3">
        <span>{image ? `zoom ${(view.scale * (image ? image.previewScale : 1) * 100).toFixed(0)}%` : "no image"}</span>
        {compare === "split" && image && (
          <label className="flex items-center gap-2">
            split
            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={splitPos}
              onChange={(e) => setSplitPos(Number(e.target.value))}
              className="w-28"
              aria-label="Split position"
            />
          </label>
        )}
        {diag && tab === "stretch" && (
          <span>
            clipped {diag.clippedPercent.toFixed(2)}% · {diag.elapsedMs.toFixed(0)} ms
          </span>
        )}
        {busy && <span className="text-ra-red-bright">processing…</span>}
        <span ref={statusRef} className="ms-auto text-ra-ink-2" aria-live="off" />
        <span className="text-ra-ink-3">
          {tab === "palimpsest"
            ? "palimpsest sends the image to this site's own server"
            : "local only — nothing uploads"}
        </span>
      </footer>

      {/* palimpsest explainer */}
      <dialog ref={palModalRef} aria-labelledby="pal-modal-title">
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-baseline justify-between border-b border-ra-line px-5 py-3">
            <h2 id="pal-modal-title" className="text-sm font-extrabold">
              How palimpsest works — and what to trust
            </h2>
            <form method="dialog">
              <button
                type="submit"
                className="border border-ra-line px-2 py-1 font-mono text-xs text-ra-ink-2 hover:border-ra-line-strong hover:text-ra-ink"
              >
                close (Esc)
              </button>
            </form>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4 text-[13px] leading-relaxed text-ra-ink-2">
            <p>
              A rock-art panel is usually many paintings layered over centuries,
              then faded, flaked, overgrown and worn. Palimpsest tries to
              un-collapse that history using two machine-learning models.
            </p>
            <div>
              <h3 className="mb-1 text-xs font-bold text-ra-red-bright">
                1 · The decomposer — a forensic examiner
              </h3>
              <p>
                It groups the surviving pigment into individual figures (even
                where they overlap), estimates each figure&apos;s{" "}
                <em>full original outline</em> including the missing parts,
                diagnoses <em>why</em> the rest is gone — faded, painted over,
                lichen, rock loss, animal rubbing, or{" "}
                <em>never finished in the first place</em> — and works out which
                figure lies over which, giving the panel&apos;s relative
                chronology.
              </p>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-bold text-ra-red-bright">
                2 · The restorer — a sketch artist with error bars
              </h3>
              <p>
                For a chosen figure it paints several plausible completions.
                Where the drawings agree, the reconstruction is stable; where
                they disagree, the uncertainty map runs hot — the model saying
                &ldquo;I&apos;m guessing here.&rdquo; On test panels this
                self-doubt reliably tracks its actual errors.
              </p>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-bold text-ra-red-bright">
                Trained on simulated walls
              </h3>
              <p>
                Nobody knows what a faded painting originally looked like, so
                the models learned from procedurally generated panels aged with
                simulated fading, collapse, lichen and rubbing — scenes where
                the complete truth is known. Real panels remain harder: figure
                names like &ldquo;macropod&rdquo; are indicative labels from the
                training vocabulary, not identifications.
              </p>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-bold text-ra-red-bright">
                Hypotheses, never evidence
              </h3>
              <p>
                The workbench&apos;s analytical tools (stretch, channels) only
                re-weigh pixels the camera recorded. Palimpsest{" "}
                <em>imagines</em>. Its outputs are kept apart, labelled as
                hypotheses, and carry full provenance — model version, checksums
                and sampling seeds — so any claim can be traced and reproduced.
              </p>
            </div>
            <p className="border border-ra-line bg-ra-bg-deep/50 p-2.5 font-mono text-[11px] leading-relaxed text-ra-ink-3">
              Privacy: unlike the rest of the workbench, this tab sends the
              photograph to this site&apos;s own server for inference. It is
              processed in memory and never stored. Everything else stays in
              your browser.
            </p>
          </div>
        </div>
      </dialog>
    </div>
  );
}

/* -------------------------------------------------------------------- */

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between">
        <span className="text-xs font-bold">{label}</span>
        <span className="font-mono text-xs text-ra-ink-2">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  wrap = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[11px] text-ra-ink-3">{label}</span>
      <span
        className={`${mono ? "font-mono text-xs" : "text-sm"} ${wrap ? "break-all" : "truncate"} text-ra-ink-2`}
      >
        {value}
      </span>
    </div>
  );
}

function Matrix({ label, values }: { label: string; values: number[] }) {
  return (
    <div>
      <span className="font-mono text-[11px] text-ra-ink-3">{label}</span>
      <div className="mt-1 grid grid-cols-3 gap-x-3 gap-y-0.5 font-mono text-[11px] text-ra-ink-2">
        {values.map((v, i) => (
          // biome-ignore lint: static 3×3 grid
          <span key={i} className="text-right">
            {fmt(v)}
          </span>
        ))}
      </div>
    </div>
  );
}

function DiagnosticsPanel({ diag }: { diag: Diagnostics }) {
  const s = diag.stats;
  return (
    <details className="border border-ra-line bg-ra-bg-deep/50 p-3">
      <summary className="cursor-pointer text-xs font-bold text-ra-ink-2">
        Diagnostics — what the maths did
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-ra-ink-2">
          <span className="text-ra-ink-3">eigenvalues</span>
          <span className="text-right">{s.eigenvalues.map((v) => fmt(v, 2)).join(" · ")}</span>
          <span className="text-ra-ink-3">component gains</span>
          <span className="text-right">{s.gains.map((v) => fmt(v, 2)).join(" · ")}</span>
          <span className="text-ra-ink-3">condition number</span>
          <span className="text-right">{fmt(s.conditionNumber, 1)}</span>
          <span className="text-ra-ink-3">samples</span>
          <span className="text-right">{s.sampleCount.toLocaleString()}</span>
          <span className="text-ra-ink-3">clipped pixels</span>
          <span className="text-right">{diag.clippedPercent.toFixed(2)}%</span>
        </div>
        <Matrix label="covariance" values={s.covariance} />
        <Matrix label="transform (applied at strength 1)" values={s.transform} />
        {s.conditionNumber > 1e4 && (
          <p className="font-mono text-[11px] text-ra-warn">
            ill-conditioned statistics — consider a region, correlation mode or a lower
            maximum gain
          </p>
        )}
      </div>
    </details>
  );
}
