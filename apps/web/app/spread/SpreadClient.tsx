'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MAPLIBRE_JS, MAPLIBRE_CSS, BASEMAP, AU_BOUNDS } from '../map/mapConfig';
import {
  DATA_URL,
  PN_COLOR,
  prepare,
  calendarLabel,
  fmtBP,
  type PreparedData,
  type RawDataset,
} from './spreadData';

/* eslint-disable @typescript-eslint/no-explicit-any */

function isDark() {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  );
}

interface Particle {
  edge: number; // index into datedEdges
  u: number; // 0..1 along the edge
  pu: number; // previous u (for the streak tail)
  speed: number;
}

const PARTICLE_COUNT = 850; // capped for the shared 8-core box
const SPEED_STEPS = [0.25, 0.5, 1, 2, 4];

const FOCALS = [
  { key: 'kuku1273', short: 'Kuku Yalanji' },
  { key: 'warl1254', short: 'Warlpiri' },
  { key: 'guma1253', short: 'Gumatj (Yolngu)' },
  { key: 'kaur1267', short: 'Kaurna' },
];

export default function SpreadClient() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<any>(null);
  const initedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  const dataRef = useRef<PreparedData | null>(null);
  const tRef = useRef<number>(5578.3); // current time, years BP (counts down)
  const playingRef = useRef<boolean>(true);
  const speedRef = useRef<number>(1);
  const focalRef = useRef<string | null>('kuku1273');

  const [libReady, setLibReady] = useState(false);
  const [libError, setLibError] = useState(false);
  const [data, setData] = useState<PreparedData | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [tDisplay, setTDisplay] = useState(5578.3);
  const [playing, setPlaying] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(2);
  const [focal, setFocal] = useState<string | null>('kuku1273');

  const [methodOpen, setMethodOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);

  // ---------------------------------------------------------------- load lib
  useEffect(() => {
    if ((window as any).maplibregl) {
      setLibReady(true);
      return;
    }
    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css';
      link.rel = 'stylesheet';
      link.href = MAPLIBRE_CSS;
      document.head.appendChild(link);
    }
    let s = document.getElementById('maplibre-js') as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement('script');
      s.id = 'maplibre-js';
      s.src = MAPLIBRE_JS;
      s.async = true;
      document.body.appendChild(s);
    }
    const onLoad = () => setLibReady(true);
    const onErr = () => setLibError(true);
    s.addEventListener('load', onLoad);
    s.addEventListener('error', onErr);
    const guard = setTimeout(() => {
      if (!(window as any).maplibregl) setLibError(true);
    }, 12000);
    return () => {
      s?.removeEventListener('load', onLoad);
      s?.removeEventListener('error', onErr);
      clearTimeout(guard);
    };
  }, []);

  // ---------------------------------------------------------------- load data
  useEffect(() => {
    let cancelled = false;
    fetch(DATA_URL)
      .then((r) => r.json())
      .then((raw: RawDataset) => {
        if (cancelled) return;
        const prepared = prepare(raw);
        dataRef.current = prepared;
        tRef.current = prepared.rootAge;
        setTDisplay(prepared.rootAge);
        setData(prepared);
      })
      .catch(() => {
        /* leave data null -> the fetch error state shows */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // sync UI state -> refs (so the rAF loop reads fresh values without restarting)
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    speedRef.current = SPEED_STEPS[speedIdx];
  }, [speedIdx]);
  useEffect(() => {
    focalRef.current = focal;
  }, [focal]);

  const buildStyle = useCallback((dark: boolean) => {
    return {
      version: 8 as const,
      sources: {
        carto: {
          type: 'raster',
          tiles: dark ? BASEMAP.dark : BASEMAP.light,
          tileSize: 256,
          attribution: BASEMAP.attribution,
        },
      },
      layers: [
        {
          id: 'bg',
          type: 'background',
          paint: { 'background-color': dark ? BASEMAP.bg.dark : BASEMAP.bg.light },
        },
        {
          id: 'basemap',
          type: 'raster',
          source: 'carto',
          paint: { 'raster-opacity': dark ? 0.62 : 0.82 },
        },
      ],
    };
  }, []);

  // ---------------------------------------------------------------- init map
  useEffect(() => {
    if (!libReady || !data || !containerRef.current || initedRef.current) return;
    const maplibregl = (window as any).maplibregl;
    initedRef.current = true;
    const dark = isDark();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(dark),
      center: [136, -22],
      zoom: 3.35,
      minZoom: 2.6,
      maxZoom: 9,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'bottom-right',
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-left',
    );

    map.on('load', () => {
      map.resize();
      map.fitBounds(AU_BOUNDS, { padding: 30, duration: 0 });
      setMapReady(true);
    });

    const ro = new ResizeObserver(() => {
      try {
        map.resize();
        sizeCanvas();
      } catch {
        /* torn down */
      }
    });
    ro.observe(containerRef.current);

    // seed particles
    const parts: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      parts.push({
        edge: 0,
        u: Math.random(),
        pu: Math.random(),
        speed: 0.05 + Math.random() * 0.12,
      });
    }
    particlesRef.current = parts;

    return () => {
      ro.disconnect();
      try {
        map.remove();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libReady, data]);

  // ---------------------------------------------------------------- canvas sizing
  const sizeCanvas = useCallback(() => {
    const cv = canvasRef.current;
    const cont = containerRef.current;
    if (!cv || !cont) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const w = cont.clientWidth;
    const h = cont.clientHeight;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas);
    return () => window.removeEventListener('resize', sizeCanvas);
  }, [mapReady, sizeCanvas]);

  // ---------------------------------------------------------------- animation
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const cv = canvasRef.current;
    if (!map || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const project = (lon: number, lat: number) => map.project([lon, lat]);

    const frame = (ts: number) => {
      const d = dataRef.current;
      if (!d) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const dtSec = lastTsRef.current ? Math.min((ts - lastTsRef.current) / 1000, 0.05) : 0;
      lastTsRef.current = ts;

      // advance time when playing
      if (playingRef.current) {
        // full sweep (5578 -> 0) takes ~55s at 1x
        const yearsPerSec = 100 * speedRef.current;
        tRef.current = Math.max(0, tRef.current - yearsPerSec * dtSec);
        if (tRef.current <= 0) {
          tRef.current = 0;
          playingRef.current = false;
          setPlaying(false);
        }
      }
      const T = tRef.current;
      // throttled UI readout (~10Hz)
      if (!(frame as any)._last || ts - (frame as any)._last > 90) {
        (frame as any)._last = ts;
        setTDisplay(T);
      }

      const cw = cv.clientWidth;
      const chh = cv.clientHeight;
      ctx.clearRect(0, 0, cw, chh);

      const dark = isDark();

      // ---- 1. static, UNDATED northern context edges (never animated) ----
      ctx.save();
      ctx.lineWidth = 0.7;
      ctx.setLineDash([2, 3]);
      for (const e of d.contextEdges) {
        const a = project(e.fromLon, e.fromLat);
        const b = project(e.toLon, e.toLat);
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = 0.16;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();

      // ---- 2. dated Pama-Nyungan spread edges (grow with time) ----
      const edges = d.datedEdges;
      // frontier = reached edges still being traversed (particles cluster here)
      const frontier: number[] = [];
      const reached: number[] = [];
      ctx.save();
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (e.fromAge < T) continue; // ancestor not yet reached at time T
        const span = e.fromAge - e.toAge;
        const progress = span <= 0 ? 1 : Math.min(1, Math.max(0, (e.fromAge - T) / span));
        reached.push(i);
        if (progress < 0.999) frontier.push(i);

        const a = project(e.fromLon, e.fromLat);
        const b = project(e.toLon, e.toLat);
        const hx = a.x + (b.x - a.x) * progress;
        const hy = a.y + (b.y - a.y) * progress;

        // uncertainty: faint + dashed for low-posterior deep splits
        const p = e.posterior;
        const alpha = 0.12 + 0.55 * Math.min(1, p * 1.1);
        if (p < 0.25) {
          ctx.setLineDash([3, 4]);
          ctx.lineWidth = 0.8;
        } else {
          ctx.setLineDash([]);
          ctx.lineWidth = 0.8 + 1.3 * p;
        }
        ctx.strokeStyle = PN_COLOR;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(hx, hy);
        ctx.stroke();

        // light up present-day languages as they are reached
        if (e.childIsLeaf && progress >= 0.999) {
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = dark ? '#ffdca8' : '#a83e15';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // ---- 3. particle wind along the reached edges (outward flow) ----
      const parts = particlesRef.current;
      const spawnPool = frontier.length ? frontier : reached;
      ctx.save();
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
      for (let i = 0; i < parts.length; i++) {
        const pt = parts[i];
        // ensure the particle is bound to a reached edge
        let e = edges[pt.edge];
        if (!e || e.fromAge < T) {
          pt.edge = spawnPool[(Math.random() * spawnPool.length) | 0] ?? reached[0] ?? 0;
          pt.u = 0;
          pt.pu = 0;
          e = edges[pt.edge];
        }
        if (!e) continue;
        const span = e.fromAge - e.toAge;
        const progress = span <= 0 ? 1 : Math.min(1, Math.max(0, (e.fromAge - T) / span));

        pt.pu = pt.u;
        // wind never fully stops; it advances even when time is paused (ambient flow)
        pt.u += pt.speed * (dtSec > 0 ? dtSec * 12 : 0.12) * (0.5 + speedRef.current * 0.3);
        if (pt.u >= 1) {
          // respawn on a (preferably frontier) edge — makes the wind advance outward
          const useFrontier = Math.random() < 0.72 && frontier.length;
          const pool = useFrontier ? frontier : spawnPool;
          pt.edge = pool[(Math.random() * pool.length) | 0] ?? reached[0] ?? 0;
          pt.u = 0;
          pt.pu = 0;
          continue;
        }
        // don't let the head run past the growth frontier of its edge
        const cu = Math.min(pt.u, progress);
        const cpu = Math.min(pt.pu, progress);
        const a = project(e.fromLon, e.fromLat);
        const b = project(e.toLon, e.toLat);
        const x = a.x + (b.x - a.x) * cu;
        const y = a.y + (b.y - a.y) * cu;
        const px = a.x + (b.x - a.x) * cpu;
        const py = a.y + (b.y - a.y) * cpu;

        const fade = 1 - pt.u;
        ctx.globalAlpha = 0.35 + 0.5 * fade * Math.min(1, e.posterior * 1.4 + 0.2);
        ctx.strokeStyle = dark ? '#ffd9a0' : '#c0431a';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
        // bright head
        ctx.globalAlpha = 0.9 * fade + 0.1;
        ctx.fillStyle = dark ? '#fff3df' : '#e0692f';
        ctx.beginPath();
        ctx.arc(x, y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ---- 4. Gulf-of-Carpentaria origin marker (pulsing) ----
      const o = project(d.origin.lon, d.origin.lat);
      const pulse = 0.5 + 0.5 * Math.sin(ts / 500);
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.35 * pulse;
      ctx.strokeStyle = PN_COLOR;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 7 + 7 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = PN_COLOR;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ---- 5. focal lineage highlight (e.g. Kuku Yalanji arriving home) ----
      const fk = focalRef.current;
      if (fk && d.focalPaths[fk]) {
        const fp = d.focalPaths[fk];
        const steps = fp.steps;
        // draw the full path faintly, then the traversed portion bright
        ctx.save();
        ctx.setLineDash([]);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        // faint guide
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = fp.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < steps.length; i++) {
          const s = project(steps[i].lon, steps[i].lat);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();

        // bright traversed portion up to time T (age descending along steps)
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = fp.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = fp.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        let started = false;
        let headX = 0;
        let headY = 0;
        let arrived = true;
        for (let i = 0; i < steps.length - 1; i++) {
          const s0 = steps[i];
          const s1 = steps[i + 1];
          const a0 = s0.age ?? 0;
          const a1 = s1.age ?? 0;
          const seg = project(s0.lon, s0.lat);
          if (!started) {
            ctx.moveTo(seg.x, seg.y);
            started = true;
            headX = seg.x;
            headY = seg.y;
          }
          if (T <= a1) {
            // fully traversed this segment
            const nxt = project(s1.lon, s1.lat);
            ctx.lineTo(nxt.x, nxt.y);
            headX = nxt.x;
            headY = nxt.y;
          } else if (T < a0) {
            // partway through this segment
            const span = a0 - a1;
            const frac = span <= 0 ? 1 : (a0 - T) / span;
            const nxt = project(s1.lon, s1.lat);
            const hx = seg.x + (nxt.x - seg.x) * frac;
            const hy = seg.y + (nxt.y - seg.y) * frac;
            ctx.lineTo(hx, hy);
            headX = hx;
            headY = hy;
            arrived = false;
            break;
          } else {
            arrived = false;
            break;
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        // travelling beacon
        if (started) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(headX, headY, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = fp.color;
          ctx.beginPath();
          ctx.arc(headX, headY, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        // "arrived home" label at the leaf
        const leaf = project(fp.leafLon, fp.leafLat);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = fp.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(leaf.x, leaf.y, arrived ? 6 : 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // label
        const label = fp.leafName + (arrived ? ' — home' : '');
        ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = dark ? 'rgba(20,17,14,0.85)' : 'rgba(255,255,255,0.9)';
        ctx.fillRect(leaf.x + 8, leaf.y - 10, tw + 10, 18);
        ctx.globalAlpha = 1;
        ctx.fillStyle = dark ? '#fff' : '#2a1e12';
        ctx.fillText(label, leaf.x + 13, leaf.y + 3);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mapReady]);

  // ---------------------------------------------------------------- controls
  const onScrub = (v: number) => {
    // slider is "years elapsed since origin"; T = rootAge - elapsed
    const d = dataRef.current;
    if (!d) return;
    const T = Math.max(0, d.rootAge - v);
    tRef.current = T;
    setTDisplay(T);
  };
  const restart = () => {
    const d = dataRef.current;
    if (!d) return;
    tRef.current = d.rootAge;
    setTDisplay(d.rootAge);
    setPlaying(true);
    playingRef.current = true;
    lastTsRef.current = 0;
  };

  const rootAge = data?.rootAge ?? 5578.3;
  const elapsed = rootAge - tDisplay;

  const focalPath = focal && data ? data.focalPaths[focal] : null;

  return (
    <div className="relative w-full h-[calc(100dvh-11rem)] min-h-[560px] overflow-hidden rounded-2xl border border-border bg-[#0d0b09] shadow-sm">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-[2]"
      />

      {/* loading / error */}
      {(!libReady || !data || !mapReady) && !libError && (
        <div className="absolute inset-0 z-[20] grid place-items-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Loading the language-spread model&hellip;
          </div>
        </div>
      )}
      {libError && (
        <div className="absolute inset-0 z-[20] grid place-items-center bg-background p-6 text-center">
          <div className="max-w-sm">
            <p className="mb-1 font-semibold">The map engine could not load</p>
            <p className="text-sm text-muted-foreground">
              MapLibre GL is served from a CDN and appears to be blocked on this
              network. See the{' '}
              <Link href="/map" className="text-primary underline">
                atlas
              </Link>{' '}
              instead.
            </p>
          </div>
        </div>
      )}

      {/* ---- HYPOTHESIS + HONESTY banner (top) ---- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[10] flex justify-center p-3">
        <div className="pointer-events-auto w-full max-w-3xl rounded-xl border border-amber-500/40 bg-[#1a1510]/90 px-4 py-3 text-[13px] leading-snug text-amber-50 shadow-lg backdrop-blur-md">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
              Hypothesis
            </span>
            <div className="min-w-0">
              <p className={bannerOpen ? '' : 'line-clamp-1'}>
                <strong className="text-amber-200">
                  A language family spreading is NOT people arriving.
                </strong>{' '}
                Aboriginal &amp; Torres Strait Islander presence in Australia is{' '}
                <strong>~65,000 years</strong>. This animates a much more recent{' '}
                <strong>~5,000-year LINGUISTIC expansion</strong> (Pama-Nyungan,
                root ~5,578&nbsp;yr&nbsp;BP; 95% HPD ~4,456–6,967) across country
                that was <strong>already long populated</strong>. Every arrow is a
                language lineage moving through <em>existing</em> communities via
                contact &amp; shift — not a migration of first peoples.
              </p>
              {bannerOpen && (
                <p className="mt-1.5 text-amber-100/80">
                  A model-inferred hypothesis from historical linguistics
                  (Bouckaert, Bowern &amp; Atkinson 2018; Glottolog 5.3). Tree{' '}
                  <em>topology</em> is well supported; geographic diffusion paths
                  &amp; dates are inferred and <em>uncertain</em>.{' '}
                  <button
                    onClick={() => setMethodOpen(true)}
                    className="pointer-events-auto font-semibold text-amber-300 underline underline-offset-2"
                  >
                    Method &amp; sources
                  </button>
                </p>
              )}
            </div>
            <button
              onClick={() => setBannerOpen((v) => !v)}
              className="pointer-events-auto ml-auto shrink-0 rounded px-1.5 text-amber-300/70 hover:text-amber-200"
              aria-label={bannerOpen ? 'Collapse' : 'Expand'}
            >
              {bannerOpen ? '–' : '+'}
            </button>
          </div>
        </div>
      </div>

      {/* ---- Legend (top-left) ---- */}
      {mapReady && data && (
        <div className="absolute left-3 top-[136px] z-[9] w-[214px] max-w-[calc(100%-1.5rem)]">
          <div className="rounded-xl border border-white/10 bg-[#161210]/85 p-3 text-[11px] text-neutral-200 shadow-lg backdrop-blur-md">
            <button
              onClick={() => setLegendOpen((v) => !v)}
              className="mb-1.5 flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-wide text-neutral-400"
            >
              Legend {legendOpen ? '▾' : '▸'}
            </button>
            {legendOpen && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: PN_COLOR }}
                  />
                  <span>
                    <strong style={{ color: PN_COLOR }}>Pama-Nyungan</strong> —
                    dated expansion (the wind)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-neutral-400">
                  <svg width="18" height="6">
                    <line
                      x1="0"
                      y1="3"
                      x2="18"
                      y2="3"
                      stroke="#8c8175"
                      strokeWidth="1.4"
                      strokeDasharray="2,3"
                    />
                  </svg>
                  <span>Non-PN northern families — static, undated context</span>
                </div>
                <div className="mt-1 border-t border-white/10 pt-1.5 text-neutral-400">
                  <div className="mb-1 font-semibold text-neutral-300">
                    Edge uncertainty
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="24" height="6">
                      <line x1="0" y1="3" x2="24" y2="3" stroke={PN_COLOR} strokeWidth="2.1" />
                    </svg>
                    <span>solid = well-supported (recent subgroups)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="24" height="6">
                      <line
                        x1="0"
                        y1="3"
                        x2="24"
                        y2="3"
                        stroke={PN_COLOR}
                        strokeWidth="0.9"
                        strokeDasharray="3,4"
                        opacity="0.6"
                      />
                    </svg>
                    <span>faint/dashed = deep splits, low posterior (~0.06–0.09)</span>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-2 border-t border-white/10 pt-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full ring-2"
                    style={{ background: PN_COLOR, boxShadow: `0 0 0 2px ${PN_COLOR}55` }}
                  />
                  <span>Gulf of Carpentaria origin</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Focal-lineage tracer (right) ---- */}
      {mapReady && data && (
        <div className="absolute right-3 top-[136px] z-[9] w-[210px] max-w-[calc(100%-1.5rem)]">
          <div className="rounded-xl border border-white/10 bg-[#161210]/85 p-3 text-[11px] text-neutral-200 shadow-lg backdrop-blur-md">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
              Trace a lineage home
            </div>
            <div className="flex flex-col gap-1.5">
              {FOCALS.map((f) => {
                const active = focal === f.key;
                const isKuku = f.key === 'kuku1273';
                const color = data.focalPaths[f.key]?.color ?? '#ffd23f';
                return (
                  <button
                    key={f.key}
                    onClick={() => setFocal(active ? null : f.key)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                      active
                        ? 'border-white/30 bg-white/10 font-semibold text-white'
                        : 'border-white/10 bg-transparent text-neutral-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: color }}
                      />
                      {f.short}
                    </span>
                    {isKuku && (
                      <span className="rounded bg-amber-500/20 px-1 text-[9px] font-bold text-amber-300">
                        yours
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {focalPath && (
              <p className="mt-2 border-t border-white/10 pt-2 text-[10.5px] leading-snug text-neutral-400">
                Gulf&nbsp;→&nbsp;{focalPath.leafName}. Watch the beacon travel the
                dated diffusion path as time advances.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---- Time controls (bottom) ---- */}
      {mapReady && data && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[10] flex justify-center p-3">
          <div className="pointer-events-auto w-full max-w-3xl rounded-xl border border-white/10 bg-[#161210]/90 px-4 py-3 shadow-lg backdrop-blur-md">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-amber-100">
                  {fmtBP(tDisplay)}
                </span>
                <span className="text-xs text-neutral-400">
                  {calendarLabel(tDisplay)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    if (tDisplay <= 0) restart();
                    else setPlaying((p) => !p);
                  }}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-amber-400"
                >
                  {tDisplay <= 0 ? '↻ Replay' : playing ? '❚❚ Pause' : '▶ Play'}
                </button>
                <div className="flex overflow-hidden rounded-lg border border-white/15">
                  {SPEED_STEPS.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => setSpeedIdx(i)}
                      className={`px-2 py-1.5 text-[11px] font-semibold ${
                        speedIdx === i
                          ? 'bg-white/15 text-white'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={rootAge}
              step={1}
              value={elapsed}
              onChange={(e) => onScrub(Number(e.target.value))}
              className="spread-scrubber w-full"
              aria-label="Time scrubber (years since origin)"
            />
            <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
              <span>Gulf origin · {fmtBP(rootAge)} · {calendarLabel(rootAge)}</span>
              <span>present day · 0 yr BP</span>
            </div>
          </div>
        </div>
      )}

      {/* ---- Method & sources modal ---- */}
      {methodOpen && data && (
        <div
          className="absolute inset-0 z-[30] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setMethodOpen(false)}
        >
          <div
            className="my-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-[#17130f] p-6 text-neutral-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <h2 className="text-lg font-bold text-amber-100">
                Method, honesty &amp; sources
              </h2>
              <button
                onClick={() => setMethodOpen(false)}
                className="rounded px-2 text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-neutral-300">
              This is a <strong>model-inferred hypothesis</strong> about how the
              Pama-Nyungan language family diffused across an already-populated
              continent — not a settlement story, not a fact. Tree topology is
              comparatively well supported; geographic paths and dates are inferred
              and uncertain.
            </p>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
              Scientific-honesty caveats
            </h3>
            <ol className="mb-4 space-y-2 text-[13px] leading-snug text-neutral-300">
              {data.caveats
                .filter((c) => /^\d/.test(c))
                .map((c, i) => (
                  <li key={i} className="border-l-2 border-amber-500/30 pl-3">
                    {c.replace(/^\d+\.\s*/, '')}
                  </li>
                ))}
            </ol>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
              Sources
            </h3>
            <ul className="space-y-2 text-[12.5px] leading-snug text-neutral-300">
              {data.sources.map((s) => (
                <li key={s.id} className="border-l-2 border-white/10 pl-3">
                  <div className="font-medium text-neutral-100">{s.citation}</div>
                  {s.doi && (
                    <a
                      href={`https://doi.org/${s.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-300 underline"
                    >
                      doi:{s.doi}
                    </a>
                  )}
                  {s.license && (
                    <div className="text-[11px] text-neutral-500">{s.license}</div>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] text-neutral-500">
              Data via the Phlorest CLDF standardisation (CC-BY-4.0); a D-PLACE
              CC-BY-NC discrepancy is noted in the dataset SOURCES — non-commercial
              research use, authors attributed. This is Indigenous linguistic
              heritage; represent it carefully and do not overstate certainty.
            </p>
          </div>
        </div>
      )}

      <style jsx global>{`
        .spread-scrubber {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            ${PN_COLOR} 0%,
            #b8632f 55%,
            #5b6b7a 100%
          );
          outline: none;
        }
        .spread-scrubber::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          border: 3px solid ${PN_COLOR};
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
        }
        .spread-scrubber::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          border: 3px solid ${PN_COLOR};
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
