'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAPLIBRE_JS, MAPLIBRE_CSS, BASEMAP, AU_BOUNDS } from '../atlasConfig';

export interface GrammarPointProps {
  slug: string;
  name: string;
  family: string;
  __c: string; // per-slug fill colour (set from `paint`)
  __o: number; // per-slug opacity
  __r: number; // per-slug radius boost (0 normal, >0 emphasised)
  __sel: boolean;
}
export interface GrammarPointCollection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: GrammarPointProps;
  }[];
}

export interface SlugPaint {
  c: string;
  o: number;
  r?: number;
}

interface Tooltip {
  x: number;
  y: number;
  name: string;
  family: string;
  detail: string;
}

function isDark() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

interface GrammarMapProps {
  points: GrammarPointCollection;
  /** per-slug colour + opacity (+ optional radius boost). Slugs absent here fall
   *  back to a faint neutral so nothing silently disappears. */
  paint: Record<string, SlugPaint>;
  /** short label under each language name in the hover tooltip (e.g. its value) */
  detailForSlug: (slug: string) => string;
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
}

const FALLBACK: SlugPaint = { c: '#8a8172', o: 0.14 };

/**
 * A focused MapLibre island that colours every located language by a caller-
 * supplied per-slug paint (feature value, or compare highlight). It reuses the
 * hub map's basemap/bounds/loader (atlasConfig) but is purpose-built so the hub
 * map never regresses. Container is `h-full w-full` (NOT absolute inset-0).
 */
