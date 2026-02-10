'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';

interface LocationWord {
  id: string;
  word: string;
  normalized_word?: string;
  latitude: number;
  longitude: number;
  word_type?: string;
  word_class?: { name: string };
  definitions?: Array<{ definition: string }>;
}

interface AllLocationsMapProps {
  words: LocationWord[];
  languageCode: string;
  languageName: string;
}

export function AllLocationsMap({ words, languageCode, languageName }: AllLocationsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const [mapId] = useState(() => `map-all-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const container = mapContainerRef.current;
    if ((container as any)._leaflet_id) return;

    let map: LeafletMap | null = null;

    const initMap = async () => {
      const L = (await import('leaflet')).default;

      // Inject Leaflet CSS
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);
      }

      if ((container as any)._leaflet_id) return;

      map = L.map(container, {
        scrollWheelZoom: true,
        zoomControl: false, // We'll add it in a custom position
      });

      // Zoom control on the top-left
      L.control.zoom({ position: 'topleft' }).addTo(map);

      // Terrain-style tiles for a richer look
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      // Categorize words for layer groups
      const waterWords: typeof words = [];
      const landformWords: typeof words = [];
      const settlementWords: typeof words = [];
      const otherWords: typeof words = [];

      for (const word of words) {
        const def = word.definitions?.[0]?.definition?.toLowerCase() || '';
        if (def.match(/creek|river|waterhole|water|falls|bay|sea|beach|reef|lagoon|swamp/)) {
          waterWords.push(word);
        } else if (def.match(/mountain|hill|rock|cave|gorge|range|ridge|flat|valley|cliff|headland|cape|point|island/)) {
          landformWords.push(word);
        } else if (def.match(/camp|town|village|settlement|community|mission/)) {
          settlementWords.push(word);
        } else {
          otherWords.push(word);
        }
      }

      // SVG-based marker icons for crisp rendering at all sizes
      const createIcon = (color: string, borderColor: string) =>
        L.divIcon({
          className: 'custom-map-marker',
          html: `<div style="
            width: 18px; height: 18px;
            background: ${color};
            border: 2.5px solid ${borderColor};
            border-radius: 50%;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
            cursor: pointer;
          "></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          popupAnchor: [0, -12],
        });

      const waterIcon = createIcon('#0ea5e9', '#fff');
      const landIcon = createIcon('#b45309', '#fff');
      const settlementIcon = createIcon('#dc2626', '#fff');
      const otherIcon = createIcon('#2563eb', '#fff');

      const createMarkers = (wordList: typeof words, icon: L.DivIcon) =>
        wordList.map((w) => {
          const popupHtml = `
            <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 160px; max-width: 260px;">
              <a href="/dictionaries/${languageCode}/words/${encodeURIComponent(w.word)}"
                 style="font-size: 16px; font-weight: 700; color: #1d4ed8; text-decoration: none; display: block; line-height: 1.3;">
                ${w.word}
              </a>
              ${w.definitions?.[0]?.definition
                ? `<div style="font-size: 13px; color: #444; margin-top: 5px; line-height: 1.45;">${w.definitions[0].definition}</div>`
                : ''}
              ${w.word_type || w.word_class?.name
                ? `<div style="font-size: 11px; color: #999; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${w.word_type || w.word_class?.name}</div>`
                : ''}
            </div>
          `;
          return L.marker([w.latitude, w.longitude], { icon }).bindPopup(popupHtml, {
            maxWidth: 280,
            className: 'custom-popup',
          });
        });

      const waterLayer = L.layerGroup(createMarkers(waterWords, waterIcon));
      const landLayer = L.layerGroup(createMarkers(landformWords, landIcon));
      const settlementLayer = L.layerGroup(createMarkers(settlementWords, settlementIcon));
      const otherLayer = L.layerGroup(createMarkers(otherWords, otherIcon));

      // Add all layers to map by default
      waterLayer.addTo(map);
      landLayer.addTo(map);
      settlementLayer.addTo(map);
      otherLayer.addTo(map);

      // Layer control - collapsed like the article's approach
      const overlays: Record<string, L.LayerGroup> = {};
      if (waterWords.length > 0) overlays[`<span style="color:#0ea5e9;font-size:16px;">&#9679;</span> Water <span style="color:#888;">(${waterWords.length})</span>`] = waterLayer;
      if (landformWords.length > 0) overlays[`<span style="color:#b45309;font-size:16px;">&#9679;</span> Landforms <span style="color:#888;">(${landformWords.length})</span>`] = landLayer;
      if (settlementWords.length > 0) overlays[`<span style="color:#dc2626;font-size:16px;">&#9679;</span> Settlements <span style="color:#888;">(${settlementWords.length})</span>`] = settlementLayer;
      if (otherWords.length > 0) overlays[`<span style="color:#2563eb;font-size:16px;">&#9679;</span> Other Places <span style="color:#888;">(${otherWords.length})</span>`] = otherLayer;

      L.control.layers(undefined, overlays, { collapsed: true, position: 'topright' }).addTo(map);

      // Fit bounds to all markers with generous padding
      if (words.length > 0) {
        const bounds = L.latLngBounds(words.map((w) => [w.latitude, w.longitude]));
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });

        // Set max bounds with some breathing room to prevent panning too far
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const latPad = (ne.lat - sw.lat) * 0.5;
        const lngPad = (ne.lng - sw.lng) * 0.5;
        map.setMaxBounds(L.latLngBounds(
          [sw.lat - latPad, sw.lng - lngPad],
          [ne.lat + latPad, ne.lng + lngPad]
        ));
      }

      // Scale control
      L.control.scale({ metric: true, imperial: false, maxWidth: 200, position: 'bottomleft' }).addTo(map);

      // Custom info control at bottom-right
      const InfoControl = L.Control.extend({
        onAdd: () => {
          const div = L.DomUtil.create('div', 'leaflet-control');
          div.innerHTML = `
            <div style="
              background: rgba(255,255,255,0.9);
              backdrop-filter: blur(8px);
              padding: 8px 14px;
              border-radius: 8px;
              font-family: system-ui, sans-serif;
              font-size: 12px;
              color: #555;
              box-shadow: 0 1px 5px rgba(0,0,0,0.15);
              line-height: 1.5;
            ">
              <strong style="color:#111;">${words.length}</strong> place names in <strong style="color:#111;">${languageName}</strong> country
              <br/>
              <span style="color:#999;">Coordinates are approximate</span>
            </div>
          `;
          return div;
        },
      });
      new InfoControl({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;
      setTimeout(() => map?.invalidateSize(), 100);
    };

    initMap();

    return () => {
      if (map) {
        map.remove();
        map = null;
      }
      mapInstanceRef.current = null;
    };
  }, [words, languageCode, languageName]);

  return (
    <div
      ref={mapContainerRef}
      id={mapId}
      className="w-full"
      style={{
        height: 'calc(100vh - 120px)',
        minHeight: '600px',
        zIndex: 0,
        background: '#73acc3', // Ocean blue background while tiles load
      }}
    />
  );
}
