'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike, type MapGeoJSONFeature } from 'maplibre-gl';
import type { AreaSpot, Bounds } from '@/lib/research/field/types';
import type { Basemap } from '../offline-store';
import type { Fix } from './sensors';
import type { FieldLog } from './useFieldData';

// Fixed-scale tokens (packages/ui tokens.css): the field app is always in
// daylight mode, whatever the site theme.
const COLOUR = {
  paper: '#ebe3d7', // sand-200
  ochre: '#b45e2a', // ochre-600
  ochreDeep: '#964a22', // ochre-700
  find: '#386b4f', // eucalyptus-600
  none: '#695746', // muted foreground
  white: '#ffffff',
};

export type MapLayers = { suitability: boolean; spots: boolean; logs: boolean };

export type FieldMapHandle = {
  centreOn: (lon: number, lat: number, zoom?: number) => void;
  showArea: () => void;
  frame: (points: Array<[number, number]>) => void;
};

type Props = {
  basemap: Basemap | null;
  suitability: { image: Blob; bounds: Bounds } | null;
  spots: AreaSpot[];
  logs: FieldLog[];
  fix: Fix | null;
  heading: number | null;
  goTo: AreaSpot | null;
  selectedLogId: string | null;
  layers: MapLayers;
  overlayOpacity: number;
  /** Space covered by the sheet or side panel, so framing avoids it. */
  inset: { bottom: number; left: number };
  onSelectLog: (id: string) => void;
  onSelectSpot: (spot: AreaSpot) => void;
  onBackground: () => void;
};

function corners(b: Bounds): [[number, number], [number, number], [number, number], [number, number]] {
  return [
    [b.west, b.north],
    [b.east, b.north],
    [b.east, b.south],
    [b.west, b.south],
  ];
}

/** A circle of `radius` metres as a polygon ring, for the GPS accuracy halo. */
function circle(lon: number, lat: number, radius: number): GeoJSON.Polygon {
  const points: Array<[number, number]> = [];
  const dLat = radius / 111_320;
  const dLon = radius / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    points.push([lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat]);
  }
  return { type: 'Polygon', coordinates: [points] };
}

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Decode a saved image into a canvas. MapLibre reads canvas sources directly,
 * so map images never need a URL fetch (and work the same offline).
 */
function useCanvas(blob: Blob | null | undefined): HTMLCanvasElement | null {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!blob) {
      setCanvas(null);
      return;
    }
    let cancelled = false;
    void createImageBitmap(blob)
      .then((bitmap) => {
        if (cancelled) return bitmap.close();
        const next = document.createElement('canvas');
        next.width = bitmap.width;
        next.height = bitmap.height;
        next.getContext('2d')?.drawImage(bitmap, 0, 0);
        bitmap.close();
        setCanvas(next);
      })
      .catch(() => setCanvas(null));
    return () => {
      cancelled = true;
    };
  }, [blob]);
  return canvas;
}

