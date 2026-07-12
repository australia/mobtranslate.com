'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MAPLIBRE_JS, MAPLIBRE_CSS, AU_BOUNDS } from '../map/mapConfig';
import {
  DATA_URL,
  SPREAD_BASEMAP,
  SKY,
  prepare,
  calendarLabel,
  fmtBP,
  type PreparedData,
  type RawDataset,
} from './spreadData';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Particle {
  edge: number; // index into datedEdges
  u: number; // 0..1 along the edge
  pu: number; // previous u (for the streak tail)
  speed: number;
}

const PARTICLE_COUNT = 780; // capped for the shared 8-core box
const TRAIL_FADE = 0.085; // how fast luminous tails dissolve (lower = longer comets)
const SPEED_STEPS = [0.25, 0.5, 1, 2, 4];

const FOCALS = [
  { key: 'kuku1273', short: 'Kuku Yalanji', region: 'Far North Queensland' },
  { key: 'warl1254', short: 'Warlpiri', region: 'Tanami, Central Desert' },
  { key: 'guma1253', short: 'Gumatj (Yolŋu)', region: 'North-East Arnhem Land' },
  { key: 'kaur1267', short: 'Kaurna', region: 'Adelaide Plains' },
];
const FOCAL_REGION: Record<string, string> = Object.fromEntries(
  FOCALS.map((f) => [f.key, f.region]),
);
const FOCAL_NAME: Record<string, string> = Object.fromEntries(
  FOCALS.map((f) => [f.key, f.short]),
);
// keep the continent in the clear band between the top banner and bottom controls
const FIT_PADDING = { top: 150, bottom: 120, left: 56, right: 56 };

