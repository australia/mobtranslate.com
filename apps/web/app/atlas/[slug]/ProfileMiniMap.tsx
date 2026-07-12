'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAPLIBRE_JS, MAPLIBRE_CSS, BASEMAP } from '../atlasConfig';

interface ProfileMiniMapProps {
  lat: number;
  lon: number;
  color: string;
  approximate: boolean;
  name: string;
}

function isDark() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

/**
 * A single-point locator inset for one language profile. Reuses the atlas
 * MapLibre stack (same basemaps, earth background). CRITICAL: the map div is
 * sized `h-full w-full` — MapLibre injects `position:relative` which overrides
 * Tailwind `.absolute`, so `absolute inset-0` would collapse to height 0.
 * The parent gives the fixed height.
 */
export default function ProfileMiniMap({
  lat,
  lon,
  color,
  approximate,
  name,
}: ProfileMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const initedRef = useRef(false);
  const [libReady, setLibReady] = useState(false);
  const [libError, setLibError] = useState(false);

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

  useEffect(() => {
    if (!libReady || !containerRef.current || initedRef.current) return;
    const maplibregl = (window as any).maplibregl;
    initedRef.current = true;
    const dark = isDark();
    const stroke = dark ? BASEMAP.stroke.dark : BASEMAP.stroke.light;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(dark),
      center: [lon, lat],
      zoom: 4.2,
      minZoom: 2.4,
      maxZoom: 9,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.on('error', () => {
      /* tile failures are non-fatal; the point still renders on the bg */
    });

    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: {},
        },
      ],
    };

    const addPoint = () => {
      if (!map.getSource('pt')) map.addSource('pt', { type: 'geojson', data: fc });
      if (!map.getLayer('pt-halo')) {
        map.addLayer({
          id: 'pt-halo',
          type: 'circle',
          source: 'pt',
          paint: {
            'circle-radius': 15,
            'circle-color': color,
            'circle-opacity': approximate ? 0.1 : 0.16,
            'circle-stroke-width': 0,
          },
        });
      }
      if (!map.getLayer('pt-core')) {
        map.addLayer({
          id: 'pt-core',
          type: 'circle',
          source: 'pt',
          paint: {
            'circle-radius': 7,
            'circle-color': approximate ? BASEMAP.bg[dark ? 'dark' : 'light'] : color,
            'circle-opacity': approximate ? 0.5 : 0.95,
            'circle-stroke-width': approximate ? 2.4 : 2,
            'circle-stroke-color': approximate ? color : stroke,
          },
        });
      }
    };

    map.on('load', () => {
      addPoint();
      map.resize();
    });

    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        /* torn down */
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    const observer = new MutationObserver(() => {
      const d = isDark();
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
          'pt-halo',
        );
        map.setPaintProperty('bg', 'background-color', d ? BASEMAP.bg.dark : BASEMAP.bg.light);
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
  }, [libReady, buildStyle, lat, lon, color, approximate]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="img"
        aria-label={`Map locating ${name}${approximate ? ' (approximate location)' : ''}`}
      />
      {!libReady && !libError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {libError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4 text-center text-[12px] text-muted-foreground">
          Map library unavailable — coordinates are shown above.
        </div>
      )}
      <style jsx global>{`
        .maplibregl-ctrl-attrib {
          font-size: 10px;
        }
      `}</style>
    </div>
  );
}