const FieldMap = forwardRef<FieldMapHandle, Props>(function FieldMap(props, ref) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef(false);
  const insetRef = useRef(props.inset);
  insetRef.current = props.inset;
  const handlers = useRef(props);
  handlers.current = props;

  const basemapCanvas = useCanvas(props.basemap?.image);
  const suitabilityCanvas = useCanvas(props.suitability?.image);

  const padding = () => {
    const { bottom, left } = insetRef.current;
    return { top: 80, right: 76, bottom: bottom + 32, left: left + 32 };
  };

  useImperativeHandle(ref, () => ({
    centreOn: (lon, lat, zoom) =>
      mapRef.current?.easeTo({ center: [lon, lat], zoom: zoom ?? Math.max(mapRef.current.getZoom(), 14), padding: padding(), duration: 450 }),
    showArea: () => {
      const b = handlers.current.basemap?.bounds;
      if (b) mapRef.current?.fitBounds([[b.west, b.south], [b.east, b.north]] as LngLatBoundsLike, { padding: padding(), duration: 450 });
    },
    frame: (points) => {
      if (points.length === 0) return;
      const lons = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      mapRef.current?.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]] as LngLatBoundsLike,
        { padding: padding(), maxZoom: 17, duration: 450 },
      );
    },
  }));

  useEffect(() => {
    if (!node.current || mapRef.current) return;
    setWorkerUrl('/api/admin/research/quinkan/static/maplibre-gl-worker.mjs');
    const map = new MapLibreMap({
      container: node.current,
      style: { version: 8, sources: {}, layers: [{ id: 'paper', type: 'background', paint: { 'background-color': COLOUR.paper } }] },
      center: [143.85, -15.2],
      zoom: 9.5,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxZoom: 18.5,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    map.on('load', () => {
      for (const id of ['logs', 'spots', 'me', 'route']) map.addSource(id, { type: 'geojson', data: empty });
      map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': COLOUR.ochreDeep, 'line-width': 3, 'line-dasharray': [1.5, 1.5] } });
      // Search spots appear at walking scale; the shading carries the overview.
      map.addLayer({
        id: 'spots',
        type: 'circle',
        source: 'spots',
        minzoom: 12,
        filter: ['!', ['get', 'selected']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 15, 7, 17, 10],
          'circle-color': 'rgba(255,255,255,0.92)',
          'circle-stroke-color': COLOUR.ochreDeep,
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'spot-target',
        type: 'circle',
        source: 'spots',
        filter: ['get', 'selected'],
        paint: { 'circle-radius': 11, 'circle-color': COLOUR.ochreDeep, 'circle-stroke-color': COLOUR.white, 'circle-stroke-width': 3 },
      });
      map.addLayer({
        id: 'logs',
        type: 'circle',
        source: 'logs',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 12, ['==', ['get', 'kind'], 'presence'], 8, 6],
          'circle-color': ['case', ['==', ['get', 'kind'], 'presence'], COLOUR.find, COLOUR.white],
          'circle-stroke-color': ['case', ['get', 'pending'], COLOUR.ochre, ['==', ['get', 'kind'], 'presence'], COLOUR.white, COLOUR.none],
          'circle-stroke-width': ['case', ['get', 'pending'], 3, 2.5],
        },
      });
      map.addLayer({
        id: 'me-halo',
        type: 'fill',
        source: 'me',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': COLOUR.ochre, 'fill-opacity': 0.14 },
      });
      map.addLayer({
        id: 'me-halo-edge',
        type: 'line',
        source: 'me',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'line-color': COLOUR.ochre, 'line-width': 1.5, 'line-opacity': 0.6 },
      });
      map.addLayer({
        id: 'me',
        type: 'circle',
        source: 'me',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 8, 'circle-color': COLOUR.ochre, 'circle-stroke-color': COLOUR.white, 'circle-stroke-width': 3 },
      });

      const pick = (point: { x: number; y: number }, layers: string[]): MapGeoJSONFeature | undefined =>
        map.queryRenderedFeatures(
          [
            [point.x - 14, point.y - 14],
            [point.x + 14, point.y + 14],
          ],
          { layers },
        )[0];
      map.on('click', (event) => {
        const log = pick(event.point, ['logs']);
        if (log) return handlers.current.onSelectLog(String(log.properties.id));
        const spot = pick(event.point, ['spot-target', 'spots']);
        if (spot) {
          const [lon, lat] = (spot.geometry as GeoJSON.Point).coordinates;
          return handlers.current.onSelectSpot({ lon, lat, percentile: Number(spot.properties.percentile) });
        }
        handlers.current.onBackground();
      });
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Basemap (drawn by the engine from the area's own layers; no tile servers).
  useEffect(() => {
    const map = mapRef.current;
    const bounds = props.basemap?.bounds;
    if (!ready || !map) return;
    if (map.getLayer('basemap')) map.removeLayer('basemap');
    if (map.getSource('basemap')) map.removeSource('basemap');
    if (!basemapCanvas || !bounds) return;
    map.addSource('basemap', { type: 'canvas', canvas: basemapCanvas, animate: false, coordinates: corners(bounds) });
    map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, map.getLayer('suitability') ? 'suitability' : 'route');
    if (!fitted.current) {
      fitted.current = true;
      map.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: padding(), duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, basemapCanvas]);

  useEffect(() => {
    const map = mapRef.current;
    const bounds = props.suitability?.bounds;
    if (!ready || !map) return;
    if (map.getLayer('suitability')) map.removeLayer('suitability');
    if (map.getSource('suitability')) map.removeSource('suitability');
    if (!suitabilityCanvas || !bounds) return;
    map.addSource('suitability', { type: 'canvas', canvas: suitabilityCanvas, animate: false, coordinates: corners(bounds) });
    map.addLayer(
      { id: 'suitability', type: 'raster', source: 'suitability', paint: { 'raster-opacity': props.overlayOpacity, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } },
      'route',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, suitabilityCanvas]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (map.getLayer('suitability')) {
      map.setLayoutProperty('suitability', 'visibility', props.layers.suitability ? 'visible' : 'none');
      map.setPaintProperty('suitability', 'raster-opacity', props.overlayOpacity);
    }
    map.setLayoutProperty('spots', 'visibility', props.layers.spots ? 'visible' : 'none');
    map.setLayoutProperty('spot-target', 'visibility', props.layers.spots ? 'visible' : 'none');
    map.setLayoutProperty('logs', 'visibility', props.layers.logs ? 'visible' : 'none');
  }, [ready, props.layers, props.overlayOpacity, suitabilityCanvas]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('logs') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: props.logs.map((log) => ({
        type: 'Feature',
        properties: { id: log.id, kind: log.kind, pending: log.pending, selected: log.id === props.selectedLogId },
        geometry: { type: 'Point', coordinates: [log.longitude, log.latitude] },
      })),
    });
  }, [ready, props.logs, props.selectedLogId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const target = props.goTo;
    (map.getSource('spots') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: props.spots.map((spot) => ({
        type: 'Feature',
        properties: { percentile: spot.percentile, selected: Boolean(target && target.lon === spot.lon && target.lat === spot.lat) },
        geometry: { type: 'Point', coordinates: [spot.lon, spot.lat] },
      })),
    });
  }, [ready, props.spots, props.goTo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const fix = props.fix;
    (map.getSource('me') as GeoJSONSource).setData(
      fix
        ? {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', properties: {}, geometry: circle(fix.lon, fix.lat, Math.max(fix.accuracy, 3)) },
              { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [fix.lon, fix.lat] } },
            ],
          }
        : empty,
    );
    (map.getSource('route') as GeoJSONSource).setData(
      fix && props.goTo
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [[fix.lon, fix.lat], [props.goTo.lon, props.goTo.lat]] },
          }
        : empty,
    );
  }, [ready, props.fix, props.goTo]);

  return (
    // MapLibre's stylesheet makes its container position: relative, so the
    // full-screen positioning lives on a wrapper.
    <div className="absolute inset-0">
      <div
        ref={node}
        className="field-map h-full w-full"
        role="region"
        aria-label="Station map. Your position, your logs and the best ground to search are listed in the panel."
      />
    </div>
  );
});

export default FieldMap;
