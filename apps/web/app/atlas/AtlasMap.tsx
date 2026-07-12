'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAPLIBRE_JS,
  MAPLIBRE_CSS,
  BASEMAP,
  AU_BOUNDS,
  type AtlasPointProps,
} from './atlasConfig';

interface PointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: AtlasPointProps;
}
export interface PointCollection {
  type: 'FeatureCollection';
  features: PointFeature[];
}

interface Tooltip {
  x: number;
  y: number;
  name: string;
  family: string;
  tier: string;
  approx: boolean;
}

function isDark() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

interface AtlasMapProps {
  points: PointCollection;
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
}

/**
 * A self-contained MapLibre island: ~809 located languages as circles coloured
 * by family (colour is precomputed server-side into `__c`). Approximate-location
 * points render hollow (colored ring, near-transparent fill) so honesty is
 * visible at a glance. No clustering — 809 circles render smoothly and clustering
 * would hide the family colouring that is the whole point.
 */
export default function AtlasMap({
  points,
  selectedSlug,
  onSelect,
}: AtlasMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const fcRef = useRef<PointCollection>(points);
  const initedRef = useRef(false);
  const selectedRef = useRef<string | null>(selectedSlug);

  const [libReady, setLibReady] = useState(false);
  const [libError, setLibError] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

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
          paint: { 'raster-opacity': dark ? 0.8 : 0.9 },
        },
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
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'bottom-right',
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-left',
    );
    map.on('error', (e: any) => {
      const url = e?.error?.url || '';
      if (typeof url === 'string' && url.includes('cartocdn')) setTilesFailed(true);
    });

    const stroke = dark ? BASEMAP.stroke.dark : BASEMAP.stroke.light;

    const addLayers = () => {
      if (!map.getSource('langs')) {
        map.addSource('langs', { type: 'geojson', data: fcRef.current });
      }
      // approximate points first (below), so solid real points sit on top
      if (!map.getLayer('lang-points')) {
        map.addLayer({
          id: 'lang-points',
          type: 'circle',
          source: 'langs',
          paint: {
            'circle-color': ['get', '__c'],
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2.5,
              ['+', 3, ['case', ['get', '__sel'], 3, 0]],
              5,
              ['+', 4.6, ['case', ['get', '__sel'], 3.5, 0]],
              8,
              ['+', 6.8, ['case', ['get', '__sel'], 4, 0]],
            ],
            // approximate = near-hollow fill; real = solid
            'circle-opacity': ['case', ['get', 'approx'], 0.14, 0.88],
            'circle-stroke-width': [
              'case',
              ['get', '__sel'],
              2.6,
              ['case', ['get', 'approx'], 1.5, 0.7],
            ],
            // approximate points get a COLOURED ring (hollow look); real points a
            // subtle basemap-matched ring; selected gets a hard contrast ring
            'circle-stroke-color': [
              'case',
              ['get', '__sel'],
              dark ? '#fff4e0' : '#2e2720',
              ['case', ['get', 'approx'], ['get', '__c'], stroke],
            ],
            'circle-stroke-opacity': ['case', ['get', 'approx'], 0.95, 1],
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

    map.on('mousemove', 'lang-points', (e: any) => {
      map.getCanvas().style.cursor = 'pointer';
      const p = e.features?.[0]?.properties;
      if (p) {
        setTooltip({
          x: e.point.x,
          y: e.point.y,
          name: p.name,
          family: p.family === 'unclassified' ? 'Unclassified' : p.family,
          tier: p.tier,
          approx: p.approx === true || p.approx === 'true',
        });
      }
    });
    map.on('mouseleave', 'lang-points', () => {
      map.getCanvas().style.cursor = '';
      setTooltip(null);
    });

    map.on('click', (e: any) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['lang-points'] });
      if (hits.length) {
        onSelect(hits[0].properties.slug);
      } else {
        onSelect(null);
      }
    });

    // theme swap: replace only the basemap raster, keep the data layer
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
          {
            id: 'basemap',
            type: 'raster',
            source: 'carto',
            paint: { 'raster-opacity': d ? 0.8 : 0.9 },
          },
          'lang-points',
        );
        map.setPaintProperty('bg', 'background-color', d ? BASEMAP.bg.dark : BASEMAP.bg.light);
        map.setPaintProperty('lang-points', 'circle-stroke-color', [
          'case',
          ['get', '__sel'],
          d ? '#fff4e0' : '#2e2720',
          ['case', ['get', 'approx'], ['get', '__c'], strokeNow],
        ]);
      } catch {
        /* torn down */
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      initedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libReady, buildStyle]);

  // -------------------------------------------------- reflect selection change
  useEffect(() => {
    selectedRef.current = selectedSlug;
    const map = mapRef.current;
    const fc = fcRef.current;
    if (!map || !fc || !map.getSource('langs')) return;
    for (const f of fc.features) {
      f.properties.__sel = f.properties.slug === selectedSlug;
    }
    try {
      map.getSource('langs').setData(fc);
    } catch {
      /* not ready */
    }
    // recenter ONLY when the selection is off-screen, so arrowing through search
    // results (which highlights each) doesn't yank the map around on every key.
    if (selectedSlug) {
      const f = fc.features.find((x) => x.properties.slug === selectedSlug);
      if (f) {
        try {
          const b = map.getBounds();
          const [lng, lat] = f.geometry.coordinates;
          if (!b.contains([lng, lat])) {
            map.flyTo({
              center: f.geometry.coordinates,
              zoom: Math.max(map.getZoom(), 4.4),
              duration: 700,
            });
          }
        } catch {
          /* map not ready */
        }
      }
    }
  }, [selectedSlug]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="Interactive map of Australian languages, coloured by language family. Use the search to jump to any language; the language directory offers a non-map alternative."
        tabIndex={0}
      />

      {/* hover tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg border border-border bg-popover/95 px-3 py-2 text-popover-foreground shadow-lg backdrop-blur-sm"
          style={{
            left: Math.min(tooltip.x + 14, (containerRef.current?.clientWidth ?? 400) - 210),
            top: Math.max(tooltip.y - 8, 8),
          }}
        >
          <div className="text-sm font-semibold leading-tight" lang="mis">
            {tooltip.name}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{tooltip.family}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="capitalize">{tooltip.tier}</span>
            {tooltip.approx && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-foreground/70">
                location approximate
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] font-medium text-primary">Click to open profile →</div>
        </div>
      )}

      {/* loading / error overlays */}
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
            The interactive map couldn&rsquo;t load its rendering library. Every
            language is still fully browsable in the{' '}
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
