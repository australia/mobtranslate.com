'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';

interface LocationMapProps {
  latitude: number;
  longitude: number;
  word: string;
  locationDescription?: string;
}

export function LocationMap({ latitude, longitude, word, locationDescription }: LocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const [mapId] = useState(() => `map-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Prevent double-init from React strict mode
    const container = mapContainerRef.current;
    if ((container as any)._leaflet_id) {
      return;
    }

    let map: LeafletMap | null = null;

    const initMap = async () => {
      const L = (await import('leaflet')).default;

      // Inject Leaflet CSS if not already present
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);
      }

      // Double-check container is still clean after async import
      if ((container as any)._leaflet_id) return;

      map = L.map(container, {
        scrollWheelZoom: false,
        zoomControl: true,
      }).setView([latitude, longitude], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const icon = L.divIcon({
        className: 'custom-map-marker',
        html: `<div style="
          width: 28px; height: 28px;
          background: #2563eb;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        "></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -18],
      });

      const marker = L.marker([latitude, longitude], { icon }).addTo(map);

      const popupContent = locationDescription
        ? `<div style="font-family: system-ui, sans-serif;">
            <strong style="font-size: 14px;">${word}</strong>
            <br/>
            <span style="font-size: 12px; color: #555;">${locationDescription}</span>
           </div>`
        : `<strong style="font-family: system-ui, sans-serif; font-size: 14px;">${word}</strong>`;

      marker.bindPopup(popupContent).openPopup();

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
  }, [latitude, longitude, word, locationDescription]);

  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        Location
      </h4>
      <div
        ref={mapContainerRef}
        id={mapId}
        className="w-full h-[300px] rounded-lg overflow-hidden border"
        style={{ zIndex: 0 }}
      />
      <p className="text-xs text-muted-foreground mt-1.5">
        Approximate location: {Math.abs(latitude).toFixed(3)}&deg;{latitude < 0 ? 'S' : 'N'},{' '}
        {Math.abs(longitude).toFixed(3)}&deg;{longitude < 0 ? 'W' : 'E'}
      </p>
    </div>
  );
}
