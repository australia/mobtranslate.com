'use client';

import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type ImageSource } from 'maplibre-gl';
import type { Bounds, FieldObservation } from '@/lib/research/field/types';

const API = '/api/admin/research/field';

type Props = {
  modelId: string | null;
  observations: FieldObservation[];
  publicRecords: Array<{ latitude: number; longitude: number }>;
};

async function loadImage(url: string): Promise<{ url: string; bounds: Bounds } | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const header = response.headers.get('x-bounds');
  if (!header) return null;
  return { url: URL.createObjectURL(await response.blob()), bounds: JSON.parse(header) as Bounds };
}

function corners(b: Bounds): [[number, number], [number, number], [number, number], [number, number]] {
  return [
    [b.west, b.north],
    [b.east, b.north],
    [b.east, b.south],
    [b.west, b.south],
  ];
}

/**
 * The prototype area on a private basemap the engine draws from its own
 * elevation, water and cover layers, so viewing it requests no third-party
 * tiles. Suitability, finds and public records sit on top.
 */
export default function FieldMap({ modelId, observations, publicRecords }: Props) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [opacity, setOpacity] = useState(0.75);
  const [status, setStatus] = useState<string | null>('Loading the area map…');

  useEffect(() => {
    if (!node.current || mapRef.current) return;
    setWorkerUrl('/api/admin/research/quinkan/static/maplibre-gl-worker.mjs');
    const map = new MapLibreMap({
      container: node.current,
      style: { version: 8, sources: {}, layers: [{ id: 'paper', type: 'background', paint: { 'background-color': '#e9e4d8' } }] },
      center: [143.85, -15.2],
      zoom: 9,
      attributionControl: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    mapRef.current = map;
    const urls: string[] = [];
    map.on('load', async () => {
      const base = await loadImage(`${API}/engine/basemap`);
      if (base) {
        urls.push(base.url);
        map.addSource('basemap', { type: 'image', url: base.url, coordinates: corners(base.bounds) });
        map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-resampling': 'linear' } });
        map.fitBounds([[base.bounds.west, base.bounds.south], [base.bounds.east, base.bounds.north]], { padding: 10, duration: 0 });
        setStatus(null);
      } else {
        setStatus('The area layers are not built yet.');
      }
      map.addSource('public', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'public',
        type: 'circle',
        source: 'public',
        paint: { 'circle-radius': 3, 'circle-color': '#6b4f9e', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 },
      });
      map.addSource('finds', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'finds',
        type: 'circle',
        source: 'finds',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'kind'], 'presence'], 6, 4],
          'circle-color': ['case', ['==', ['get', 'kind'], 'presence'], '#0f7b4a', '#6b7280'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        },
      });
      setReady(true);
    });
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Suitability overlay for the selected model.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    if (map.getLayer('suitability')) map.removeLayer('suitability');
    if (map.getSource('suitability')) map.removeSource('suitability');
    if (!modelId) return;
    void loadImage(`${API}/models/${modelId}/area.png`).then((image) => {
      if (!image || cancelled) return;
      objectUrl = image.url;
      map.addSource('suitability', { type: 'image', url: image.url, coordinates: corners(image.bounds) });
      map.addLayer(
        { id: 'suitability', type: 'raster', source: 'suitability', paint: { 'raster-opacity': opacity, 'raster-resampling': 'nearest' } },
        'public',
      );
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const source = map.getSource('suitability') as ImageSource | undefined;
      if (source && map.getLayer('suitability')) map.removeLayer('suitability');
      if (source) map.removeSource('suitability');
    };
    // Opacity changes are applied separately without reloading the image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, modelId]);

  useEffect(() => {
    const map = mapRef.current;
    if (ready && map?.getLayer('suitability')) map.setPaintProperty('suitability', 'raster-opacity', opacity);
  }, [opacity, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('finds') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: observations.map((o) => ({
        type: 'Feature',
        properties: { kind: o.kind },
        geometry: { type: 'Point', coordinates: [o.longitude, o.latitude] },
      })),
    });
    (map.getSource('public') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: publicRecords.map((r) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      })),
    });
  }, [ready, observations, publicRecords]);

  return (
    <div className="relative">
      <div ref={node} className="h-[min(70vh,40rem)] w-full" />
      {status && <p className="absolute inset-x-0 top-3 mx-auto w-fit rounded bg-card/90 px-3 py-1 text-sm shadow">{status}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[#0f7b4a]" /> Your finds
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#6b7280]" /> None here
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#6b4f9e]" /> Public records
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-10 rounded bg-gradient-to-r from-[#ffeda0] via-[#fd8d3c] to-[#800026]" /> Better ground
        </span>
        <label className="ml-auto inline-flex items-center gap-2">
          Overlay
          <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </label>
      </div>
    </div>
  );
}
