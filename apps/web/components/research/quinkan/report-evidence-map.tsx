"use client";

import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
  type ErrorEvent as MapLibreErrorEvent,
  type LngLatBoundsLike,
  type MapMouseEvent,
} from "maplibre-gl";
import type {Feature, FeatureCollection, Polygon} from "geojson";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {ReportMapPayload} from "@/lib/research/quinkan/report-map-types";

const CAVE_COLOR = "#753bbd";
const TRAINING_COLOR = "#3d7f0e";
const CAMP_COLOR = "#137fbb";
const BAND_RAMP: readonly [number, string, number, string] = [0.9875, "#f7d9a4", 1, "#7c4a00"];
const RING_RADII_METRES = [100, 250, 500, 1000] as const;
const METRES_PER_DEGREE = 111_320;

type MapStatus = {state: "loading"} | {state: "error"; message: string} | {state: "ready"; payload: ReportMapPayload};

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function squareAround(longitude: number, latitude: number, halfMetres: number): Polygon {
  const dLat = halfMetres / METRES_PER_DEGREE;
  const dLon = halfMetres / (METRES_PER_DEGREE * Math.cos((latitude * Math.PI) / 180));
  return {
    type: "Polygon",
    coordinates: [[
      [longitude - dLon, latitude - dLat],
      [longitude + dLon, latitude - dLat],
      [longitude + dLon, latitude + dLat],
      [longitude - dLon, latitude + dLat],
      [longitude - dLon, latitude - dLat],
    ]],
  };
}