/** A soft additive glow sprite, rendered once and stamped per particle head. */
function makeGlowSprite(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const size = 32;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return c;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(${SKY.windCore}, 0.95)`);
  grd.addColorStop(0.35, `rgba(${SKY.windMid}, 0.55)`);
  grd.addColorStop(1, `rgba(${SKY.edge}, 0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

export default function SpreadClient() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const windCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const labelNameRef = useRef<HTMLSpanElement | null>(null);
  const labelSubRef = useRef<HTMLSpanElement | null>(null);

  const mapRef = useRef<any>(null);
  const initedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const glowRef = useRef<HTMLCanvasElement | null>(null);
  const movedRef = useRef<boolean>(true); // clear the wind canvas after any pan/zoom

  const dataRef = useRef<PreparedData | null>(null);
  const tRef = useRef<number>(5578.3); // current time, years BP (counts down)
  const playingRef = useRef<boolean>(true);
  const speedRef = useRef<number>(1);
  const focalRef = useRef<string | null>('kuku1273');
  const reducedRef = useRef<boolean>(false);

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

  const prefersReduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

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

  // on phones the banner is long — start it collapsed so the map breathes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setBannerOpen(false);
    }
  }, []);

  // motion preference -> ref (default the animation OFF for reduced-motion)
  useEffect(() => {
    reducedRef.current = !!prefersReduced;
    if (prefersReduced) {
      playingRef.current = false;
      setPlaying(false);
      tRef.current = 0; // static end-state: the finished map
      setTDisplay(0);
    }
  }, [prefersReduced]);

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

  const buildStyle = useCallback(() => {
    return {
      version: 8 as const,
      sources: {
        carto: {
          type: 'raster',
          tiles: SPREAD_BASEMAP.tiles,
          tileSize: 256,
          attribution: SPREAD_BASEMAP.attribution,
        },
      },
      layers: [
        // transparent background so the frame's night-sky gradient shows through
        // the semi-transparent tiles — the land reads as a warm silhouette.
        {
          id: 'bg',
          type: 'background',
          paint: { 'background-color': 'rgba(0,0,0,0)' },
        },
        {
          id: 'basemap',
          type: 'raster',
          source: 'carto',
          paint: { 'raster-opacity': 0.5 },
        },
      ],
    };
  }, []);

  // ---------------------------------------------------------------- init map
  useEffect(() => {
    if (!libReady || !data || !mapWrapRef.current || initedRef.current) return;
    const maplibregl = (window as any).maplibregl;
    initedRef.current = true;
    glowRef.current = makeGlowSprite();

    const map = new maplibregl.Map({
      container: mapWrapRef.current,
      style: buildStyle(),
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
      map.fitBounds(AU_BOUNDS, { padding: FIT_PADDING, duration: 0 });
      setMapReady(true);
    });
    // any camera change means screen-space trails are stale -> clear them
    const flagMoved = () => {
      movedRef.current = true;
    };
    map.on('movestart', flagMoved);
    map.on('move', flagMoved);
    map.on('zoom', flagMoved);

    const ro = new ResizeObserver(() => {
      try {
        map.resize();
        sizeCanvas();
      } catch {
        /* torn down */
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

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
    const cont = containerRef.current;
    if (!cont) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const w = cont.clientWidth;
    const h = cont.clientHeight;
    for (const cv of [baseCanvasRef.current, windCanvasRef.current]) {
      if (!cv) continue;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const ctx = cv.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    movedRef.current = true;
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
    const base = baseCanvasRef.current;
    const wind = windCanvasRef.current;
    if (!map || !base || !wind) return;
    const bctx = base.getContext('2d');
    const wctx = wind.getContext('2d');
    if (!bctx || !wctx) return;

    // Projection cache — the map view is static during time-playback, so we
    // project the (fixed) geographic coordinates only when the camera moves,
    // not every frame. This turns ~4,500 project() calls/frame into ~0.
    type Pt = { x: number; y: number };
    type EdgePts = { ax: number; ay: number; bx: number; by: number };
    const projCache: {
      edges: EdgePts[];
      context: EdgePts[];
      origin: Pt;
      focal: Record<string, { steps: Pt[]; leaf: Pt }>;
    } = { edges: [], context: [], origin: { x: 0, y: 0 }, focal: {} };

    const reproject = () => {
      const d = dataRef.current;
      if (!d) return;
      const pj = (lon: number, lat: number) => map.project([lon, lat]);
      const edge = (e: { fromLon: number; fromLat: number; toLon: number; toLat: number }) => {
        const a = pj(e.fromLon, e.fromLat);
        const b = pj(e.toLon, e.toLat);
        return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
      };
      projCache.edges = d.datedEdges.map(edge);
      projCache.context = d.contextEdges.map(edge);
      const o = pj(d.origin.lon, d.origin.lat);
      projCache.origin = { x: o.x, y: o.y };
      const focal: Record<string, { steps: Pt[]; leaf: Pt }> = {};
      for (const k in d.focalPaths) {
        const fp = d.focalPaths[k];
        const l = pj(fp.leafLon, fp.leafLat);
        focal[k] = {
          steps: fp.steps.map((s) => {
            const p = pj(s.lon, s.lat);
            return { x: p.x, y: p.y };
          }),
          leaf: { x: l.x, y: l.y },
        };
      }
      projCache.focal = focal;
    };

    // ---- BASE layer: crisp, cleared & redrawn each frame -----------------
    const drawBase = (T: number, ts: number) => {
      const d = dataRef.current!;
      const cw = base.clientWidth;
      const chh = base.clientHeight;
      bctx.clearRect(0, 0, cw, chh);

      // 1. static, UNDATED northern context edges (muted eucalyptus, faint)
      bctx.save();
      bctx.lineWidth = 0.8;
      bctx.setLineDash([2, 4]);
      bctx.strokeStyle = `rgb(${SKY.context})`;
      bctx.globalAlpha = 0.14;
      const cxt = projCache.context;
      for (let i = 0; i < cxt.length; i++) {
        const c = cxt[i];
        bctx.beginPath();
        bctx.moveTo(c.ax, c.ay);
        bctx.lineTo(c.bx, c.by);
        bctx.stroke();
      }
      bctx.restore();

      // 2. dated Pama-Nyungan riverbeds (grow with time) + leaves lighting up
      const edges = d.datedEdges;
      const ep = projCache.edges;
      bctx.save();
      bctx.lineCap = 'round';
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (e.fromAge < T) continue; // ancestor not yet reached at time T
        const c = ep[i];
        if (!c) continue;
        const span = e.fromAge - e.toAge;
        const progress = span <= 0 ? 1 : Math.min(1, Math.max(0, (e.fromAge - T) / span));
        const hx = c.ax + (c.bx - c.ax) * progress;
        const hy = c.ay + (c.by - c.ay) * progress;

        const p = e.posterior;
        const alpha = 0.1 + 0.42 * Math.min(1, p * 1.1);
        if (p < 0.25) {
          bctx.setLineDash([3, 5]);
          bctx.lineWidth = 0.8;
        } else {
          bctx.setLineDash([]);
          bctx.lineWidth = 0.7 + 1.2 * p;
        }
        bctx.strokeStyle = `rgba(${SKY.edge}, ${alpha})`;
        bctx.beginPath();
        bctx.moveTo(c.ax, c.ay);
        bctx.lineTo(hx, hy);
        bctx.stroke();

        if (e.childIsLeaf && progress >= 0.999) {
          bctx.setLineDash([]);
          bctx.globalAlpha = 1;
          bctx.fillStyle = `rgba(${SKY.windCore}, 0.7)`;
          bctx.beginPath();
          bctx.arc(c.bx, c.by, 1.3, 0, Math.PI * 2);
          bctx.fill();
        }
      }
      bctx.restore();

      // 3. Gulf-of-Carpentaria origin — a warm luminous ember (source of it all)
      const o = projCache.origin;
      const pulse = reducedRef.current ? 0.5 : 0.5 + 0.5 * Math.sin(ts / 900);
      bctx.save();
      bctx.globalCompositeOperation = 'lighter';
      const halo = bctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 26 + 8 * pulse);
      halo.addColorStop(0, `rgba(${SKY.emberCore}, ${0.5 + 0.18 * pulse})`);
      halo.addColorStop(0.35, `rgba(${SKY.ember}, 0.32)`);
      halo.addColorStop(1, `rgba(${SKY.ember}, 0)`);
      bctx.fillStyle = halo;
      bctx.beginPath();
      bctx.arc(o.x, o.y, 26 + 8 * pulse, 0, Math.PI * 2);
      bctx.fill();
      bctx.globalCompositeOperation = 'source-over';
      bctx.fillStyle = `rgba(${SKY.emberCore}, 0.98)`;
      bctx.beginPath();
      bctx.arc(o.x, o.y, 3.2, 0, Math.PI * 2);
      bctx.fill();
      bctx.restore();

      // 4. focal lineage — e.g. Kuku Yalanji tracing home to Cape York
      drawFocal(T);
    };

    const drawFocal = (T: number) => {
      const d = dataRef.current!;
      const fk = focalRef.current;
      const labelEl = labelRef.current;
      if (!fk || !d.focalPaths[fk]) {
        if (labelEl) labelEl.style.opacity = '0';
        return;
      }
      const fp = d.focalPaths[fk];
      const fc = projCache.focal[fk];
      const steps = fp.steps;
      const pts = fc?.steps ?? [];
      if (!pts.length) {
        if (labelEl) labelEl.style.opacity = '0';
        return;
      }
      bctx.save();
      bctx.lineJoin = 'round';
      bctx.lineCap = 'round';
      bctx.setLineDash([]);

      // faint full guide (the path it will travel)
      bctx.globalAlpha = 0.22;
      bctx.strokeStyle = fp.color;
      bctx.lineWidth = 1.4;
      bctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) bctx.moveTo(pts[i].x, pts[i].y);
        else bctx.lineTo(pts[i].x, pts[i].y);
      }
      bctx.stroke();

      // bright traversed portion up to time T. `arrived` is judged from the
      // leaf age directly (robust to undated/zero-age intermediate nodes); the
      // walk below just finds where the travelling head currently sits.
      const leafAge = fp.leafAge ?? 0;
      const arrived = T <= leafAge + 1;
      bctx.globalAlpha = 1;
      bctx.strokeStyle = fp.color;
      bctx.lineWidth = 2.9;
      bctx.shadowColor = fp.color;
      bctx.shadowBlur = 15;
      bctx.beginPath();
      let headX = pts[0].x;
      let headY = pts[0].y;
      bctx.moveTo(headX, headY);
      if (arrived) {
        for (let i = 1; i < pts.length; i++) {
          bctx.lineTo(pts[i].x, pts[i].y);
          headX = pts[i].x;
          headY = pts[i].y;
        }
      } else {
        for (let i = 0; i < pts.length - 1; i++) {
          const a0 = steps[i].age ?? 0;
          const a1 = steps[i + 1].age ?? 0;
          const seg = pts[i];
          const nxt = pts[i + 1];
          if (T <= a1) {
            bctx.lineTo(nxt.x, nxt.y);
            headX = nxt.x;
            headY = nxt.y;
          } else if (T < a0) {
            const span = a0 - a1;
            const frac = span <= 0 ? 1 : (a0 - T) / span;
            headX = seg.x + (nxt.x - seg.x) * frac;
            headY = seg.y + (nxt.y - seg.y) * frac;
            bctx.lineTo(headX, headY);
            break;
          } else {
            break;
          }
        }
      }
      bctx.stroke();
      bctx.shadowBlur = 0;

      // travelling beacon
      if (!arrived) {
        bctx.globalAlpha = 1;
        bctx.fillStyle = '#ffffff';
        bctx.beginPath();
        bctx.arc(headX, headY, 4, 0, Math.PI * 2);
        bctx.fill();
        bctx.fillStyle = fp.color;
        bctx.beginPath();
        bctx.arc(headX, headY, 2.3, 0, Math.PI * 2);
        bctx.fill();
      }

      // home node — a dignified, warm arrival glow (gold ember, not a white flash)
      const leaf = fc.leaf;
      const rr = arrived ? 18 : 9;
      bctx.globalCompositeOperation = 'lighter';
      const ring = bctx.createRadialGradient(leaf.x, leaf.y, 0, leaf.x, leaf.y, rr);
      ring.addColorStop(0, arrived ? 'rgba(255,226,152,0.5)' : 'rgba(255,226,152,0.24)');
      ring.addColorStop(0.5, 'rgba(255,196,92,0.2)');
      ring.addColorStop(1, 'rgba(255,196,92,0)');
      bctx.fillStyle = ring;
      bctx.beginPath();
      bctx.arc(leaf.x, leaf.y, rr, 0, Math.PI * 2);
      bctx.fill();
      bctx.globalCompositeOperation = 'source-over';
      bctx.globalAlpha = 1;
      bctx.fillStyle = '#fff7e6';
      bctx.beginPath();
      bctx.arc(leaf.x, leaf.y, arrived ? 3 : 2.3, 0, Math.PI * 2);
      bctx.fill();
      bctx.strokeStyle = fp.color;
      bctx.lineWidth = 1.6;
      bctx.stroke();
      bctx.restore();

      // crisp HTML label (museum-grade typography) positioned imperatively
      if (labelEl && labelNameRef.current && labelSubRef.current) {
        // flip the label to the left of the node when it would overflow the frame
        const nearRight = leaf.x > base.clientWidth - 180;
        labelEl.style.opacity = '1';
        labelEl.style.transform = nearRight
          ? `translate(${leaf.x - 14}px, ${leaf.y - 14}px) translateX(-100%)`
          : `translate(${leaf.x + 14}px, ${leaf.y - 14}px)`;
        labelEl.style.setProperty('--focal', fp.color);
        labelEl.dataset.arrived = arrived ? '1' : '0';
        labelNameRef.current.textContent = FOCAL_NAME[fk] ?? fp.leafName;
        const region = FOCAL_REGION[fk] ?? '';
        labelSubRef.current.textContent = arrived
          ? `${region} · arrived home`
          : region;
      }
    };

    // ---- WIND layer: luminous trailing particles (fade-persist + additive) --
    const drawWind = (T: number, dtSec: number) => {
      const d = dataRef.current!;
      const cw = wind.clientWidth;
      const chh = wind.clientHeight;

      if (movedRef.current || reducedRef.current) {
        wctx.clearRect(0, 0, cw, chh);
        movedRef.current = false;
      } else {
        // dissolve previous trails a little -> comet tails
        wctx.globalCompositeOperation = 'destination-out';
        wctx.fillStyle = `rgba(0,0,0,${TRAIL_FADE})`;
        wctx.fillRect(0, 0, cw, chh);
      }
      if (reducedRef.current) return; // static end-state: no wind motion

      const edges = d.datedEdges;
      const frontier: number[] = [];
      const reached: number[] = [];
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (e.fromAge < T) continue;
        const span = e.fromAge - e.toAge;
        const progress = span <= 0 ? 1 : Math.min(1, Math.max(0, (e.fromAge - T) / span));
        reached.push(i);
        if (progress < 0.999) frontier.push(i);
      }
      if (!reached.length) return;
      const spawnPool = frontier.length ? frontier : reached;

      wctx.globalCompositeOperation = 'lighter';
      const glow = glowRef.current;
      const parts = particlesRef.current;
      for (let i = 0; i < parts.length; i++) {
        const pt = parts[i];
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
        // wind breathes even when time is paused (ambient flow of language)
        pt.u += pt.speed * (dtSec > 0 ? dtSec * 12 : 0.12) * (0.5 + speedRef.current * 0.3);
        if (pt.u >= 1) {
          const useFrontier = Math.random() < 0.72 && frontier.length;
          const pool = useFrontier ? frontier : spawnPool;
          pt.edge = pool[(Math.random() * pool.length) | 0] ?? reached[0] ?? 0;
          pt.u = 0;
          pt.pu = 0;
          continue;
        }
        const c = projCache.edges[pt.edge];
        if (!c) continue;
        const cu = Math.min(pt.u, progress);
        const cpu = Math.min(pt.pu, progress);
        const x = c.ax + (c.bx - c.ax) * cu;
        const y = c.ay + (c.by - c.ay) * cu;
        const px = c.ax + (c.bx - c.ax) * cpu;
        const py = c.ay + (c.by - c.ay) * cpu;

        const fade = 1 - pt.u; // brighter near the frontier head
        const support = Math.min(1, e.posterior * 1.4 + 0.25);

        // streak (drawn additively; fade-persist leaves the comet tail)
        wctx.strokeStyle = `rgba(${SKY.windMid}, ${(0.22 + 0.4 * fade) * support})`;
        wctx.lineWidth = 1.2;
        wctx.lineCap = 'round';
        wctx.beginPath();
        wctx.moveTo(px, py);
        wctx.lineTo(x, y);
        wctx.stroke();

        // luminous head
        if (glow) {
          const s = 5.5 + 7 * fade;
          wctx.globalAlpha = 0.48 * support;
          wctx.drawImage(glow, x - s / 2, y - s / 2, s, s);
          wctx.globalAlpha = 1;
        }
      }
      wctx.globalCompositeOperation = 'source-over';
    };

    const frame = (ts: number) => {
      const d = dataRef.current;
      if (!d) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const dtSec = lastTsRef.current ? Math.min((ts - lastTsRef.current) / 1000, 0.05) : 0;
      lastTsRef.current = ts;

      // re-project only when the camera has moved (movedRef is cleared by drawWind)
      if (movedRef.current) reproject();

      // reduced motion: render the static end-state, throttled (only ever
      // changes when the user scrubs) — no continuous animation.
      if (reducedRef.current) {
        if (!(frame as any)._rlast || ts - (frame as any)._rlast > 240) {
          (frame as any)._rlast = ts;
          const Tr = tRef.current;
          setTDisplay(Tr);
          drawBase(Tr, ts);
          drawWind(Tr, 0);
        }
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      if (playingRef.current) {
        const yearsPerSec = 100 * speedRef.current;
        tRef.current = Math.max(0, tRef.current - yearsPerSec * dtSec);
        if (tRef.current <= 0) {
          tRef.current = 0;
          playingRef.current = false;
          setPlaying(false);
        }
      }
      const T = tRef.current;
      if (!(frame as any)._last || ts - (frame as any)._last > 90) {
        (frame as any)._last = ts;
        setTDisplay(T);
      }

      drawBase(T, ts);
      drawWind(T, dtSec);

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mapReady]);

  // ---------------------------------------------------------------- controls
  const onScrub = (v: number) => {
    const d = dataRef.current;
    if (!d) return;
    const T = Math.max(0, d.rootAge - v);
    tRef.current = T;
    setTDisplay(T);
    movedRef.current = true; // clear stale wind trails on a time jump
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
  const progressPct = rootAge > 0 ? Math.min(100, Math.max(0, (elapsed / rootAge) * 100)) : 0;

  return (
    <div
      ref={containerRef as any}
      className="spread-frame relative w-full h-[calc(100dvh-11rem)] min-h-[600px] overflow-hidden rounded-[1.4rem]"
    >
      {/* warm-tinted basemap (mounts here, behind the canvases) + two stacked canvases */}
      <div ref={mapWrapRef} className="spread-map absolute inset-0 z-0 h-full w-full" />
      <canvas
        ref={baseCanvasRef}
        className="pointer-events-none absolute inset-0 z-[2]"
      />
      <canvas
        ref={windCanvasRef}
        className="pointer-events-none absolute inset-0 z-[3]"
      />

      {/* focal home label — crisp HTML typography, positioned imperatively */}
      <div
        ref={labelRef}
        className="spread-home-label pointer-events-none absolute left-0 top-0 z-[6] origin-top-left"
        style={{ opacity: 0 }}
      >
        <span ref={labelNameRef} className="spread-home-name" />
        <span ref={labelSubRef} className="spread-home-sub" />
      </div>

      {/* loading / error */}
      {(!libReady || !data || !mapReady) && !libError && (
        <div className="absolute inset-0 z-[20] grid place-items-center bg-[#0b0809]/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-sm text-[#e9dcc6]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#e0873a] border-t-transparent" />
            Charting five thousand years&hellip;
          </div>
        </div>
      )}
      {libError && (
        <div className="absolute inset-0 z-[20] grid place-items-center bg-[#0b0809] p-6 text-center">
          <div className="max-w-sm text-[#e9dcc6]">
            <p className="mb-1 font-semibold">The map engine could not load</p>
            <p className="text-sm text-[#b9a988]">
              MapLibre GL is served from a CDN and appears to be blocked on this
              network. See the{' '}
              <Link href="/map" className="text-[#f0a35a] underline">
                atlas
              </Link>{' '}
              instead.
            </p>
          </div>
        </div>
      )}

      {/* ---- HYPOTHESIS + HONESTY banner (top) ---- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[10] flex justify-center p-3 sm:p-4">
        <div className="spread-panel pointer-events-auto w-full max-w-3xl px-4 py-3.5 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="spread-chip mt-0.5 shrink-0">Hypothesis</span>
            <div className="min-w-0 text-[13px] leading-relaxed text-[#eaddc7]">
              <p className={bannerOpen ? '' : 'line-clamp-1'}>
                <strong className="font-semibold text-[#f6c88a]">
                  A language family spreading is not people arriving.
                </strong>{' '}
                Aboriginal &amp; Torres Strait Islander presence in Australia is{' '}
                <strong className="text-[#f5ecdb]">~65,000 years</strong>. This
                animates a far more recent{' '}
                <strong className="text-[#f5ecdb]">
                  ~5,000-year linguistic expansion
                </strong>{' '}
                (Pama-Nyungan, root ~5,578&nbsp;yr&nbsp;BP; 95% HPD
                ~4,456–6,967) across country that was{' '}
                <strong className="text-[#f5ecdb]">already long populated</strong>.
                Every stream is a language lineage moving through{' '}
                <em>existing</em> communities through contact &amp; shift — not a
                migration of first peoples.
              </p>
              {bannerOpen && (
                <p className="mt-2 text-[12.5px] text-[#c3b291]">
                  A model-inferred hypothesis from historical linguistics
                  (Bouckaert, Bowern &amp; Atkinson 2018; Glottolog 5.3). Tree{' '}
                  <em>topology</em> is well supported; geographic diffusion paths
                  &amp; dates are inferred and <em>uncertain</em>.{' '}
                  <button
                    onClick={() => setMethodOpen(true)}
                    className="spread-link pointer-events-auto"
                  >
                    Method &amp; sources
                  </button>
                </p>
              )}
            </div>
            <button
              onClick={() => setBannerOpen((v) => !v)}
              className="spread-icon-btn pointer-events-auto ml-auto shrink-0"
              aria-label={bannerOpen ? 'Collapse hypothesis note' : 'Expand hypothesis note'}
            >
              {bannerOpen ? '–' : '+'}
            </button>
          </div>
        </div>
      </div>

      {/* ---- Legend (bottom-left, above the controls) ---- */}
      {mapReady && data && (
        <div className="absolute left-3 top-[150px] z-[9] hidden w-[218px] max-w-[calc(100%-1.5rem)] sm:left-4 sm:block">
          <div className="spread-panel px-3.5 py-3 text-[11.5px] text-[#d9c9ab]">
            <button
              onClick={() => setLegendOpen((v) => !v)}
              className="spread-eyebrow mb-2 flex w-full items-center justify-between"
            >
              <span>Reading the map</span>
              <span aria-hidden>{legendOpen ? '▾' : '▸'}</span>
            </button>
            {legendOpen && (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-block h-2 w-5 rounded-full"
                    style={{
                      background: `linear-gradient(90deg, rgba(${SKY.windCore},0.9), rgba(${SKY.edge},0.35))`,
                      boxShadow: `0 0 6px rgba(${SKY.windMid},0.6)`,
                    }}
                  />
                  <span>
                    <strong className="font-semibold text-[#f0d3a8]">
                      Pama-Nyungan
                    </strong>{' '}
                    — the dated expansion (the light)
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <svg width="20" height="6" aria-hidden>
                    <line
                      x1="0"
                      y1="3"
                      x2="20"
                      y2="3"
                      stroke={`rgb(${SKY.context})`}
                      strokeWidth="1.4"
                      strokeDasharray="2,3"
                    />
                  </svg>
                  <span className="text-[#bdae91]">
                    Non-Pama-Nyungan northern families — static, undated context
                  </span>
                </div>
                <div className="mt-1 border-t border-white/8 pt-2">
                  <div className="spread-eyebrow mb-1.5">Edge certainty</div>
                  <div className="mb-1 flex items-center gap-2.5">
                    <svg width="26" height="6" aria-hidden>
                      <line x1="0" y1="3" x2="26" y2="3" stroke={`rgb(${SKY.edge})`} strokeWidth="2.2" />
                    </svg>
                    <span>solid — well-supported subgroups</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <svg width="26" height="6" aria-hidden>
                      <line
                        x1="0"
                        y1="3"
                        x2="26"
                        y2="3"
                        stroke={`rgb(${SKY.edge})`}
                        strokeWidth="1"
                        strokeDasharray="3,4"
                        opacity="0.7"
                      />
                    </svg>
                    <span className="text-[#bdae91]">
                      faint — deep splits, low posterior (~0.06–0.09)
                    </span>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-2.5 border-t border-white/8 pt-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{
                      background: `rgb(${SKY.emberCore})`,
                      boxShadow: `0 0 8px rgba(${SKY.ember},0.9), 0 0 2px rgba(${SKY.emberCore},1)`,
                    }}
                  />
                  <span>Gulf of Carpentaria — the source</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Focal-lineage tracer (right) ---- */}
      {mapReady && data && (
        <div className="absolute right-3 top-[150px] z-[9] hidden w-[214px] max-w-[calc(100%-1.5rem)] sm:right-4 sm:block">
          <div className="spread-panel px-3.5 py-3">
            <div className="spread-eyebrow mb-2.5">Trace a lineage home</div>
            <div className="flex flex-col gap-1.5">
              {FOCALS.map((f) => {
                const active = focal === f.key;
                const isKuku = f.key === 'kuku1273';
                const color = data.focalPaths[f.key]?.color ?? '#ffd23f';
                return (
                  <button
                    key={f.key}
                    onClick={() => setFocal(active ? null : f.key)}
                    aria-pressed={active}
                    className={`spread-trace-btn ${active ? 'is-active' : ''}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          background: color,
                          boxShadow: active ? `0 0 7px ${color}` : 'none',
                        }}
                      />
                      <span className="text-[12px]">{f.short}</span>
                    </span>
                    {isKuku && <span className="spread-yours">yours</span>}
                  </button>
                );
              })}
            </div>
            {focalPath && (
              <p className="mt-2.5 border-t border-white/8 pt-2.5 text-[11px] leading-relaxed text-[#bdae91]">
                Gulf&nbsp;→&nbsp;{focalPath.leafName}. Watch the beacon travel the
                dated diffusion path as deep time unspools.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---- Time controls (bottom) ---- */}
      {mapReady && data && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[10] flex justify-center p-3 sm:p-4">
          <div className="spread-panel pointer-events-auto w-full max-w-3xl px-4 py-3.5 sm:px-5">
            <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-baseline gap-2.5">
                <span className="spread-readout tabular-nums">
                  {Math.round(tDisplay).toLocaleString()}
                </span>
                <span className="spread-readout-unit">yr BP</span>
                <span className="spread-readout-cal">{calendarLabel(tDisplay)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (tDisplay <= 0) restart();
                    else setPlaying((p) => !p);
                  }}
                  className="spread-play"
                >
                  {tDisplay <= 0 ? '↻ Replay' : playing ? '❚❚ Pause' : '▶ Play'}
                </button>
                <div className="spread-speed">
                  {SPEED_STEPS.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => setSpeedIdx(i)}
                      aria-pressed={speedIdx === i}
                      className={speedIdx === i ? 'is-active' : ''}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* mobile-only lineage tracer (the side panel is hidden on phones) */}
            <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-0.5 sm:hidden">
              {FOCALS.map((f) => {
                const active = focal === f.key;
                const color = data.focalPaths[f.key]?.color ?? '#ffd23f';
                return (
                  <button
                    key={f.key}
                    onClick={() => setFocal(active ? null : f.key)}
                    aria-pressed={active}
                    className={`spread-trace-btn shrink-0 !w-auto !px-2.5 ${active ? 'is-active' : ''}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: color, boxShadow: active ? `0 0 6px ${color}` : 'none' }}
                      />
                      <span className="text-[11px] whitespace-nowrap">{f.short}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="spread-scrub-wrap" style={{ ['--pct' as any]: `${progressPct}%` }}>
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
            </div>
            <div className="mt-1.5 flex justify-between text-[10.5px] text-[#a99a7f]">
              <span>Gulf origin · {fmtBP(rootAge)} · {calendarLabel(rootAge)}</span>
              <span>present day · 0 yr BP</span>
            </div>
          </div>
        </div>
      )}

      {/* ---- Method & sources modal ---- */}
      {methodOpen && data && (
        <div
          className="absolute inset-0 z-[30] flex items-start justify-center overflow-y-auto bg-black/72 p-4 backdrop-blur-sm"
          onClick={() => setMethodOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Method, honesty and sources"
        >
          <div
            className="spread-modal my-8 w-full max-w-2xl p-6 sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold tracking-tight text-[#f4d9ac]">
                Method, honesty &amp; sources
              </h2>
              <button
                onClick={() => setMethodOpen(false)}
                className="spread-icon-btn"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mb-5 text-[13.5px] leading-relaxed text-[#d8c8ab]">
              This is a <strong className="text-[#f0e3cb]">model-inferred hypothesis</strong>{' '}
              about how the Pama-Nyungan language family diffused across an
              already-populated continent — not a settlement story, not a fact.
              Tree topology is comparatively well supported; geographic paths and
              dates are inferred and uncertain.
            </p>
            <h3 className="spread-eyebrow mb-2.5">Scientific-honesty caveats</h3>
            <ol className="mb-6 space-y-2.5 text-[13px] leading-relaxed text-[#d3c3a6]">
              {data.caveats
                .filter((c) => /^\d/.test(c))
                .map((c, i) => (
                  <li key={i} className="spread-caveat">
                    <span className="spread-caveat-n">{i + 1}</span>
                    <span>{c.replace(/^\d+\.\s*/, '')}</span>
                  </li>
                ))}
            </ol>
            <h3 className="spread-eyebrow mb-2.5">Sources</h3>
            <ul className="space-y-2 text-[12.5px] leading-relaxed text-[#d3c3a6]">
              {data.sources.map((s) => (
                <li key={s.id} className="spread-source">
                  <div className="font-medium text-[#f0e3cb]">{s.citation}</div>
                  {s.doi && (
                    <a
                      href={`https://doi.org/${s.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      className="spread-link"
                    >
                      doi:{s.doi}
                    </a>
                  )}
                  {s.license && (
                    <div className="mt-0.5 text-[11px] text-[#a99a7f]">{s.license}</div>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[11px] leading-relaxed text-[#a99a7f]">
              Data via the Phlorest CLDF standardisation (CC-BY-4.0); a D-PLACE
              CC-BY-NC discrepancy is noted in the dataset SOURCES — non-commercial
              research use, authors attributed. This is Indigenous linguistic
              heritage; represent it carefully and do not overstate certainty.
            </p>
          </div>
        </div>
      )}

      <style jsx global>{`
        /* ---- the night-sky frame ---- */
        .spread-frame {
          background:
            radial-gradient(120% 110% at 52% 30%, #2c2140 0%, #1e1730 30%, #150f1c 58%, #0c0810 100%);
          border: 1px solid rgba(224, 135, 58, 0.16);
          box-shadow:
            0 1px 0 rgba(255, 240, 214, 0.04) inset,
            0 24px 60px -30px rgba(0, 0, 0, 0.75);
        }
        /* warm-tint the raster basemap so the land reads as a warm silhouette */
        .spread-frame .maplibregl-canvas,
        .spread-frame .maplibregl-map {
          filter: saturate(1.2) brightness(1.05) sepia(0.34) hue-rotate(-12deg)
            contrast(1.12);
        }
        .spread-frame .maplibregl-ctrl-attrib {
          background: rgba(11, 8, 9, 0.6) !important;
          color: #8f8168 !important;
        }
        .spread-frame .maplibregl-ctrl-attrib a {
          color: #a99a7f !important;
        }
        .spread-frame .maplibregl-ctrl-group {
          background: rgba(20, 15, 16, 0.72) !important;
          border: 1px solid rgba(255, 240, 214, 0.08) !important;
          box-shadow: none !important;
        }
        .spread-frame .maplibregl-ctrl-group button + button {
          border-top: 1px solid rgba(255, 240, 214, 0.08) !important;
        }
        .spread-frame .maplibregl-ctrl button .maplibregl-ctrl-icon {
          filter: invert(0.82) sepia(0.3) saturate(1.2) hue-rotate(-10deg);
        }

        /* ---- glass panels (purposeful over a map, not decorative) ---- */
        .spread-panel {
          background: rgba(19, 14, 16, 0.74);
          border: 1px solid rgba(255, 240, 214, 0.1);
          border-radius: 0.95rem;
          backdrop-filter: blur(14px) saturate(1.1);
          -webkit-backdrop-filter: blur(14px) saturate(1.1);
          box-shadow: 0 12px 32px -20px rgba(0, 0, 0, 0.85);
        }
        .spread-chip {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: #f2c98f;
          background: rgba(224, 135, 58, 0.16);
          border: 1px solid rgba(224, 135, 58, 0.34);
          border-radius: 999px;
          padding: 0.18rem 0.5rem;
          white-space: nowrap;
        }
        .spread-eyebrow {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          color: #b6a582;
        }
        .spread-link {
          color: #f0a85c;
          font-weight: 600;
          text-decoration: underline;
          text-underline-offset: 2px;
          text-decoration-color: rgba(240, 168, 92, 0.5);
        }
        .spread-link:hover {
          color: #ffc079;
          text-decoration-color: #ffc079;
        }
        .spread-icon-btn {
          display: grid;
          place-items: center;
          width: 1.5rem;
          height: 1.5rem;
          border-radius: 0.5rem;
          color: #b6a582;
          font-size: 15px;
          line-height: 1;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .spread-icon-btn:hover {
          color: #f4e6cc;
          background: rgba(255, 240, 214, 0.08);
        }

        /* ---- trace buttons ---- */
        .spread-trace-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          width: 100%;
          text-align: left;
          padding: 0.42rem 0.6rem;
          border-radius: 0.6rem;
          border: 1px solid rgba(255, 240, 214, 0.08);
          color: #cdbd9e;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .spread-trace-btn:hover {
          background: rgba(255, 240, 214, 0.05);
          color: #efe2c9;
        }
        .spread-trace-btn.is-active {
          background: rgba(255, 240, 214, 0.09);
          border-color: rgba(255, 240, 214, 0.24);
          color: #fff7e9;
          font-weight: 600;
        }
        .spread-yours {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #f2c98f;
          background: rgba(224, 135, 58, 0.18);
          border-radius: 999px;
          padding: 0.08rem 0.34rem;
        }

        /* ---- readout typography ---- */
        .spread-readout {
          font-size: 1.9rem;
          line-height: 1;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #ffe6bd;
          text-shadow: 0 0 18px rgba(224, 135, 58, 0.35);
        }
        .spread-readout-unit {
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #c3b291;
          text-transform: uppercase;
        }
        .spread-readout-cal {
          font-size: 0.78rem;
          font-style: italic;
          color: #a99a7f;
          font-family: var(--font-display), Georgia, serif;
        }

        /* ---- play + speed ---- */
        .spread-play {
          border-radius: 0.6rem;
          padding: 0.42rem 0.85rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: #1a1008;
          background: linear-gradient(180deg, #f7c886, #eaa159);
          box-shadow: 0 0 18px -4px rgba(234, 161, 89, 0.6);
          transition: filter 0.15s ease, transform 0.1s ease;
        }
        .spread-play:hover {
          filter: brightness(1.06);
        }
        .spread-play:active {
          transform: translateY(1px);
        }
        .spread-speed {
          display: flex;
          overflow: hidden;
          border-radius: 0.55rem;
          border: 1px solid rgba(255, 240, 214, 0.14);
        }
        .spread-speed button {
          padding: 0.42rem 0.5rem;
          font-size: 11px;
          font-weight: 600;
          color: #a99a7f;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .spread-speed button:hover {
          color: #e6d7ba;
        }
        .spread-speed button.is-active {
          background: rgba(255, 240, 214, 0.14);
          color: #fff7e9;
        }

        /* ---- scrubber ---- */
        .spread-scrub-wrap {
          position: relative;
        }
        .spread-scrubber {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            rgba(${SKY.windCore}, 0.9) 0%,
            rgba(${SKY.edge}, 0.85) var(--pct, 40%),
            rgba(112, 150, 126, 0.5) var(--pct, 40%),
            rgba(112, 150, 126, 0.28) 100%
          );
          outline: none;
        }
        .spread-scrubber::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 17px;
          height: 17px;
          border-radius: 50%;
          background: radial-gradient(circle at 40% 35%, #fff6e6, #f0b061);
          border: 2px solid rgba(11, 8, 9, 0.85);
          cursor: pointer;
          box-shadow: 0 0 0 3px rgba(224, 135, 58, 0.3),
            0 0 16px 2px rgba(240, 176, 97, 0.7);
        }
        .spread-scrubber::-moz-range-thumb {
          width: 17px;
          height: 17px;
          border-radius: 50%;
          background: radial-gradient(circle at 40% 35%, #fff6e6, #f0b061);
          border: 2px solid rgba(11, 8, 9, 0.85);
          cursor: pointer;
          box-shadow: 0 0 0 3px rgba(224, 135, 58, 0.3),
            0 0 16px 2px rgba(240, 176, 97, 0.7);
        }
        .spread-scrubber:focus-visible::-webkit-slider-thumb {
          box-shadow: 0 0 0 3px rgba(255, 240, 214, 0.85),
            0 0 16px 2px rgba(240, 176, 97, 0.7);
        }

        /* ---- home label ---- */
        .spread-home-label {
          display: flex;
          flex-direction: column;
          gap: 0.05rem;
          padding: 0.34rem 0.6rem;
          border-radius: 0.55rem;
          background: rgba(15, 11, 12, 0.82);
          border: 1px solid color-mix(in oklab, var(--focal, #ffd23f) 45%, transparent);
          box-shadow: 0 8px 22px -12px rgba(0, 0, 0, 0.9);
          transition: opacity 0.4s ease;
          max-width: 190px;
        }
        .spread-home-name {
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--focal, #ffd23f);
        }
        .spread-home-sub {
          font-size: 10px;
          letter-spacing: 0.02em;
          color: #c3b291;
        }
        .spread-home-label[data-arrived='1'] {
          box-shadow: 0 0 18px -2px color-mix(in oklab, var(--focal, #ffd23f) 55%, transparent),
            0 8px 22px -12px rgba(0, 0, 0, 0.9);
        }

        /* ---- modal ---- */
        .spread-modal {
          background: #14100f;
          border: 1px solid rgba(255, 240, 214, 0.1);
          border-radius: 1.1rem;
          box-shadow: 0 40px 90px -40px rgba(0, 0, 0, 0.9);
        }
        .spread-caveat {
          display: grid;
          grid-template-columns: 1.4rem 1fr;
          gap: 0.6rem;
          align-items: start;
        }
        .spread-caveat-n {
          display: grid;
          place-items: center;
          width: 1.4rem;
          height: 1.4rem;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          color: #f2c98f;
          background: rgba(224, 135, 58, 0.14);
          border: 1px solid rgba(224, 135, 58, 0.28);
        }
        .spread-source {
          background: rgba(255, 240, 214, 0.03);
          border: 1px solid rgba(255, 240, 214, 0.07);
          border-radius: 0.6rem;
          padding: 0.6rem 0.75rem;
        }

        @media (prefers-reduced-motion: reduce) {
          .spread-frame .maplibregl-canvas {
            /* keep the tint; motion is handled in JS (static end-state) */
          }
        }
      `}</style>
    </div>
  );
}