export default function GrammarMap({
  points,
  paint,
  detailForSlug,
  selectedSlug,
  onSelect,
}: GrammarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const fcRef = useRef<GrammarPointCollection>(points);
  const paintRef = useRef(paint);
  const detailRef = useRef(detailForSlug);
  const initedRef = useRef(false);

  const [libReady, setLibReady] = useState(false);
  const [libError, setLibError] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  fcRef.current = points;
  paintRef.current = paint;
  detailRef.current = detailForSlug;

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

  const applyPaint = useCallback(() => {
    const fc = fcRef.current;
    const p = paintRef.current;
    for (const f of fc.features) {
      const sp = p[f.properties.slug] ?? FALLBACK;
      f.properties.__c = sp.c;
      f.properties.__o = sp.o;
      f.properties.__r = sp.r ?? 0;
      f.properties.__sel = f.properties.slug === selectedSlug;
    }
    const map = mapRef.current;
    if (map && map.getSource('gl')) {
      try {
        map.getSource('gl').setData(fc);
      } catch {
        /* not ready */
      }
    }
  }, [selectedSlug]);

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
        { id: 'bg', type: 'background', paint: { 'background-color': dark ? BASEMAP.bg.dark : BASEMAP.bg.light } },
        { id: 'basemap', type: 'raster', source: 'carto', paint: { 'raster-opacity': dark ? 0.8 : 0.9 } },
      ],
    };
  }, []);

  // ---------------------------------------------------------------- init map
  useEffect(() => {
    if (!libReady || !containerRef.current || initedRef.current) return;
    const maplibregl = (window as any).maplibregl;
    initedRef.current = true;
    const dark = isDark();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(dark),
      center: [134, -27],
      zoom: 3.05,
      minZoom: 2.4,
      maxZoom: 9,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.on('error', (e: any) => {
      const url = e?.error?.url || '';
      if (typeof url === 'string' && url.includes('cartocdn')) setTilesFailed(true);
    });

    const stroke = dark ? BASEMAP.stroke.dark : BASEMAP.stroke.light;

    const addLayers = () => {
      // seed __c/__o before first paint
      for (const f of fcRef.current.features) {
        const sp = paintRef.current[f.properties.slug] ?? FALLBACK;
        f.properties.__c = sp.c;
        f.properties.__o = sp.o;
        f.properties.__r = sp.r ?? 0;
        f.properties.__sel = f.properties.slug === selectedSlug;
      }
      if (!map.getSource('gl')) map.addSource('gl', { type: 'geojson', data: fcRef.current });
      if (!map.getLayer('gl-points')) {
        map.addLayer({
          id: 'gl-points',
          type: 'circle',
          source: 'gl',
          paint: {
            'circle-color': ['get', '__c'],
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2.5,
              ['+', 3, ['+', ['get', '__r'], ['case', ['get', '__sel'], 3, 0]]],
              5,
              ['+', 4.8, ['+', ['get', '__r'], ['case', ['get', '__sel'], 3.5, 0]]],
              8,
              ['+', 7, ['+', ['get', '__r'], ['case', ['get', '__sel'], 4, 0]]],
            ],
            'circle-opacity': ['get', '__o'],
            'circle-stroke-width': [
              'case',
              ['get', '__sel'],
              2.6,
              ['case', ['>', ['get', '__o'], 0.4], 0.8, 0],
            ],
            'circle-stroke-color': ['case', ['get', '__sel'], dark ? '#fff4e0' : '#2e2720', stroke],
            'circle-stroke-opacity': ['case', ['get', '__sel'], 1, 0.65],
          },
        });
      }
    };

    map.on('load', () => {
      addLayers();
      map.resize();
      map.fitBounds(AU_BOUNDS, { padding: 36, duration: 0 });
    });

    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        /* torn down */
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    map.on('mousemove', 'gl-points', (e: any) => {
      map.getCanvas().style.cursor = 'pointer';
      const p = e.features?.[0]?.properties;
      if (p) {
        setTooltip({
          x: e.point.x,
          y: e.point.y,
          name: p.name,
          family: p.family === 'unclassified' ? 'Unclassified' : p.family,
          detail: detailRef.current(p.slug),
        });
      }
    });
    map.on('mouseleave', 'gl-points', () => {
      map.getCanvas().style.cursor = '';
      setTooltip(null);
    });
    map.on('click', (e: any) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['gl-points'] });
      onSelect(hits.length ? hits[0].properties.slug : null);
    });

    const observer = new MutationObserver(() => {
      const d = isDark();
      const strokeNow = d ? BASEMAP.stroke.dark : BASEMAP.stroke.light;
      try {
        if (map.getLayer('basemap')) map.removeLayer('basemap');
        if (map.getSource('carto')) map.removeSource('carto');
        map.addSource('carto', {
          type: 'raster',
          tiles: d ? BASEMAP.dark : BASEMAP.light,
          tileSize: 256,
          attribution: BASEMAP.attribution,
        });
        map.addLayer(
          { id: 'basemap', type: 'raster', source: 'carto', paint: { 'raster-opacity': d ? 0.8 : 0.9 } },
          'gl-points',
        );
        map.setPaintProperty('bg', 'background-color', d ? BASEMAP.bg.dark : BASEMAP.bg.light);
        map.setPaintProperty('gl-points', 'circle-stroke-color', [
          'case',
          ['get', '__sel'],
          d ? '#fff4e0' : '#2e2720',
          strokeNow,
        ]);
      } catch {
        /* torn down */
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      initedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libReady, buildStyle]);

  // re-paint whenever the caller changes the feature / mode / selection
  useEffect(() => {
    applyPaint();
  }, [paint, selectedSlug, points, applyPaint]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="Map of Australian languages coloured by the selected grammatical feature. Use the feature picker and the language list; the directory offers a non-map alternative."
        tabIndex={0}
      />

      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 max-w-[240px] rounded-lg border border-border bg-popover/95 px-3 py-2 text-popover-foreground shadow-lg backdrop-blur-sm"
          style={{
            left: Math.min(tooltip.x + 14, (containerRef.current?.clientWidth ?? 400) - 230),
            top: Math.max(tooltip.y - 8, 8),
          }}
        >
          <div className="text-sm font-semibold leading-tight" lang="mis">
            {tooltip.name}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{tooltip.family}</div>
          <div className="mt-1 text-[12px] font-medium text-foreground/90">{tooltip.detail}</div>
          <div className="mt-1 text-[11px] font-medium text-primary">Click to open profile →</div>
        </div>
      )}

      {!libReady && !libError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Loading map…
          </div>
        </div>
      )}
      {libError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
          <div className="max-w-sm rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
            The interactive map couldn&rsquo;t load its rendering library. Every language is still
            browsable in the{' '}
            <a href="/atlas/directory" className="font-medium text-primary underline">
              directory
            </a>
            .
          </div>
        </div>
      )}
      {tilesFailed && libReady && (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm">
          Basemap tiles unavailable — points shown on a plain background.
        </div>
      )}

      <style jsx global>{`
        .maplibregl-ctrl-attrib {
          font-size: 10px;
        }
        .maplibregl-popup {
          display: none;
        }
      `}</style>
    </div>
  );
}
