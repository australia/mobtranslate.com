"use client";

/**
 * Landing-page demonstration: a synthetic weathered-rock panel with motifs
 * painted at ~5% opacity, decorrelation-stretched by the real engine in this
 * tab. A draggable divider sweeps between the "photograph" and the stretch.
 * Clearly labelled synthetic — no photograph, nobody's site, nothing sacred.
 */

import { useEffect, useRef, useState } from "react";
import { drawSamplePanel } from "@/lib/research/rock-art/engine/sample";
import { runStretch } from "@/lib/research/rock-art/engine/process";
import { STRETCH_PRESETS } from "@/lib/research/rock-art/engine/presets";

const W = 1080;
const H = 660;

export default function DemoStretch() {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const stretchedRef = useRef<HTMLCanvasElement>(null);
  // Divider position from the left; the stretch is revealed to its right.
  const [split, setSplit] = useState(1);
  const [ready, setReady] = useState(false);
  const dragging = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const base = baseRef.current;
    const out = stretchedRef.current;
    if (!base || !out) return;
    const ctx = base.getContext("2d")!;
    drawSamplePanel(ctx, W, H);
    const src = ctx.getImageData(0, 0, W, H);
    const preset = STRETCH_PRESETS.find((p) => p.id === "faded-red")!;
    const dst = new Uint8ClampedArray(W * H * 4);
    runStretch(src.data, W, H, preset.params, dst)
      .then(() => {
        if (cancelled) return;
        const octx = out.getContext("2d")!;
        octx.putImageData(new ImageData(dst, W, H), 0, 0);
        setReady(true);
        // One slow reveal sweep, unless the visitor prefers reduced motion.
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setSplit(0.45);
          return;
        }
        const t0 = performance.now();
        const sweep = (t: number) => {
          if (cancelled || dragging.current) return;
          const k = Math.min(1, (t - t0) / 1800);
          setSplit(1 - 0.55 * (1 - Math.pow(1 - k, 3)));
          if (k < 1) requestAnimationFrame(sweep);
        };
        requestAnimationFrame(sweep);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const posFromEvent = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    setSplit(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)));
  };

  return (
    <figure className="m-0">
      <div
        ref={wrapRef}
        className="relative w-full touch-none select-none overflow-hidden border border-ra-line bg-ra-bg-deep"
        style={{ aspectRatio: `${W} / ${H}`, cursor: "ew-resize" }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          posFromEvent(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging.current) posFromEvent(e.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        role="slider"
        aria-label="Comparison divider between the original panel and its decorrelation stretch"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split * 100)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setSplit((s) => Math.max(0, s - 0.05));
          if (e.key === "ArrowRight") setSplit((s) => Math.min(1, s + 0.05));
        }}
      >
        <canvas ref={baseRef} width={W} height={H} className="block h-full w-full" />
        <canvas
          ref={stretchedRef}
          width={W}
          height={H}
          className="absolute inset-0 h-full w-full"
          style={{ clipPath: `inset(0 0 0 ${split * 100}%)` }}
        />
        {/* Divider */}
        <div
          aria-hidden
          className="absolute inset-y-0 w-px bg-ra-ink"
          style={{ left: `${split * 100}%`, opacity: ready ? 0.9 : 0 }}
        >
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ra-line-strong bg-ra-bg px-2 py-1 font-mono text-[10px] text-ra-ink-2">
            ⇄
          </div>
        </div>
        <span className="absolute left-3 top-3 bg-ra-bg/80 px-2 py-1 font-mono text-[11px] text-ra-ink-2">
          source
        </span>
        <span
          className="absolute right-3 top-3 bg-ra-bg/80 px-2 py-1 font-mono text-[11px] text-ra-red-bright"
          style={{ opacity: ready ? 1 : 0.4 }}
        >
          {ready ? "decorrelation stretch · CIELAB" : "computing stretch…"}
        </span>
      </div>
      <figcaption className="mt-3 max-w-[75ch] text-sm leading-[1.65] text-ra-ink-3">
        <b className="text-ra-ink-2">Figure 1.</b> Synthetic demonstration panel,
        generated in this tab — not a photograph of any real site. Motifs are
        painted at 5% opacity into procedurally weathered stone, then recovered
        live by the engine{" "}
        <span className="font-mono text-xs">
          (CIELAB · covariance · strength 0.90 · max gain 12 · clip 0.5%)
        </span>
        . Drag the divider.
      </figcaption>
    </figure>
  );
}