function circleAround(longitude: number, latitude: number, radiusMetres: number, steps = 96): Polygon {
  const dLat = radiusMetres / METRES_PER_DEGREE;
  const dLon = radiusMetres / (METRES_PER_DEGREE * Math.cos((latitude * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    ring.push([longitude + Math.cos(angle) * dLon, latitude + Math.sin(angle) * dLat]);
  }
  return {type: "Polygon", coordinates: [ring]};
}

function formatRingLabel(radius: number): string {
  return radius >= 1000 ? `${radius / 1000} km` : `${radius} m`;
}

export function ReportEvidenceMap({batchId}: {batchId: string}) {
  const [status, setStatus] = useState<MapStatus>({state: "loading"});
  const [algorithmIndex, setAlgorithmIndex] = useState(0);
  const [showHillshade, setShowHillshade] = useState(true);
  const [showRings, setShowRings] = useState(true);
  const [showBand, setShowBand] = useState(true);
  const [showTraining, setShowTraining] = useState(true);
  const [basemapId, setBasemapId] = useState<string | null>(null);
  const [mapWarning, setMapWarning] = useState<string | null>(null);
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/research/quinkan/report-map/${encodeURIComponent(batchId)}`, {signal: controller.signal})
      .then(async (response) => {
        if (!response.ok) throw new Error(`verification failed (${response.status})`);
        return (await response.json()) as ReportMapPayload;
      })
      .then((payload) => setStatus({state: "ready", payload}))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus({state: "error", message: error instanceof Error ? error.message : "The verified releases could not be loaded."});
      });
    return () => controller.abort();
  }, [batchId]);

  const payload = status.state === "ready" ? status.payload : null;

  const caveCentroid = useMemo(() => {
    if (!payload || payload.caves.length === 0) return null;
    const longitude = payload.caves.reduce((sum, cave) => sum + cave.longitude, 0) / payload.caves.length;
    const latitude = payload.caves.reduce((sum, cave) => sum + cave.latitude, 0) / payload.caves.length;
    return {longitude, latitude};
  }, [payload]);

  const clusterBounds = useMemo<LngLatBoundsLike | null>(() => {
    if (!payload || payload.caves.length === 0) return null;
    const paddingMetres = 900;
    const longitudes = payload.caves.map((cave) => cave.longitude);
    const latitudes = payload.caves.map((cave) => cave.latitude);
    const midLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
    const dLat = paddingMetres / METRES_PER_DEGREE;
    const dLon = paddingMetres / (METRES_PER_DEGREE * Math.cos((midLatitude * Math.PI) / 180));
    return [
      [Math.min(...longitudes) - dLon, Math.min(...latitudes) - dLat],
      [Math.max(...longitudes) + dLon, Math.max(...latitudes) + dLat],
    ];
  }, [payload]);

  const frameBounds = useMemo<LngLatBoundsLike | null>(() => {
    if (!payload) return null;
    return [
      [payload.bounds.west, payload.bounds.south],
      [payload.bounds.east, payload.bounds.north],
    ];
  }, [payload]);

  const bandGeoJson = useMemo<FeatureCollection | null>(() => {
    if (!payload) return null;
    const half = payload.regional.resolutionMetres / 2;
    const features: Feature[] = payload.frozenBand.map((row, index) => {
      const [longitude, latitude, ...ranks] = row;
      const properties: Record<string, number | string> = {featureId: `cell-${index}`};
      ranks.forEach((rank, rankIndex) => {
        properties[`r${rankIndex}`] = rank;
      });
      return {type: "Feature", id: index, geometry: squareAround(longitude, latitude, half), properties};
    });
    return {type: "FeatureCollection", features};
  }, [payload]);

  const bandCentresGeoJson = useMemo<FeatureCollection | null>(() => {
    if (!payload) return null;
    return {
      type: "FeatureCollection",
      features: payload.frozenBand.map((row, index) => {
        const [longitude, latitude, ...ranks] = row;
        const properties: Record<string, number | string> = {featureId: `cell-${index}`};
        ranks.forEach((rank, rankIndex) => {
          properties[`r${rankIndex}`] = rank;
        });
        return {type: "Feature", id: index, geometry: {type: "Point", coordinates: [longitude, latitude]}, properties};
      }),
    };
  }, [payload]);

  const ringsGeoJson = useMemo<{lines: FeatureCollection; labels: FeatureCollection} | null>(() => {
    if (!caveCentroid) return null;
    const lines: Feature[] = [];
    const labels: Feature[] = [];
    for (const radius of RING_RADII_METRES) {
      lines.push({type: "Feature", properties: {radius}, geometry: circleAround(caveCentroid.longitude, caveCentroid.latitude, radius)});
      labels.push({
        type: "Feature",
        properties: {label: formatRingLabel(radius)},
        geometry: {
          type: "Point",
          coordinates: [caveCentroid.longitude, caveCentroid.latitude + radius / METRES_PER_DEGREE],
        },
      });
    }
    return {lines: {type: "FeatureCollection", features: lines}, labels: {type: "FeatureCollection", features: labels}};
  }, [caveCentroid]);

  const cavesGeoJson = useMemo<FeatureCollection | null>(() => {
    if (!payload) return null;
    return {
      type: "FeatureCollection",
      features: payload.caves.map((cave) => ({
        type: "Feature",
        properties: {kind: "cave", id: cave.id, name: cave.workingName, attestation: cave.attestation},
        geometry: {type: "Point", coordinates: [cave.longitude, cave.latitude]},
      })),
    };
  }, [payload]);

  const observationsGeoJson = useMemo<FeatureCollection | null>(() => {
    if (!payload) return null;
    return {
      type: "FeatureCollection",
      features: payload.frozenObservations.map((observation) => ({
        type: "Feature",
        properties: {kind: observation.role, id: observation.id, name: observation.workingName},
        geometry: {type: "Point", coordinates: [observation.longitude, observation.latitude]},
      })),
    };
  }, [payload]);

  const censoredCounts = useMemo(() => {
    if (!payload) return [];
    return payload.regional.algorithms.map((_, index) =>
      payload.frozenBand.filter((row) => (row[2 + index] ?? -1) >= payload.regional.minimumPublishedPercentile).length,
    );
  }, [payload]);

  const reducedMotion = useCallback(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const fitCluster = useCallback(() => {
    if (mapRef.current && clusterBounds) {
      mapRef.current.fitBounds(clusterBounds, {padding: 24, duration: reducedMotion() ? 0 : 650});
    }
  }, [clusterBounds, reducedMotion]);

  const fitFrame = useCallback(() => {
    if (mapRef.current && frameBounds) {
      mapRef.current.fitBounds(frameBounds, {padding: 28, duration: reducedMotion() ? 0 : 650});
    }
  }, [frameBounds, reducedMotion]);

  const installLayers = useCallback((map: MapLibreMap) => {
    if (!payload || !bandGeoJson || !cavesGeoJson || !observationsGeoJson) return;
    const firstSymbolLayer = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;

    if (payload.hillshadeAsset && !map.getSource("frozen-hillshade")) {
      map.addSource("frozen-hillshade", {
        type: "image",
        url: payload.hillshadeAsset.url,
        coordinates: payload.imageCorners as [[number, number], [number, number], [number, number], [number, number]],
      });
      map.addLayer(
        {id: "frozen-hillshade", type: "raster", source: "frozen-hillshade", paint: {"raster-opacity": 0.62}},
        firstSymbolLayer,
      );
    }

    if (!map.getSource("frozen-band")) map.addSource("frozen-band", {type: "geojson", data: bandGeoJson});
    if (!map.getSource("frozen-band-centres")) map.addSource("frozen-band-centres", {type: "geojson", data: bandCentresGeoJson ?? bandGeoJson});
    if (!map.getLayer("frozen-band-fill")) {
      map.addLayer(
        {
          id: "frozen-band-fill",
          type: "fill",
          source: "frozen-band",
          minzoom: 12,
          paint: {
            "fill-color": ["interpolate", ["linear"], ["get", "r0"], ...BAND_RAMP] as never,
            "fill-opacity": 0.78,
            "fill-outline-color": "rgba(122, 74, 0, 0.35)",
          },
        },
        firstSymbolLayer,
      );
    }
    if (!map.getLayer("frozen-band-dots")) {
      // Below zoom 12 a 90 m cell is under a pixel wide; enlarged dots keep the
      // published band honestly visible at frame scale.
      map.addLayer(
        {
          id: "frozen-band-dots",
          type: "circle",
          source: "frozen-band-centres",
          maxzoom: 12,
          paint: {
            "circle-color": ["interpolate", ["linear"], ["get", "r0"], ...BAND_RAMP] as never,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 1.5, 10, 2.2, 12, 3.2] as never,
            "circle-opacity": 0.85,
          },
        },
        firstSymbolLayer,
      );
    }

    if (ringsGeoJson) {
      if (!map.getSource("cave-rings")) map.addSource("cave-rings", {type: "geojson", data: ringsGeoJson.lines});
      if (!map.getSource("cave-ring-labels")) map.addSource("cave-ring-labels", {type: "geojson", data: ringsGeoJson.labels});
      if (!map.getLayer("cave-rings-line")) {
        map.addLayer({
          id: "cave-rings-line",
          type: "line",
          source: "cave-rings",
          paint: {"line-color": "#3c4642", "line-width": 1.1, "line-dasharray": [2.4, 2.2], "line-opacity": 0.75},
        });
      }
      if (!map.getLayer("cave-rings-text")) {
        map.addLayer({
          id: "cave-rings-text",
          type: "symbol",
          source: "cave-ring-labels",
          layout: {
            "text-field": ["get", "label"],
            "text-size": 11,
            "text-font": ["Noto Sans Regular"],
            "text-anchor": "bottom",
            "text-offset": [0, -0.15],
          },
          paint: {"text-color": "#3c4642", "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.4},
        });
      }
    }

    if (!map.getSource("frozen-observations")) map.addSource("frozen-observations", {type: "geojson", data: observationsGeoJson});
    if (!map.getLayer("frozen-observations-points")) {
      map.addLayer({
        id: "frozen-observations-points",
        type: "circle",
        source: "frozen-observations",
        paint: {
          "circle-color": ["match", ["get", "kind"], "camp", CAMP_COLOR, TRAINING_COLOR] as never,
          "circle-radius": 5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.6,
        },
      });
      map.addLayer({
        id: "frozen-observations-labels",
        type: "symbol",
        source: "frozen-observations",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
          "text-anchor": "top",
          "text-offset": [0, 0.8],
          "text-optional": true,
        },
        paint: {"text-color": "#2c3b1a", "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.4},
      });
    }

    if (!map.getSource("batch-caves")) map.addSource("batch-caves", {type: "geojson", data: cavesGeoJson});
    if (!map.getLayer("batch-caves-points")) {
      map.addLayer({
        id: "batch-caves-points",
        type: "circle",
        source: "batch-caves",
        paint: {
          "circle-color": CAVE_COLOR,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5.5, 13, 8.5] as never,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.4,
        },
      });
      map.addLayer({
        id: "batch-caves-labels",
        type: "symbol",
        source: "batch-caves",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-font": ["Noto Sans Bold"],
          "text-anchor": "top",
          "text-offset": [0, 0.9],
        },
        paint: {"text-color": "#4b2483", "text-halo-color": "rgba(255,255,255,0.94)", "text-halo-width": 1.6},
      });
    }
  }, [payload, bandGeoJson, bandCentresGeoJson, cavesGeoJson, observationsGeoJson, ringsGeoJson]);

  useEffect(() => {
    if (!payload || !mapNode.current || mapRef.current) return;
    setWorkerUrl("/api/admin/research/quinkan/static/maplibre-gl-worker.mjs");
    const initialBasemap = payload.basemaps.find((basemap) => basemap.id === "positron") ?? payload.basemaps[0];
    if (!initialBasemap) return;
    setBasemapId(initialBasemap.id);
    const map = new MapLibreMap({
      container: mapNode.current,
      style: initialBasemap.styleUrl,
      bounds: (clusterBounds ?? frameBounds) as LngLatBoundsLike,
      fitBoundsOptions: {padding: 24, duration: 0},
      minZoom: 6,
      maxZoom: 17,
      attributionControl: false,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({showCompass: true}), "top-right");
    map.addControl(new ScaleControl({unit: "metric", maxWidth: 120}), "bottom-left");
    map.addControl(new AttributionControl({compact: true}), "bottom-right");
    map.on("style.load", () => installLayers(map));
    map.on("error", (event: MapLibreErrorEvent) => {
      if (!map.loaded()) setMapWarning(event.error?.message ?? "Basemap tiles could not be loaded.");
    });
    map.on("click", (event: MapMouseEvent) => {
      const clickable = ["batch-caves-points", "frozen-observations-points", "frozen-band-fill", "frozen-band-dots"].filter((id) => map.getLayer(id));
      const feature = map.queryRenderedFeatures(event.point, {layers: clickable})[0];
      if (!feature) return;
      popupRef.current?.remove();
      const popup = new Popup({closeButton: true, maxWidth: "300px", className: "emapPopup"});
      if (feature.layer.id === "batch-caves-points") {
        const name = String(feature.properties?.name ?? "Cave");
        const attestation = String(feature.properties?.attestation ?? "");
        popup.setHTML(
          `<strong>${escapeHtml(name)}</strong><span>Confirmed cave · recorded in this batch</span><p>${escapeHtml(attestation)}</p>`,
        );
      } else if (feature.layer.id === "frozen-observations-points") {
        const name = String(feature.properties?.name ?? "Observation");
        const kind = String(feature.properties?.kind ?? "training");
        popup.setHTML(
          `<strong>${escapeHtml(name)}</strong><span>${kind === "camp" ? "Expedition camp · orientation only, excluded from training" : "Prior observation · the frozen model trained on this point"}</span>`,
        );
      } else {
        const properties = feature.properties as Record<string, unknown>;
        const rows = (payload?.regional.algorithms ?? [])
          .map((algorithm, index) => {
            const rank = Number(properties[`r${index}`]);
            const shown = rank >= 0 ? `${(rank * 100).toFixed(2)}%` : "not released";
            return `<div><dt>${escapeHtml(algorithm.title)}</dt><dd>${shown}</dd></div>`;
          })
          .join("");
        popup.setHTML(
          `<strong>Frozen 90 m proposal cell</strong><span>Rank percentile under each frozen algorithm</span><dl>${rows}</dl><p>Rank, not probability. Marked before the caves in this batch were recorded.</p>`,
        );
      }
      popup.setLngLat(event.lngLat).addTo(map);
      popupRef.current = popup;
    });
    map.on("mousemove", (event: MapMouseEvent) => {
      const clickable = ["batch-caves-points", "frozen-observations-points", "frozen-band-fill", "frozen-band-dots"].filter((id) => map.getLayer(id));
      const hovered = map.queryRenderedFeatures(event.point, {layers: clickable}).length > 0;
      map.getCanvas().style.cursor = hovered ? "pointer" : "";
    });
    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // The map boots once per loaded payload; installLayers re-runs via style.load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !payload) return;
    const apply = () => {
      const property = `r${algorithmIndex}`;
      const rampExpression = ["interpolate", ["linear"], ["get", property], ...BAND_RAMP] as never;
      const bandFilter = algorithmIndex === 0 ? null : ([">=", ["get", property], payload.regional.minimumPublishedPercentile] as never);
      if (map.getLayer("frozen-band-fill")) {
        map.setPaintProperty("frozen-band-fill", "fill-color", rampExpression);
        map.setFilter("frozen-band-fill", bandFilter);
        map.setLayoutProperty("frozen-band-fill", "visibility", showBand ? "visible" : "none");
      }
      if (map.getLayer("frozen-band-dots")) {
        map.setPaintProperty("frozen-band-dots", "circle-color", rampExpression);
        map.setFilter("frozen-band-dots", bandFilter);
        map.setLayoutProperty("frozen-band-dots", "visibility", showBand ? "visible" : "none");
      }
      if (map.getLayer("frozen-hillshade")) map.setLayoutProperty("frozen-hillshade", "visibility", showHillshade ? "visible" : "none");
      for (const layerId of ["cave-rings-line", "cave-rings-text"]) {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", showRings ? "visible" : "none");
      }
      for (const layerId of ["frozen-observations-points", "frozen-observations-labels"]) {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", showTraining ? "visible" : "none");
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("styledata", apply);
  }, [payload, algorithmIndex, showBand, showHillshade, showRings, showTraining]);

  const switchBasemap = useCallback((nextId: string) => {
    const map = mapRef.current;
    if (!map || !payload) return;
    const next = payload.basemaps.find((basemap) => basemap.id === nextId);
    if (!next) return;
    setBasemapId(nextId);
    map.setStyle(next.styleUrl, {diff: false});
  }, [payload]);

  if (status.state === "loading") {
    return (
      <div className="emapShell emapPending" role="status">
        <div className="emapSkeleton" aria-hidden="true" />
        <p>Verifying the frozen baseline release and the approved location disclosure…</p>
      </div>
    );
  }

  if (status.state === "error") {
    return (
      <div className="emapShell emapFailure" role="alert">
        <strong>The evidence map stayed closed.</strong>
        <p>
          This map only renders from hash-verified, human-approved releases. Verification failed, so nothing was drawn.
          ({status.message})
        </p>
      </div>
    );
  }

  const {caves, regional, approvals, baselineReleaseId, baselineWorkspaceSha256} = status.payload;
  const algorithmLabels = ["Field-conditioned", "Terrain–geology", "Hydrogeomorphic"];

  return (
    <figure className="emapShell">
      <div className="emapToolbar">
        <div className="emapSegmented" role="radiogroup" aria-label="Frozen algorithm shown on the map">
          {regional.algorithms.map((algorithm, index) => (
            <button
              key={algorithm.modelId}
              type="button"
              role="radio"
              aria-checked={algorithmIndex === index}
              title={algorithm.title}
              onClick={() => setAlgorithmIndex(index)}
            >
              {algorithmLabels[index] ?? algorithm.title}
            </button>
          ))}
        </div>
        <div className="emapViewButtons">
          {caves.length > 0 ? <button type="button" onClick={fitCluster}>Cave cluster</button> : null}
          <button type="button" onClick={fitFrame}>Whole study frame</button>
          <label className="emapBasemap">
            <span>Base</span>
            <select value={basemapId ?? ""} onChange={(event) => switchBasemap(event.target.value)}>
              {status.payload.basemaps.map((basemap) => (
                <option key={basemap.id} value={basemap.id}>{basemap.title}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="emapToggles">
          <label><input type="checkbox" checked={showBand} onChange={() => setShowBand((value) => !value)} /> Frozen band</label>
          <label><input type="checkbox" checked={showHillshade} onChange={() => setShowHillshade((value) => !value)} /> Hillshade</label>
          <label><input type="checkbox" checked={showRings} onChange={() => setShowRings((value) => !value)} /> Range rings</label>
          <label><input type="checkbox" checked={showTraining} onChange={() => setShowTraining((value) => !value)} /> Training points</label>
        </div>
      </div>

      <div className="emapCanvasWrap">
        <div ref={mapNode} className="emapCanvas" aria-label="Map of the four cave locations over the frozen prediction band" />
        {mapWarning ? <div className="emapTileWarning" role="alert">{mapWarning}</div> : null}
      </div>

      {algorithmIndex > 0 ? (
        <p className="emapCensorNote" role="note">
          Censored view: only the {censoredCounts[algorithmIndex]?.toLocaleString("en-AU")} cells of this model&rsquo;s own top band
          that overlap the published field-conditioned band were released, so this comparison is unfair to it by construction.
        </p>
      ) : null}

      <div className="emapLegend" aria-label="Map legend">
        <span><i className="emapSwatchCave" aria-hidden="true" /> Cave found in this batch</span>
        <span><i className="emapSwatchRamp" aria-hidden="true" /> Frozen 90 m proposal cell · darker = higher rank</span>
        <span><i className="emapSwatchTraining" aria-hidden="true" /> Prior observation the model trained on</span>
        <span><i className="emapSwatchCamp" aria-hidden="true" /> Expedition camp</span>
        <span><i className="emapSwatchRing" aria-hidden="true" /> Distance from cluster centre</span>
      </div>

      <figcaption className="emapCaption">
        <p>
          Every amber cell was published in immutable release <code>{baselineReleaseId}</code> before these caves were recorded;
          this page re-verifies those bytes against the report&rsquo;s frozen hash <code>{baselineWorkspaceSha256.slice(0, 12)}…</code> on
          every request. Cave coordinates appear under the Traditional Owner–approved location disclosure recorded in{" "}
          <code>{approvals.current.authorityRecordId}</code>.
        </p>
        <p>At wide zooms each 90 m cell is drawn as an enlarged dot so the published band stays visible; zoom in past 1:70,000 to see cells at their true size.</p>
        <p className="emapBoundary">{status.payload.warning}</p>
      </figcaption>
    </figure>
  );
}
