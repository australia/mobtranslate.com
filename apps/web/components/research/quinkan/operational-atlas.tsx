"use client";

import {
  AttributionControl,
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type ErrorEvent as MapLibreErrorEvent,
  type MapMouseEvent,
} from "maplibre-gl";
import type {Feature, FeatureCollection, MultiPolygon, Polygon} from "geojson";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {
  AlgorithmResult,
  ContextAtlas,
  FieldModelValidation,
  FieldObservation,
  KnownLocation,
  OperationalWorkspace,
  ObservationProcessDetail,
  ProposalDetail,
  ProposalMarker,
  RasterOverlay,
  WorkspaceResponse,
} from "@/lib/research/quinkan/workspace-types";
import {thinByMinimumSpacing} from "@/lib/research/quinkan/spatial-thinning";
import {
  GoogleAtlasMap,
  type GoogleAtlasHandle,
  type GoogleMapType,
  type GoogleReferenceLayers,
  type MeasurementMode,
} from "@/components/research/quinkan/google-atlas-map";

type LayerSettings = Readonly<{
  known: boolean;
  camp: boolean;
  field: boolean;
  regional: boolean;
  highResolution: boolean;
  shortlist: boolean;
  heritage: boolean;
  projects: boolean;
  tiles: boolean;
  fieldReference: boolean;
  nativeTitle: boolean;
  photos: boolean;
}>;
type ViewMode = "plan" | "terrain" | "three-dimensional";
type MapEngine = "google" | "atlas";
type NativeTitleProperties = Readonly<{
  OBJECTID: number;
  Tribunal_ID: string;
  Name: string;
  FC_No: string;
  FC_Name: string;
  Determination_Date: number | null;
  NNTR_Registration_Date: number | null;
  Determined_Method: string;
  Determination_Type: string;
  Determined_Outcome: string;
  RNTBC_Name: string | null;
  Related_NTDA: string | null;
  Area_Sqkm: number;
  Date_Currency: number | null;
  NNTT_Seq_No: string;
  Linked_File_No: string | null;
  Jurisdiction: string;
  Overlap: string | null;
  Date_extracted: number | null;
  Claimant_Type: string;
}>;
type NativeTitleFeature = Feature<Polygon | MultiPolygon, NativeTitleProperties>;
type NativeTitleCollection = FeatureCollection<Polygon | MultiPolygon, NativeTitleProperties>;
type Selection =
  | Readonly<{kind: "known"; location: KnownLocation}>
  | Readonly<{kind: "photo"; photo: Readonly<{title: string; thumbUrl: string; pageUrl: string; license: string; author: string; source: string; observedOn?: string}>}>
  | Readonly<{kind: "field"; observation: FieldObservation}>
  | Readonly<{kind: "native-title"; determination: NativeTitleProperties}>
  | Readonly<{
      kind: "proposal";
      summary: ProposalMarker;
      detail: ProposalDetail | null;
      loading: boolean;
      error: string | null;
    }>;

const formatter = new Intl.NumberFormat("en-AU");
const percentFormatter = new Intl.NumberFormat("en-AU", {minimumFractionDigits: 1, maximumFractionDigits: 2});
const numberFormatter = new Intl.NumberFormat("en-AU", {maximumFractionDigits: 3});
const dateFormatter = new Intl.DateTimeFormat("en-AU", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"});
const featuredLandmarkId = "osm-jowalbinna-camp";
const terrainSourceId = "global-terrain-dem";
const mapReferenceBaseUrl = "/api/admin/research/quinkan/static/map-data/v1-20260811";
const nativeTitleSourceUrl = "https://services2.arcgis.com/rzk7fNEt0xoEp3cX/arcgis/rest/services/NNTT_Custodial_AGOL/FeatureServer/6";
const qldRoadsSourceUrl = "https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Transportation/RoadsAndTracks/MapServer/10";
const qldWatercoursesSourceUrl = "https://spatial-gis.information.qld.gov.au/arcgis/rest/services/InlandWaters/WaterCoursesAndBodies/MapServer/33";
const satelliteBasemap = {
  id: "satellite",
  title: "Satellite",
  styleUrl: "/api/admin/research/quinkan/static/map-styles/satellite.json",
  attribution: "Esri, Maxar, Earthstar Geographics",
} as const;
// Queensland Government public imagery services (CC BY 4.0), fetched tile-by-tile
// by the viewer's browser via ImageServer exportImage — keyless and free.
const qldAerialBasemap = {
  id: "qldaerial",
  title: "Qld Aerial",
  styleUrl: "/api/admin/research/quinkan/static/map-styles/qld-aerial.json",
  attribution: "© State of Queensland CC BY 4.0",
} as const;
const qldSatelliteBasemap = {
  id: "qldsat",
  title: "Qld Sat",
  styleUrl: "/api/admin/research/quinkan/static/map-styles/qld-satellite.json",
  attribution: "© State of Queensland CC BY 4.0",
} as const;
const qldHistoricalBasemap = {
  id: "qldhist",
  title: "1950s Aerial (partial coverage)",
  styleUrl: "/api/admin/research/quinkan/static/map-styles/qld-historical.json",
  attribution: "© State of Queensland CC BY 4.0 — earliest aerial photography",
} as const;
const collectionBasemaps = [
  {id: "worldtopo", title: "World Topo", styleUrl: "/api/admin/research/quinkan/static/map-styles/world-topo.json", attribution: "Esri"},
  {id: "opentopo", title: "OpenTopo", styleUrl: "/api/admin/research/quinkan/static/map-styles/opentopo.json", attribution: "OpenTopoMap CC-BY-SA"},
  {id: "natgeo", title: "NatGeo", styleUrl: "/api/admin/research/quinkan/static/map-styles/natgeo.json", attribution: "National Geographic, Esri"},
  {id: "fielddark", title: "Field Dark", styleUrl: "/api/admin/research/quinkan/static/map-styles/field-dark.json", attribution: "OSM contributors © CARTO"},
  {id: "s2cloudless", title: "Sentinel-2 Cloudless 2024", styleUrl: "/api/admin/research/quinkan/static/map-styles/s2-cloudless.json", attribution: "EOX CC-BY-NC-SA"},
  {id: "relief", title: "Shaded Relief", styleUrl: "/api/admin/research/quinkan/static/map-styles/relief.json", attribution: "Esri, USGS"},
  {id: "geology", title: "Geology", styleUrl: "/api/admin/research/quinkan/static/map-styles/geology.json", attribution: "Geoscience Australia CC BY 4.0"},
] as const;
const basemapGroups: Record<string, string> = {
  satellite: "Imagery", qldaerial: "Imagery", qldsat: "Imagery", s2cloudless: "Imagery",
  qldhist: "Historical",
  relief: "Terrain & geology", geology: "Terrain & geology",
  worldtopo: "Work maps", opentopo: "Work maps", natgeo: "Work maps", fielddark: "Work maps",
};
const basemapStorageKey = "laura-atlas-basemap";

function parseCoordinateInput(text: string): [number, number] | null {
  const trimmed = text.trim();
  const dms = (part: string): number | null => {
    const match = /^(\d+)[*°](\d+)[`'′]([\d.]+)[″"]?\s*([SENW]?)$/.exec(part.trim());
    if (!match) return null;
    const value = Number(match[1]) + Number(match[2]) / 60 + Number(match[3]) / 3600;
    return match[4] === "S" || match[4] === "W" ? -value : value;
  };
  const halves = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  if (halves.length === 2) {
    const lat = dms(halves[0]) ?? (Number.isFinite(Number(halves[0])) ? Number(halves[0]) : null);
    const lon = dms(halves[1]) ?? (Number.isFinite(Number(halves[1])) ? Number(halves[1]) : null);
    if (lat !== null && lon !== null) return [lat, lon];
  }
  const spaced = trimmed.split(/\s+/);
  if (spaced.length === 2 && spaced.every((part) => Number.isFinite(Number(part)))) {
    return [Number(spaced[0]), Number(spaced[1])];
  }
  return null;
}

function haversineMetres(a: [number, number], b: [number, number]): number {
  const radius = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function installFieldToolLayers(map: MapLibreMap) {
  if (!map.getSource("goto-point")) {
    map.addSource("goto-point", {type: "geojson", data: {type: "FeatureCollection", features: []}});
    map.addLayer({
      id: "goto-point", type: "circle", source: "goto-point",
      paint: {"circle-radius": 9, "circle-color": "#ffd166", "circle-stroke-color": "#15201d", "circle-stroke-width": 2.5},
    });
  }
  if (!map.getSource("measure-line")) {
    map.addSource("measure-line", {type: "geojson", data: {type: "FeatureCollection", features: []}});
    map.addLayer({
      id: "measure-line", type: "line", source: "measure-line",
      paint: {"line-color": "#ffd166", "line-width": 2.5, "line-dasharray": [1.5, 1.2]},
    });
    map.addLayer({
      id: "measure-points", type: "circle", source: "measure-line",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {"circle-radius": 4.5, "circle-color": "#ffd166", "circle-stroke-color": "#15201d", "circle-stroke-width": 1.5},
    });
  }
}
const clickLayerIds = [
  "photo-points",
  "expedition-camp-point",
  "field-observation-points",
  "jowalbinna-point",
  "known-points",
  "native-title-fill",
  "regional-proposals",
  "high-resolution-proposals",
  "field-shortlist",
];
const contextLayerIds = {
  public_heritage_acquisition_frame: ["context-heritage-fill", "context-heritage-line"],
  qld_elevation_project_coverage: ["context-projects-fill", "context-projects-line"],
  qld_elevation_tile_coverage: ["context-tiles-line"],
} as const;

export function OperationalAtlas({googleMapsApiKey}: Readonly<{googleMapsApiKey?: string}>) {
  const [payload, setPayload] = useState<WorkspaceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/research/quinkan/workspace", {signal: controller.signal, cache: "no-store"})
      .then(async (response) => {
        if (!response.ok) throw new Error(`Verified map release returned ${response.status}.`);
        return response.json() as Promise<WorkspaceResponse>;
      })
      .then(setPayload)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "The verified map release could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  if (error) return <WorkspaceFailure message={error} />;
  if (!payload) return <WorkspaceLoading />;
  return <MapWorkspace data={payload} googleMapsApiKey={googleMapsApiKey} />;
}

function MapWorkspace({data, googleMapsApiKey}: Readonly<{data: WorkspaceResponse; googleMapsApiKey?: string}>) {
  const {workspace, contextAtlas} = data;
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const googleMapRef = useRef<GoogleAtlasHandle | null>(null);
  const proposalRequest = useRef<AbortController | null>(null);
  const [mapEngine, setMapEngine] = useState<MapEngine>(googleMapsApiKey ? "google" : "atlas");
  const [googleMapType, setGoogleMapType] = useState<GoogleMapType>("hybrid");
  const [googleReferenceLayers, setGoogleReferenceLayers] = useState<GoogleReferenceLayers>({traffic: false, transit: false, bicycling: false});
  const [googleStatus, setGoogleStatus] = useState<string | null>(googleMapsApiKey ? "Preparing Google Maps…" : null);
  const [basemapId, setBasemapId] = useState(workspace.basemaps[0]?.id ?? "");
  const [viewMode, setViewMode] = useState<ViewMode>("plan");
  const [terrainExaggeration, setTerrainExaggeration] = useState(1.45);
  const [gotoValue, setGotoValue] = useState("");
  const [gotoError, setGotoError] = useState<string | null>(null);
  const [clickedCoordinate, setClickedCoordinate] = useState<[number, number] | null>(null);
  const [coordinateCopied, setCoordinateCopied] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>("distance");
  const [measureTotalMetres, setMeasureTotalMetres] = useState<number | null>(null);
  const [measureAreaSquareMetres, setMeasureAreaSquareMetres] = useState<number | null>(null);
  const measureRef = useRef<{active: boolean; points: [number, number][]}>({active: false, points: []});
  const [gazetteer, setGazetteer] = useState<Array<{n: string; t: string; c: [number, number]}> | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [threshold, setThreshold] = useState(99);
  const [overlayOpacity, setOverlayOpacity] = useState(65);
  const [activeOverlays, setActiveOverlays] = useState(
    () => new Set(workspace.overlays.filter((overlay) => overlay.defaultVisible).map((overlay) => overlay.id)),
  );
  const [layers, setLayers] = useState<LayerSettings>({
    known: true,
    camp: true,
    field: true,
    regional: true,
    highResolution: true,
    shortlist: false,
    heritage: true,
    photos: true,
    projects: false,
    tiles: false,
    fieldReference: true,
    nativeTitle: false,
  });
  const [nativeTitles, setNativeTitles] = useState<NativeTitleCollection | null>(null);
  const [nativeTitleError, setNativeTitleError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [googleFailure, setGoogleFailure] = useState<string | null>(null);
  const settingsRef = useRef({threshold, overlayOpacity, activeOverlays, layers, viewMode});
  settingsRef.current = {threshold, overlayOpacity, activeOverlays, layers, viewMode};

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${mapReferenceBaseUrl}/native-title-determinations.geojson`, {signal: controller.signal})
      .then(async (response) => {
        if (!response.ok) throw new Error(`Native title layer returned ${response.status}.`);
        return response.json() as Promise<NativeTitleCollection>;
      })
      .then((collection) => {
        setNativeTitles(collection);
        setNativeTitleError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setNativeTitleError(caught instanceof Error ? caught.message : "Native title records could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  const basemaps = useMemo(
    () => [...workspace.basemaps, satelliteBasemap, qldAerialBasemap, qldSatelliteBasemap, qldHistoricalBasemap, ...collectionBasemaps],
    [workspace.basemaps],
  );
  const basemapsByGroup = useMemo(() => {
    const groups = new Map<string, Array<(typeof basemaps)[number]>>();
    for (const basemap of basemaps) {
      const group = basemapGroups[basemap.id] ?? "Work maps";
      const list = groups.get(group) ?? [];
      list.push(basemap);
      groups.set(group, list);
    }
    const order = ["Work maps", "Imagery", "Historical", "Terrain & geology"];
    return order.filter((group) => groups.has(group)).map((group) => [group, groups.get(group) ?? []] as const);
  }, [basemaps]);
  const jowalbinna = useMemo(
    () => workspace.knownLocations.find((location) => location.id === featuredLandmarkId),
    [workspace.knownLocations],
  );
  const expeditionCamp = useMemo(
    () => workspace.fieldObservations.find((observation) => observation.role === "camp"),
    [workspace.fieldObservations],
  );
  const foundToday = useMemo(
    () => workspace.fieldObservations.filter((observation) => observation.role !== "camp"),
    [workspace.fieldObservations],
  );

  const knownGeoJson = useMemo(() => pointsForKnown(workspace.knownLocations), [workspace.knownLocations]);
  const knownUncertaintyGeoJson = useMemo(
    () => uncertaintyAreasForKnown(workspace.knownLocations),
    [workspace.knownLocations],
  );
  const fieldGeoJson = useMemo(() => pointsForField(workspace.fieldObservations), [workspace.fieldObservations]);
  const regionalGeoJson = useMemo(
    () => pointsForProposals(workspace.proposals.filter((proposal) => proposal.collectionId === "regional")),
    [workspace.proposals],
  );
  const highResolutionGeoJson = useMemo(
    () => pointsForProposals(workspace.proposals.filter((proposal) => proposal.collectionId === "high-resolution")),
    [workspace.proposals],
  );
  // Spacing-thinned field shortlist: one target per locale, ranked purely by
  // the model. Independent of the confidence slider so the list is stable.
  const shortlistProposals = useMemo(
    () => thinByMinimumSpacing(
      workspace.proposals.filter((proposal) => proposal.collectionId === "regional"),
      300,
      60,
    ),
    [workspace.proposals],
  );
  const shortlistGeoJson = useMemo<FeatureCollection>(() => {
    const collection = pointsForProposals(shortlistProposals);
    return {
      ...collection,
      features: collection.features.map((feature, index) => ({
        ...feature,
        properties: {...feature.properties, shortlistRank: index + 1},
      })),
    };
  }, [shortlistProposals]);

  const openProposal = useCallback((summary: ProposalMarker) => {
    proposalRequest.current?.abort();
    const controller = new AbortController();
    proposalRequest.current = controller;
    setSelection({kind: "proposal", summary, detail: null, loading: true, error: null});
    setInspectorOpen(true);
    fetch(`/api/admin/research/quinkan/workspace/proposals/${encodeURIComponent(summary.id)}`, {signal: controller.signal})
      .then(async (response) => {
        if (!response.ok) throw new Error(`Algorithm record returned ${response.status}.`);
        return response.json() as Promise<ProposalDetail>;
      })
      .then((detail) => setSelection((current) =>
        current?.kind === "proposal" && current.summary.id === summary.id
          ? {...current, detail, loading: false}
          : current,
      ))
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setSelection((current) => current?.kind === "proposal" && current.summary.id === summary.id
          ? {...current, loading: false, error: caught instanceof Error ? caught.message : "Algorithm record unavailable."}
          : current);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/research/quinkan/static/map-data/gazetteer.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: {places?: Array<{n: string; t: string; c: [number, number]}>} | null) => {
        if (!cancelled && payload?.places) setGazetteer(payload.places);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mapEngine !== "atlas" || !mapNode.current || mapRef.current) return;
    setWorkerUrl("/api/admin/research/quinkan/static/maplibre-gl-worker.mjs");
    let storedId: string | null = null;
    try {
      storedId = window.localStorage.getItem(basemapStorageKey);
    } catch {
      storedId = null;
    }
    const stored = storedId ? basemaps.find((item) => item.id === storedId) : undefined;
    const initialBasemap = stored ?? workspace.basemaps[0];
    if (!initialBasemap) return;
    if (stored && stored.id !== basemapId) setBasemapId(stored.id);
    const map = new MapLibreMap({
      container: mapNode.current,
      style: initialBasemap.styleUrl,
      bounds: [[workspace.bounds.west, workspace.bounds.south], [workspace.bounds.east, workspace.bounds.north]],
      fitBoundsOptions: {padding: {top: 36, right: 60, bottom: 36, left: 60}, duration: 0},
      minZoom: 6,
      maxZoom: 18,
      attributionControl: false,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({showCompass: true, visualizePitch: true}), "bottom-right");
    map.addControl(new ScaleControl({unit: "metric", maxWidth: 130}), "bottom-left");
    map.addControl(new GeolocateControl({positionOptions: {enableHighAccuracy: true}, trackUserLocation: true, showAccuracyCircle: true}), "bottom-right");
    map.addControl(new AttributionControl({compact: true}), "bottom-right");

    const sync = () => {
      installOperationalLayers(map, workspace, contextAtlas, knownGeoJson, knownUncertaintyGeoJson, fieldGeoJson, regionalGeoJson, highResolutionGeoJson, shortlistGeoJson);
      installFieldToolLayers(map);
      applyMapSettings(map, workspace.overlays, settingsRef.current);
      setMapError(null);
    };
    map.on("style.load", sync);
    map.on("error", (event: MapLibreErrorEvent) => {
      if (!map.loaded()) setMapError(event.error?.message ?? "Basemap tiles could not be loaded.");
    });
    map.on("click", (event: MapMouseEvent) => {
      setClickedCoordinate([event.lngLat.lng, event.lngLat.lat]);
      setCoordinateCopied(false);
      if (measureRef.current.active) {
        measureRef.current.points.push([event.lngLat.lng, event.lngLat.lat]);
        const points = measureRef.current.points;
        const source = map.getSource("measure-line") as import("maplibre-gl").GeoJSONSource | undefined;
        source?.setData({
          type: "FeatureCollection",
          features: [
            ...(points.length >= 2 ? [{type: "Feature" as const, properties: {}, geometry: {type: "LineString" as const, coordinates: points}}] : []),
            ...points.map((point) => ({type: "Feature" as const, properties: {}, geometry: {type: "Point" as const, coordinates: point}})),
          ],
        });
        let total = 0;
        for (let index = 1; index < points.length; index += 1) total += haversineMetres(points[index - 1], points[index]);
        setMeasureTotalMetres(points.length >= 2 ? total : 0);
        return;
      }
      const visibleClickLayers = clickLayerIds.filter((id) => map.getLayer(id));
      if (visibleClickLayers.length === 0) return;
      const feature = map.queryRenderedFeatures(event.point, {layers: visibleClickLayers})[0];
      if (feature?.layer.id === "native-title-fill") {
        const determination = nativeTitleProperties(feature.properties);
        if (determination) {
          setSelection({kind: "native-title", determination});
          setInspectorOpen(true);
        }
        return;
      }
      if (feature?.layer.id === "photo-points") {
        const properties = feature.properties as {title?: string; thumbUrl?: string; pageUrl?: string; license?: string; author?: string; source?: string; observedOn?: string};
        if (properties.thumbUrl && properties.pageUrl) {
          setSelection({kind: "photo", photo: {
            title: properties.title ?? "Photo", thumbUrl: properties.thumbUrl, pageUrl: properties.pageUrl,
            license: properties.license ?? "", author: properties.author ?? "", source: properties.source ?? "", observedOn: properties.observedOn,
          }});
          setInspectorOpen(true);
        }
        return;
      }
      const id = feature?.properties?.id;
      const kind = feature?.properties?.kind;
      if (typeof id !== "string") return;
      if (kind === "known") {
        const location = workspace.knownLocations.find((item) => item.id === id);
        if (location) {
          setSelection({kind: "known", location});
          setInspectorOpen(true);
        }
      } else if (kind === "field") {
        const observation = workspace.fieldObservations.find((item) => item.id === id);
        if (observation) {
          setSelection({kind: "field", observation});
          setInspectorOpen(true);
        }
      } else if (kind === "proposal") {
        const proposal = workspace.proposals.find((item) => item.id === id);
        if (proposal) openProposal(proposal);
      }
    });
    map.on("mousemove", (event: MapMouseEvent) => {
      const visibleClickLayers = clickLayerIds.filter((id) => map.getLayer(id));
      map.getCanvas().style.cursor = visibleClickLayers.length > 0 && map.queryRenderedFeatures(event.point, {layers: visibleClickLayers}).length > 0 ? "pointer" : "";
    });
    return () => {
      proposalRequest.current?.abort();
      map.remove();
      mapRef.current = null;
    };
  }, [contextAtlas, fieldGeoJson, highResolutionGeoJson, knownGeoJson, knownUncertaintyGeoJson, mapEngine, openProposal, regionalGeoJson, shortlistGeoJson, workspace]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyMapSettings(map, workspace.overlays, {threshold, overlayOpacity, activeOverlays, layers, viewMode});
  }, [activeOverlays, layers, overlayOpacity, threshold, viewMode, workspace.overlays]);

  const filteredCounts = useMemo(() => {
    const minimum = threshold / 100;
    let regional = 0;
    let highResolution = 0;
    for (const proposal of workspace.proposals) {
      if (proposal.confidencePercentile < minimum) continue;
      if (proposal.collectionId === "regional") regional += 1;
      else highResolution += 1;
    }
    return {regional, highResolution};
  }, [threshold, workspace.proposals]);

  function switchBasemap(nextId: string) {
    const next = basemaps.find((item) => item.id === nextId);
    if (!next || next.id === basemapId) return;
    setBasemapId(nextId);
    try {
      window.localStorage.setItem(basemapStorageKey, nextId);
    } catch {
      // Private browsing: the preference just doesn't persist.
    }
    const map = mapRef.current;
    if (!map) return;
    map.setTerrain(null);
    map.setStyle(next.styleUrl, {diff: false});
  }

  function switchViewMode(nextMode: ViewMode) {
    setViewMode(nextMode);
    if (mapEngine === "google" && nextMode === "terrain") setGoogleMapType("terrain");
    if (mapEngine === "google" && nextMode === "plan" && googleMapType === "terrain") setGoogleMapType("hybrid");
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyMapView(map, nextMode, true, terrainExaggeration);
  }

  function changeExaggeration(next: number) {
    setTerrainExaggeration(next);
    const map = mapRef.current;
    if (map?.isStyleLoaded() && viewMode !== "plan") applyMapView(map, viewMode, false, next);
  }

  function focusJowalbinna() {
    if (!jowalbinna) return;
    if (mapEngine === "google") googleMapRef.current?.focus(jowalbinna.longitude, jowalbinna.latitude, 12.5);
    const map = mapRef.current;
    map?.easeTo({
      center: [jowalbinna.longitude, jowalbinna.latitude],
      zoom: Math.max(map.getZoom(), 12.5),
      pitch: viewMode === "three-dimensional" ? 67 : viewMode === "terrain" ? 36 : 0,
      duration: 700,
    });
    setSelection({kind: "known", location: jowalbinna});
    setInspectorOpen(true);
    setControlsOpen(false);
  }

  function focusCamp() {
    if (!expeditionCamp) return;
    if (mapEngine === "google") googleMapRef.current?.focus(expeditionCamp.longitude, expeditionCamp.latitude, 14.5);
    const map = mapRef.current;
    map?.easeTo({
      center: [expeditionCamp.longitude, expeditionCamp.latitude],
      zoom: Math.max(map.getZoom(), 14.5),
      pitch: viewMode === "three-dimensional" ? 67 : viewMode === "terrain" ? 36 : 0,
      duration: 700,
    });
    setSelection({kind: "field", observation: expeditionCamp});
    setInspectorOpen(true);
    setControlsOpen(false);
  }

  function fitRegion() {
    if (mapEngine === "google") {
      googleMapRef.current?.fitRegion();
      return;
    }
    mapRef.current?.fitBounds(
      [[workspace.bounds.west, workspace.bounds.south], [workspace.bounds.east, workspace.bounds.north]],
      {padding: {top: 40, right: 70, bottom: 40, left: 70}, duration: 550},
    );
  }

  function goToCoordinate() {
    const parsed = parseCoordinateInput(gotoValue);
    if (!parsed) {
      setGotoError("Could not read that. Use decimal \"lat, lon\" or DMS like 15°42′56.8″ S, 144°18′04.7″ E.");
      return;
    }
    let [lat, lon] = parsed;
    // Entries without a hemisphere letter are normalised south — everything in
    // this atlas is far south of the equator.
    if (lat > 10) lat = -lat;
    setGotoError(null);
    if (mapEngine === "google") {
      googleMapRef.current?.markCoordinate(lon, lat, 14);
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("goto-point") as import("maplibre-gl").GeoJSONSource | undefined;
    source?.setData({type: "FeatureCollection", features: [{type: "Feature", properties: {}, geometry: {type: "Point", coordinates: [lon, lat]}}]});
    map.flyTo({center: [lon, lat], zoom: Math.max(map.getZoom(), 14), duration: 900});
  }

  function toggleMeasure() {
    const next = !measuring;
    setMeasuring(next);
    setMeasureTotalMetres(null);
    setMeasureAreaSquareMetres(null);
    measureRef.current.active = next;
    if (!next || mapEngine === "google") return;
    measureRef.current.points = [];
    const source = mapRef.current?.getSource("measure-line") as import("maplibre-gl").GeoJSONSource | undefined;
    source?.setData({type: "FeatureCollection", features: []});
  }

  async function copyClickedCoordinate() {
    if (!clickedCoordinate) return;
    const text = `${clickedCoordinate[1].toFixed(6)}, ${clickedCoordinate[0].toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCoordinateCopied(true);
    } catch {
      setGotoValue(text);
    }
  }

  function downloadGpx() {
    const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const waypoints: string[] = [];
    for (const observation of workspace.fieldObservations) {
      waypoints.push(`  <wpt lat="${observation.latitude}" lon="${observation.longitude}"><name>${escape(observation.workingName ?? observation.id)}</name><desc>${escape(observation.role)}</desc><sym>Flag, Red</sym></wpt>`);
    }
    shortlistProposals.forEach((proposal, index) => {
      waypoints.push(`  <wpt lat="${proposal.latitude}" lon="${proposal.longitude}"><name>S${index + 1} ${(proposal.confidencePercentile * 100).toFixed(2)}%</name><desc>Field shortlist target ${index + 1}: highest-ranked proposals thinned to 300 m spacing, model rank only (unvalidated)</desc><sym>Pin, Blue</sym></wpt>`);
    });
    const shortlistIds = new Set(shortlistProposals.map((proposal) => proposal.id));
    const shown = workspace.proposals
      .filter((proposal) => proposal.confidencePercentile * 100 >= threshold && !shortlistIds.has(proposal.id))
      .sort((a, b) => b.confidencePercentile - a.confidencePercentile)
      .slice(0, 300);
    shown.forEach((proposal, index) => {
      waypoints.push(`  <wpt lat="${proposal.latitude}" lon="${proposal.longitude}"><name>P${index + 1} ${(proposal.confidencePercentile * 100).toFixed(2)}%</name><desc>${escape(proposal.collectionId)} survey-priority hypothesis (unvalidated)</desc><sym>Pin, Yellow</sym></wpt>`);
    });
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Laura Discovery Atlas" xmlns="http://www.topografix.com/GPX/1/1">\n${waypoints.join("\n")}\n</gpx>\n`;
    const blob = new Blob([gpx], {type: "application/gpx+xml"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `laura-atlas-${new Date().toISOString().slice(0, 10)}.gpx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const placeMatches = useMemo(() => {
    if (!gazetteer || placeQuery.trim().length < 2) return [];
    const query = placeQuery.trim().toLowerCase();
    return gazetteer.filter((place) => place.n.toLowerCase().includes(query)).slice(0, 8);
  }, [gazetteer, placeQuery]);

  function flyToPlace(place: {n: string; c: [number, number]}) {
    if (mapEngine === "google") {
      googleMapRef.current?.markCoordinate(place.c[0], place.c[1], 13);
      setPlaceQuery(place.n);
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("goto-point") as import("maplibre-gl").GeoJSONSource | undefined;
    source?.setData({type: "FeatureCollection", features: [{type: "Feature", properties: {}, geometry: {type: "Point", coordinates: place.c}}]});
    map.flyTo({center: place.c, zoom: Math.max(map.getZoom(), 13), duration: 900});
    setPlaceQuery(place.n);
  }

  function fitPublicSources() {
    if (workspace.knownLocations.length === 0) return;
    const longitudes = workspace.knownLocations.map((location) => location.longitude);
    const latitudes = workspace.knownLocations.map((location) => location.latitude);
    if (mapEngine === "google") {
      googleMapRef.current?.fitBounds(Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes));
      return;
    }
    mapRef.current?.fitBounds(
      [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]],
      {padding: {top: 55, right: 85, bottom: 55, left: 85}, duration: 550},
    );
  }

  function focusNativeTitle(feature: NativeTitleFeature) {
    const bounds = nativeTitleBounds(feature);
    if (mapEngine === "google") googleMapRef.current?.fitBounds(bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1], 11);
    mapRef.current?.fitBounds(bounds, {padding: {top: 70, right: 90, bottom: 70, left: 90}, duration: 650, maxZoom: 11});
    setSelection({kind: "native-title", determination: feature.properties});
    setInspectorOpen(true);
    setControlsOpen(false);
  }

  function toggleOverlay(id: string) {
    setActiveOverlays((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleLayer(key: keyof LayerSettings) {
    setLayers((current) => ({...current, [key]: !current[key]}));
  }

  function switchMapEngine(nextEngine: MapEngine) {
    if (nextEngine === "google" && !googleMapsApiKey) return;
    setMapError(null);
    if (nextEngine === "google") setGoogleFailure(null);
    setMeasuring(false);
    setMapEngine(nextEngine);
  }

  const handleGoogleMeasurement = useCallback((measurement: Readonly<{distanceMetres: number | null; areaSquareMetres: number | null}>) => {
    setMeasureTotalMetres(measurement.distanceMetres);
    setMeasureAreaSquareMetres(measurement.areaSquareMetres);
  }, []);

  const handleGoogleError = useCallback((message: string | null) => {
    if (!message) {
      setMapError(null);
      setGoogleFailure(null);
      return;
    }
    setGoogleFailure(`${message} The open atlas map has been restored automatically.`);
    setMapEngine("atlas");
  }, []);

  const measurementLabel = measuring
    ? measurementMode === "area"
      ? measureAreaSquareMetres && measureAreaSquareMetres > 0
        ? `${measureAreaSquareMetres >= 1_000_000 ? `${(measureAreaSquareMetres / 1_000_000).toFixed(2)} km²` : `${Math.round(measureAreaSquareMetres).toLocaleString("en-AU")} m²`} ✕`
        : "Click 3+ points…"
      : measureTotalMetres && measureTotalMetres > 0
        ? `${measureTotalMetres >= 1000 ? `${(measureTotalMetres / 1000).toFixed(2)} km` : `${Math.round(measureTotalMetres)} m`} ✕`
        : "Click points…"
    : "Measure";

  return (
    <div className="opsShell">
      <a className="skipLink" href="#ops-map">Skip to map</a>
      <header className="opsHeader">
        <a className="opsBrand" href="/admin/research/quinkan" aria-label="Laura discovery atlas home">
          <span className="opsBrandMark" aria-hidden="true">LQ</span>
          <span><strong>Laura Discovery Atlas</strong><small>Landscape evidence workspace</small></span>
        </a>
        <div className="opsHeaderStats" aria-label="Release summary">
          <span><b>{workspace.knownLocations.length}</b> public assertions</span>
          <span><b>{foundToday.length}</b> field finds</span>
          <span><b>{formatter.format(workspace.proposals.length)}</b> hypotheses</span>
          <span><b>{workspace.overlays.length}</b> overlays</span>
        </div>
        <div className="opsHeaderActions">
          <span className="opsRelease"><i aria-hidden="true" /> {workspace.releaseId}</span>
          <a href="/admin/research/quinkan/reports">Field reports</a>
          <a href="/admin/research/quinkan/datasets">Datasets</a>
          <a href="/admin/research/quinkan/algorithms">Algorithms</a>
          <a href="/admin/research/quinkan/evidence">Evidence index</a>
          <a href="/admin/research/quinkan/methodology">Methodology</a>
        </div>
      </header>

      <main className="opsMain">
        {mapEngine === "google" && googleMapsApiKey ? (
          <div id="ops-map" className="opsMap" aria-label="Interactive Google map of the public Laura–Quinkan atlas">
            <GoogleAtlasMap
              ref={googleMapRef}
              apiKey={googleMapsApiKey}
              workspace={workspace}
              contextAtlas={contextAtlas}
              knownGeoJson={knownGeoJson}
              knownUncertaintyGeoJson={knownUncertaintyGeoJson}
              fieldGeoJson={fieldGeoJson}
              regionalGeoJson={regionalGeoJson}
              highResolutionGeoJson={highResolutionGeoJson}
              shortlistGeoJson={shortlistGeoJson}
              nativeTitles={nativeTitles}
              layers={layers}
              threshold={threshold}
              overlayOpacity={overlayOpacity}
              activeOverlays={activeOverlays}
              mapType={googleMapType}
              referenceLayers={googleReferenceLayers}
              measuring={measuring}
              measurementMode={measurementMode}
              threeDimensional={viewMode === "three-dimensional"}
              onCoordinate={(coordinate) => { setClickedCoordinate(coordinate); setCoordinateCopied(false); }}
              onMeasurement={handleGoogleMeasurement}
              onKnown={(location) => { setSelection({kind: "known", location}); setInspectorOpen(true); }}
              onField={(observation) => { setSelection({kind: "field", observation}); setInspectorOpen(true); }}
              onProposal={openProposal}
              onNativeTitle={(determination) => { setSelection({kind: "native-title", determination}); setInspectorOpen(true); }}
              onPhoto={(photo) => { setSelection({kind: "photo", photo}); setInspectorOpen(true); }}
              onStatus={setGoogleStatus}
              onError={handleGoogleError}
            />
          </div>
        ) : (
          <div id="ops-map" ref={mapNode} className="opsMap" aria-label="Interactive Laura–Quinkan environmental and proposal map" />
        )}
        {googleFailure ? <div className="opsMapError" role="alert"><strong>Google Maps unavailable</strong>{googleFailure}</div> : mapError ? <div className="opsMapError" role="alert"><strong>Map tile warning</strong>{mapError}</div> : null}

        <div className="opsTopBar" role="toolbar" aria-label="Map controls">
          <div className="opsEngineSwitch" role="radiogroup" aria-label="Map engine">
            <button type="button" role="radio" aria-checked={mapEngine === "google"} disabled={!googleMapsApiKey} onClick={() => switchMapEngine("google")}>Google</button>
            <button type="button" role="radio" aria-checked={mapEngine === "atlas"} onClick={() => switchMapEngine("atlas")}>Open atlas</button>
          </div>
          {mapEngine === "google" ? (
            <label className="opsBasemapPicker" title="Google Maps road, satellite, labelled hybrid, terrain, and a low-clutter research style.">
              <span>Map</span>
              <select value={googleMapType} onChange={(event) => { const next = event.currentTarget.value as GoogleMapType; setGoogleMapType(next); setViewMode(next === "terrain" ? "terrain" : "plan"); }} aria-label="Google basemap style">
                <option value="roadmap">Google Road</option>
                <option value="satellite">Google Satellite</option>
                <option value="hybrid">Google Hybrid + labels</option>
                <option value="terrain">Google Terrain</option>
                <option value="research">Google Research</option>
              </select>
            </label>
          ) : (
            <label className="opsBasemapPicker" title="Background map style, grouped by purpose. Road and creek names stay on top of every choice. Your pick is remembered.">
              <span>Map</span>
              <select value={basemapId} onChange={(event) => switchBasemap(event.currentTarget.value)} aria-label="Basemap style">
                {basemapsByGroup.map(([group, entries]) => (
                  <optgroup key={group} label={group}>
                    {entries.map((basemap) => (
                      <option key={basemap.id} value={basemap.id}>{basemap.title}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          <div className="opsSegmented opsBarSeg" role="radiogroup" aria-label="Terrain and three-dimensional view">
            <button type="button" role="radio" aria-checked={viewMode === "plan"} onClick={() => switchViewMode("plan")} title="Flat map, straight down.">2D</button>
            <button type="button" role="radio" aria-checked={viewMode === "terrain"} onClick={() => switchViewMode("terrain")} title="Tilted camera over real elevation so hills and gorges read.">Terrain</button>
            <button type="button" role="radio" aria-checked={viewMode === "three-dimensional"} onClick={() => switchViewMode("three-dimensional")} title={mapEngine === "google" ? "Google photorealistic 3D with the public field and shortlist markers." : "Tilted with free rotation — drag with the right mouse button or two fingers to look around the escarpment."}>3D</button>
          </div>
          {mapEngine === "atlas" && viewMode !== "plan" ? (
            <label className="opsExaggeration" title="Vertical exaggeration of the 3D terrain. ×1.0 is true scale; higher stretches hills and cliffs upward so steep approach country is easier to judge. Changes the view only — never the data or the model.">
              <span>Relief ×{terrainExaggeration.toFixed(1)}</span>
              <input type="range" min="1" max="2.5" step="0.1" value={terrainExaggeration}
                onChange={(event) => changeExaggeration(Number(event.target.value))} aria-label="Terrain exaggeration" />
            </label>
          ) : null}
          <button className="opsBarButton" type="button" onClick={() => setControlsOpen((open) => !open)} aria-expanded={controlsOpen} title="Open the layer list: toggle model markers, photos, boundaries and raster evidence.">Layers</button>
          <button className="opsBarButton" type="button" onClick={fitRegion} title="Reset the camera to the full study area.">Fit</button>
          <button className={`opsBarButton ${measuring ? "isActive" : ""}`} type="button" aria-pressed={measuring} onClick={toggleMeasure} title="Measure distance: click points on the map to build a path; toggle off to finish.">
            {measurementLabel}
          </button>
        </div>

        <button className="opsMobileButton opsLayersButton" type="button" onClick={() => setControlsOpen(true)}>
          <LayersIcon /> Layers
        </button>
        <button className="opsMobileButton opsInspectButton" type="button" onClick={() => setInspectorOpen(true)} disabled={!selection}>
          <InspectIcon /> Inspect
        </button>

        <aside className={`opsPanel opsControls ${controlsOpen ? "isOpen" : ""}`} aria-label="Map layers and model threshold">
          <PanelTop title="Map controls" onClose={() => setControlsOpen(false)} />
          <div className="opsPanelScroll">
            {mapEngine === "google" ? (
              <section className="opsControlSection opsGoogleTools">
                <div className="opsSectionLabel"><span>Google Maps tools <InfoTip text="Capabilities included in the enabled Maps JavaScript API. These do not call Places, Routes, Geocoding, Elevation, or Map Tiles APIs." /></span><span>JS API</span></div>
                <div className="opsGoogleActionGrid">
                  <button type="button" onClick={() => googleMapRef.current?.openStreetView()}>Nearest Street View</button>
                  <button type="button" onClick={() => googleMapRef.current?.zoomToBestImagery()}>Best imagery detail</button>
                  <button type="button" onClick={() => googleMapRef.current?.locateUser()}>My location</button>
                  <button type="button" onClick={() => googleMapRef.current?.resetNorth()}>Reset north</button>
                </div>
                <div className="opsSectionLabel opsGoogleLayerLabel"><span>Live reference layers</span><span>coverage varies</span></div>
                <ToggleRow active={googleReferenceLayers.traffic} onChange={() => setGoogleReferenceLayers((current) => ({...current, traffic: !current.traffic}))} color="#d84f3d" title="Live traffic" value="Google traffic layer" tip="Current traffic speeds where Google has coverage. Remote Cape York coverage may be sparse." />
                <ToggleRow active={googleReferenceLayers.transit} onChange={() => setGoogleReferenceLayers((current) => ({...current, transit: !current.transit}))} color="#2d6cdf" title="Public transit" value="Google transit network" tip="Public transport routes and stops where Google has coverage." />
                <ToggleRow active={googleReferenceLayers.bicycling} onChange={() => setGoogleReferenceLayers((current) => ({...current, bicycling: !current.bicycling}))} color="#2f8a43" title="Bicycle routes" value="Google cycling layer" tip="Cycle routes and bicycle-specific map overlays where coverage exists." />
                <div className="opsSectionLabel opsMeasureLabel"><span>Google spherical measurement</span><span>earth surface</span></div>
                <div className="opsSegmented opsMeasureModes" role="radiogroup" aria-label="Measurement type">
                  <button type="button" role="radio" aria-checked={measurementMode === "distance"} onClick={() => { setMeasuring(false); setMeasurementMode("distance"); setMeasureTotalMetres(null); setMeasureAreaSquareMetres(null); }}>Distance</button>
                  <button type="button" role="radio" aria-checked={measurementMode === "area"} onClick={() => { setMeasuring(false); setMeasurementMode("area"); setMeasureTotalMetres(null); setMeasureAreaSquareMetres(null); }}>Area</button>
                </div>
                {googleStatus ? <p className="opsGoogleStatus" role="status">{googleStatus}</p> : null}
                <p className="opsGoogleLegal"><a href="/admin/research/quinkan/privacy">Privacy</a><span aria-hidden="true">·</span><a href="/admin/research/quinkan/terms">Terms</a><span>Google Maps use is covered by these notices.</span></p>
              </section>
            ) : null}
            <section className="opsControlSection opsFieldTools">
              <div className="opsSectionLabel"><span>Field tools <InfoTip text="Practical navigation helpers: jump to pasted coordinates, search named places, copy where you clicked, and export waypoints for handheld GPS apps." /></span></div>
              <label className="opsToolField">
                <span>Go to coordinates</span>
                <div className="opsToolRow">
                  <input type="text" value={gotoValue} placeholder="15°42′56.8″ S, 144°18′04.7″ E  or  -15.7158, 144.3013"
                    onChange={(event) => setGotoValue(event.currentTarget.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") goToCoordinate(); }} />
                  <button type="button" onClick={goToCoordinate}>Go</button>
                </div>
                {gotoError ? <small className="opsToolError">{gotoError}</small> : null}
              </label>
              <label className="opsToolField">
                <span>Find a named place</span>
                <input type="text" value={placeQuery} placeholder="e.g. Battle Camp, Ang-Gui Creek"
                  onChange={(event) => setPlaceQuery(event.currentTarget.value)} />
                {placeMatches.length > 0 ? (
                  <div className="opsPlaceMatches">
                    {placeMatches.map((place) => (
                      <button key={place.n} type="button" onClick={() => flyToPlace(place)}>
                        <strong>{place.n}</strong><small>{place.t}</small>
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
              <div className="opsToolRow opsToolActions">
                <button type="button" onClick={copyClickedCoordinate} disabled={!clickedCoordinate}
                  title="Copies the last place you clicked on the map as decimal latitude, longitude.">
                  {clickedCoordinate ? (coordinateCopied ? "Copied ✓" : `Copy ${clickedCoordinate[1].toFixed(5)}, ${clickedCoordinate[0].toFixed(5)}`) : "Click the map to pick a point"}
                </button>
                <button type="button" onClick={downloadGpx}
                  title="Downloads a GPX file of every field observation, the 300 m-thinned field shortlist (S1…, blue pins), and the top-ranked visible proposals (max 300) for handheld GPS or phone apps like Avenza and Gaia.">
                  Export GPX
                </button>
              </div>
            </section>

            <section className="opsControlSection">
              {workspace.knownLocations.length > 0 ? (
                <button className="opsSourceFitButton" type="button" onClick={fitPublicSources}>Fit all public source assertions</button>
              ) : (
                <p className="opsReferenceNote">Public-source markers (OpenStreetMap/Wikidata) are retired: the family attested on-ground that those published locations are incorrect. The map shows family-attested observations and model output only.</p>
              )}
              {jowalbinna ? (
                <button className="opsLandmarkButton" type="button" onClick={focusJowalbinna}>
                  <i aria-hidden="true">J</i>
                  <span><strong>Jowalbinna</strong><small>Locate the highlighted public landmark</small></span>
                  <b>View</b>
                </button>
              ) : null}
              {expeditionCamp ? (
                <button className="opsLandmarkButton opsCampButton" type="button" onClick={focusCamp}>
                  <i aria-hidden="true">C</i>
                  <span><strong>Expedition camp</strong><small>Locate the team’s supplied campsite</small></span>
                  <b>View</b>
                </button>
              ) : null}
            </section>

            <section className="opsControlSection opsFieldClarity">
              <div className="opsSectionLabel"><span>Field clarity</span><span>hard-colour mode <InfoTip text="Bold, fixed-colour road and waterway lines with their official names, kept above every basemap (including Satellite) so field navigation never loses them." /></span></div>
              <ToggleRow active={layers.fieldReference} onChange={() => toggleLayer("fieldReference")} color="#00b7e8" title="High-contrast roads + creeks" value="34 road segments · 4,882 named or higher-order waterways" tip="Draws roads in cyan and waterways in blue with name labels, on top of any basemap. Purely a navigation aid — not model output." />
              <div className="opsLineKey" aria-label="Field clarity line colours">
                <span><i className="isRoad" /> Roads and tracks</span>
                <span><i className="isWater" /> Creeks and rivers</span>
              </div>
              <p className="opsReferenceNote">Official road and watercourse names stay above every basemap, including Satellite. <a href={qldRoadsSourceUrl} target="_blank" rel="noreferrer">Road source ↗</a> <a href={qldWatercoursesSourceUrl} target="_blank" rel="noreferrer">Water source ↗</a></p>
            </section>

            <section className="opsControlSection opsThreshold">
              <div className="opsSectionLabel"><span>Model rank threshold <InfoTip text="Filters the model markers by priority-rank percentile. At 99.0% only cells ranked in the top 1% of all 313,941 evaluated cells are shown; slide left to see more, lower-ranked hypotheses. This is an ordering, not a probability that anything exists." /></span><output>{threshold.toFixed(1)}%</output></div>
              <input
                aria-label="Minimum model rank percentile"
                type="range"
                min="97.5"
                max="100"
                step="0.1"
                value={threshold}
                onChange={(event) => setThreshold(Number(event.currentTarget.value))}
              />
              <div className="opsRangeEnds"><span>More markers</span><span>Higher rank</span></div>
              <p><strong>{formatter.format(filteredCounts.regional + filteredCounts.highResolution)} markers shown.</strong> This is a priority-rank percentile, not the probability that a cave or artwork exists.</p>
            </section>

            <section className="opsControlSection">
              <div className="opsSectionLabel"><span>Points</span><span>visible / available</span></div>
              <ToggleRow active={layers.known} onChange={() => toggleLayer("known")} color="#00a67a" title="Public source assertions" value={`${workspace.knownLocations.length} / ${workspace.knownLocations.length}`} tip="Rock-art and cave locations already published in open sources (OpenStreetMap, Wikidata, literature). Exact points show as dots; coarse sources carry an uncertainty halo." />
              <ToggleRow active={layers.camp} onChange={() => toggleLayer("camp")} color="#137fbb" title="Expedition camp" value={expeditionCamp ? "1 / 1" : "0 / 0"} tip="The team's campsite, shown for orientation only. It is never used to train the model." />
              <ToggleRow active={layers.field} onChange={() => toggleLayer("field")} color="#753bbd" title="Field observations" value={`${foundToday.length} / ${foundToday.length}`} tip="GPS points supplied from the field by the family, shown only under an explicit disclosure decision. Confirmed caves appear in crimson." />
              <ToggleRow active={layers.photos} onChange={() => toggleLayer("photos")} color="#f2b134" title="Geotagged photos" value="1,058 images" tip="Publicly licensed photos (Wikimedia Commons, iNaturalist) whose embedded GPS position falls inside the atlas. Click one to preview it and open the source." />
              <ToggleRow active={layers.regional} onChange={() => toggleLayer("regional")} color="#f4a62a" title="Regional 90 m proposals" value={`${formatter.format(filteredCounts.regional)} / ${formatter.format(workspace.proposalCollections.find((item) => item.id === "regional")?.publishedMarkers ?? 0)}`} tip="The model's survey-priority hypotheses on the 90 m grid — cells whose environment most resembles the attested caves. Unvalidated suggestions for where to look, never a probability or a cultural claim." />
              <ToggleRow active={layers.highResolution} onChange={() => toggleLayer("highResolution")} color="#e0528d" title="High-resolution 5 m proposals" value={`${formatter.format(filteredCounts.highResolution)} / ${formatter.format(workspace.proposalCollections.find((item) => item.id === "high-resolution")?.publishedMarkers ?? 0)}`} tip="Fine-scale shelter-morphology candidates from 5 m elevation data (cliff bases, overhang-prone breaks), shown inside the regional priority band." />
              <ToggleRow active={layers.shortlist} onChange={() => toggleLayer("shortlist")} color="#7a3fe0" title="Field shortlist (300 m thinned)" value={`${shortlistProposals.length} targets, S1 highest`} tip="One target per locale: the highest-ranked proposals kept at least 300 m apart, numbered by model rank alone. Remoteness and access play no part in the ranking — pick targets and plan the flight from here. Independent of the confidence slider." />
            </section>

            <section className="opsControlSection">
              <div className="opsSectionLabel"><span>Reference boundaries</span><span>public geometry</span></div>
              <ToggleRow active={layers.heritage} onChange={() => toggleLayer("heritage")} color="#2962ff" title="National Heritage boundary" value="1 feature" tip="The Quinkan Country National Heritage List boundary — a public record of the listed area, not a site register." />
              <ToggleRow active={layers.projects} onChange={() => toggleLayer("projects")} color="#00a7bb" title="Elevation project coverage" value="10 features" tip="Footprints of the government LiDAR (laser elevation) projects: where high-resolution ground data exists for the 5 m analysis." />
              <ToggleRow active={layers.tiles} onChange={() => toggleLayer("tiles")} color="#7856d8" title="Elevation tile coverage" value="461 features" tip="The individual 5 m elevation tiles inside those projects — the exact ground covered by fine-scale terrain data." />
              <ToggleRow active={layers.nativeTitle} onChange={() => toggleLayer("nativeTitle")} color="#b4238a" title="Native title determinations" value={`${nativeTitles?.features.length ?? 5} records intersect the atlas`} tip="Legal native-title determination boundaries from the National Native Title Tribunal's public register. A legal layer only — not cultural heritage, site locations, or access permission." />
              {layers.nativeTitle ? (
                <div className="opsNativeTitleList" aria-label="Native title determinations intersecting the atlas">
                  <div className="opsNativeTitleIntro">
                    <span>Official NNTT snapshot</span>
                    <a href={nativeTitleSourceUrl} target="_blank" rel="noreferrer">Source ↗</a>
                  </div>
                  {nativeTitleError ? <p role="alert">{nativeTitleError}</p> : null}
                  {!nativeTitles && !nativeTitleError ? <p>Loading all determination records…</p> : null}
                  {nativeTitles?.features.map((feature) => (
                    <button key={`${feature.properties.Tribunal_ID}-${feature.properties.OBJECTID}`} type="button" onClick={() => focusNativeTitle(feature)}>
                      <span>{feature.properties.Tribunal_ID}</span>
                      <strong>{feature.properties.Name}</strong>
                      <small>{feature.properties.Determined_Outcome}</small>
                    </button>
                  ))}
                  <p className="opsNativeTitleWarning">Legal determination boundaries only. This is not a cultural-heritage or access-rights layer.</p>
                </div>
              ) : null}
            </section>

            <section className="opsControlSection">
              <div className="opsSectionLabel"><span>Raster evidence <InfoTip text="Georeferenced evidence images draped on the map — geology sheets, terrain derivatives, fire history, satellite composites. Each row's note says what the colours mean; toggle any combination." /></span><span>{activeOverlays.size} active</span></div>
              <label className="opsOpacity">
                <span>Overlay opacity <InfoTip text="Transparency of the active raster overlays: slide left to see the basemap through them, right for full-strength colours." /></span><output>{overlayOpacity}%</output>
                <input type="range" min="10" max="100" step="5" value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.currentTarget.value))} />
              </label>
              <div className="opsOverlayList">
                {groupOverlays(workspace.overlays).map(([group, overlays]) => (
                  <div key={group} className="opsOverlayGroup">
                    <h3>{overlayGroupTitle(group)}</h3>
                    {overlays.map((overlay) => <OverlayRow key={overlay.id} overlay={overlay} active={activeOverlays.has(overlay.id)} onChange={() => toggleOverlay(overlay.id)} />)}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </aside>

        <aside className={`opsPanel opsInspector ${inspectorOpen ? "isOpen" : ""}`} aria-label="Selected map feature details">
          <PanelTop title="Evidence inspector" onClose={() => setInspectorOpen(false)} />
          <div className="opsPanelScroll">
            {selection?.kind === "known" ? <KnownInspector location={selection.location} /> : null}
            {selection?.kind === "photo" ? <PhotoInspector photo={selection.photo} /> : null}
            {selection?.kind === "field" ? <FieldInspector observation={selection.observation} validation={workspace.fieldModelValidation} /> : null}
            {selection?.kind === "native-title" ? <NativeTitleInspector determination={selection.determination} /> : null}
            {selection?.kind === "proposal" ? <ProposalInspector selection={selection} /> : null}
            {!selection ? <EmptyInspector workspace={workspace} /> : null}
          </div>
        </aside>

        <div className="opsMapLegend" aria-label="Map legend">
          <span title="The highlighted public orientation landmark (Jowalbinna rock-art camp area)."><i className="isLandmark" /> Jowalbinna</span>
          <span title="The team's campsite — orientation only, never model training data."><i className="isCamp" /> Expedition camp</span>
          <span title="Field GPS points supplied by the family, shown under an explicit disclosure decision."><i className="isField" /> Found today</span>
          <span title="A family-attested spring or water feature — logged as evidence for the moisture covariates, never a cave positive."><i style={{background: "#1f9bd8"}} /> Spring</span>
          {workspace.knownLocations.length > 0 ? <span title="A rock-art or cave location already published in open sources (OSM, Wikidata, literature)."><i style={{background: "#00a67a"}} /> Public source point</span> : null}
          {workspace.knownLocations.length > 0 ? <span title="A halo around points whose published source is only approximate — the true place lies somewhere inside it."><i className="isUncertain" /> Coarse-source uncertainty</span> : null}
          <span title="A model survey-priority cell on the 90 m grid: environment resembles the attested caves. Unvalidated hypothesis, not a probability."><i style={{background: "#f4a62a"}} /> Regional hypothesis</span>
          <span title="A fine-scale shelter-morphology candidate from 5 m elevation data (cliff bases, overhang-prone breaks)."><i style={{background: "#e0528d"}} /> 5 m hypothesis</span>
          {layers.photos ? <span title="A Wikimedia Commons photo whose embedded GPS position falls here."><i style={{background: "#f2b134"}} /> Commons photo</span> : null}
          {layers.photos ? <span title="An iNaturalist observation photo with GPS, licensed for reuse."><i style={{background: "#8fd0c3"}} /> iNaturalist photo</span> : null}
          {layers.fieldReference ? <span title="Field-clarity mode: bold roads (cyan) and waterways (blue) with official names."><i className="isWaterLine" /> Roads + waterways</span> : null}
          {layers.nativeTitle ? <span><i className="isNativeTitle" /> Native title determination</span> : null}
        </div>
      </main>
    </div>
  );
}

function installOperationalLayers(
  map: MapLibreMap,
  workspace: OperationalWorkspace,
  contextAtlas: ContextAtlas,
  knownGeoJson: FeatureCollection,
  knownUncertaintyGeoJson: FeatureCollection,
  fieldGeoJson: FeatureCollection,
  regionalGeoJson: FeatureCollection,
  highResolutionGeoJson: FeatureCollection,
  shortlistGeoJson: FeatureCollection,
) {
  if (!map.getSource(terrainSourceId)) {
    // Self-hosted terrain: Copernicus GLO-30 blended with Queensland 0.5 m LiDAR
    // patches over the survey areas, tiled locally — sharper and dependency-free
    // inside the study area. AOI-bounded; falls flat outside.
    map.addSource(terrainSourceId, {
      type: "raster-dem",
      tiles: ["/api/admin/research/quinkan/static/terrain-tiles/{z}/{x}/{y}.png"],
      tileSize: 256,
      minzoom: 7,
      maxzoom: 14,
      bounds: [144.05, -16.05, 144.95, -15.25],
      encoding: "terrarium",
      attribution: "Terrain: Copernicus GLO-30 DSM © ESA · Qld 0.5 m LiDAR © State of Queensland CC BY 4.0",
    });
  }
  for (const overlay of workspace.overlays) {
    const sourceId = `overlay-source-${overlay.id}`;
    const layerId = `overlay-${overlay.id}`;
    if (!map.getSource(sourceId)) map.addSource(sourceId, {type: "image", url: overlay.assetUrl, coordinates: workspace.imageCorners as [[number, number], [number, number], [number, number], [number, number]]});
    if (!map.getLayer(layerId)) map.addLayer({id: layerId, type: "raster", source: sourceId, paint: {"raster-opacity": overlay.opacity}});
  }

  for (const layer of contextAtlas.layers) {
    const sourceId = `context-source-${layer.layer_id}`;
    if (!map.getSource(sourceId)) map.addSource(sourceId, {type: "geojson", data: layer.feature_collection as unknown as FeatureCollection});
    if (layer.layer_id === "public_heritage_acquisition_frame") {
      map.addLayer({id: "context-heritage-fill", type: "fill", source: sourceId, paint: {"fill-color": "#2962ff", "fill-opacity": 0.07}});
      map.addLayer({id: "context-heritage-line", type: "line", source: sourceId, paint: {"line-color": "#2962ff", "line-width": 2.2, "line-opacity": 0.9}});
    } else if (layer.layer_id === "qld_elevation_project_coverage") {
      map.addLayer({id: "context-projects-fill", type: "fill", source: sourceId, paint: {"fill-color": "#00a7bb", "fill-opacity": 0.05}});
      map.addLayer({id: "context-projects-line", type: "line", source: sourceId, paint: {"line-color": "#00a7bb", "line-width": 1.6, "line-opacity": 0.85}});
    } else if (layer.layer_id === "qld_elevation_tile_coverage") {
      map.addLayer({id: "context-tiles-line", type: "line", source: sourceId, paint: {"line-color": "#7856d8", "line-width": 0.7, "line-opacity": 0.7}});
    }
  }

  map.addSource("native-title-source", {type: "geojson", data: `${mapReferenceBaseUrl}/native-title-determinations.geojson`});
  map.addLayer({
    id: "native-title-fill", type: "fill", source: "native-title-source",
    paint: {"fill-color": "#b4238a", "fill-opacity": 0.11},
  });
  map.addLayer({
    id: "native-title-line", type: "line", source: "native-title-source",
    paint: {
      "line-color": "#7b145e", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.2, 13, 4.2],
      "line-opacity": 0.96, "line-dasharray": [2.5, 1.2],
    },
  });
  map.addLayer({
    id: "native-title-labels", type: "symbol", source: "native-title-source", minzoom: 9,
    layout: {
      "text-field": ["get", "Name"], "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 7, 11, 13, 14],
      "text-max-width": 16, "text-letter-spacing": 0.02,
    },
    paint: {"text-color": "#641049", "text-halo-color": "#fff6fc", "text-halo-width": 2.2},
  });

  map.addSource("photo-source", {type: "geojson", data: `${mapReferenceBaseUrl}/photos.geojson`});
  map.addLayer({
    id: "photo-points", type: "circle", source: "photo-source",
    paint: {
      "circle-color": ["match", ["get", "source"], "wikimedia-commons", "#f2b134", "#8fd0c3"],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.4, 11, 4.5, 14, 6.5],
      "circle-stroke-color": "#1c2420", "circle-stroke-width": 0.8, "circle-opacity": 0.85,
    },
  });

  map.addSource("field-roads-source", {type: "geojson", data: `${mapReferenceBaseUrl}/roads.geojson`});
  map.addLayer({
    id: "field-roads-casing", type: "line", source: "field-roads-source",
    paint: {
      "line-color": "#1c1204", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.8, 14, 7.2],
      "line-opacity": 0.98,
    },
  });
  map.addLayer({
    id: "field-roads-line", type: "line", source: "field-roads-source",
    paint: {
      "line-color": "#ff9f1c", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.4, 14, 4.8],
      "line-opacity": 1,
    },
  });
  map.addLayer({
    id: "field-roads-labels", type: "symbol", source: "field-roads-source", minzoom: 7,
    filter: ["all", ["has", "road_name_full"], ["!=", ["get", "road_name_full"], ""]],
    layout: {
      "symbol-placement": "line", "text-field": ["get", "road_name_full"],
      "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 7, 11, 14, 13],
      "text-letter-spacing": 0.04, "text-padding": 2, "text-max-angle": 35,
      "symbol-spacing": 300, "text-keep-upright": true,
    },
    paint: {"text-color": "#3d1d00", "text-halo-color": "#fffdf6", "text-halo-width": 3, "text-halo-blur": 0.35},
  });

  map.addSource("field-watercourses-source", {type: "geojson", data: `${mapReferenceBaseUrl}/watercourses.geojson`});
  map.addLayer({
    id: "field-watercourses-casing", type: "line", source: "field-watercourses-source",
    paint: {
      "line-color": "#052b4a", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.4, 14, 6.4],
      "line-opacity": 0.97,
    },
  });
  map.addLayer({
    id: "field-watercourses-line", type: "line", source: "field-watercourses-source",
    paint: {
      "line-color": "#1ed2ff", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.1, 14, 4.1],
      "line-opacity": 1,
    },
  });
  map.addLayer({
    id: "field-watercourses-labels", type: "symbol", source: "field-watercourses-source", minzoom: 7.5,
    filter: ["all", ["has", "name"], ["!=", ["get", "name"], ""]],
    layout: {
      "symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 14, 13],
      "text-letter-spacing": 0.035, "text-padding": 2, "text-max-angle": 35,
      "symbol-spacing": 300, "text-keep-upright": true,
    },
    paint: {"text-color": "#003f66", "text-halo-color": "#f7fdff", "text-halo-width": 3, "text-halo-blur": 0.35},
  });

  map.addSource("regional-proposal-source", {type: "geojson", data: regionalGeoJson});
  map.addLayer({
    id: "regional-proposals", type: "circle", source: "regional-proposal-source",
    paint: {
      "circle-color": "#f4a62a", "circle-stroke-color": "#251706", "circle-stroke-width": 0.7,
      "circle-opacity": 0.72, "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.2, 13, 6.5],
    },
  });
  map.addSource("high-resolution-proposal-source", {type: "geojson", data: highResolutionGeoJson});
  map.addLayer({
    id: "high-resolution-proposals", type: "circle", source: "high-resolution-proposal-source",
    paint: {
      "circle-color": "#e0528d", "circle-stroke-color": "#300b1b", "circle-stroke-width": 0.8,
      "circle-opacity": 0.78, "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.4, 14, 7],
    },
  });
  map.addSource("field-shortlist-source", {type: "geojson", data: shortlistGeoJson});
  map.addLayer({
    id: "field-shortlist", type: "circle", source: "field-shortlist-source",
    layout: {visibility: "none"},
    paint: {
      "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#7a3fe0", "circle-stroke-width": 2.4,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 13, 12],
    },
  });
  map.addLayer({
    id: "field-shortlist-labels", type: "symbol", source: "field-shortlist-source", minzoom: 8,
    layout: {
      visibility: "none",
      "text-field": ["concat", "S", ["get", "shortlistRank"]],
      "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, -1.4], "text-allow-overlap": true,
    },
    paint: {"text-color": "#5a23b8", "text-halo-color": "#f6f2ff", "text-halo-width": 2},
  });
  map.addSource("known-location-uncertainty-source", {type: "geojson", data: knownUncertaintyGeoJson});
  map.addLayer({
    id: "known-uncertainty-fill", type: "fill", source: "known-location-uncertainty-source",
    paint: {
      "fill-color": ["match", ["get", "precisionClass"], "same-name-outlier", "#dc4f4f", "regional-map-digitisation", "#d58a1f", "#1e88a8"],
      "fill-opacity": 0.09,
    },
  });
  map.addLayer({
    id: "known-uncertainty-line", type: "line", source: "known-location-uncertainty-source",
    paint: {
      "line-color": ["match", ["get", "precisionClass"], "same-name-outlier", "#b52f3b", "regional-map-digitisation", "#a5660f", "#12677e"],
      "line-width": 1.6, "line-opacity": 0.82, "line-dasharray": [3, 2],
    },
  });
  map.addSource("known-location-source", {type: "geojson", data: knownGeoJson});
  map.addLayer({
    id: "known-points", type: "circle", source: "known-location-source",
    filter: ["==", ["get", "featured"], false],
    paint: {
      "circle-color": ["match", ["get", "precisionClass"], "same-name-outlier", "#dc4f4f", "regional-map-digitisation", "#d58a1f", "specimen-locality", "#1e88a8", "coarse-locality", "#1e88a8", "coarse-locality-cluster", "#1e88a8", "#00a67a"],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 7, 14, 11],
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5, "circle-opacity": 0.95,
    },
  });
  map.addLayer({
    id: "known-labels", type: "symbol", source: "known-location-source", minzoom: 7,
    filter: ["==", ["get", "featured"], false],
    layout: {"text-field": ["get", "shortTitle"], "text-font": ["Noto Sans Regular"], "text-size": 12.5, "text-offset": [0, 1.3], "text-anchor": "top"},
    paint: {"text-color": "#10211c", "text-halo-color": "#ffffff", "text-halo-width": 1.6},
  });
  map.addLayer({
    id: "jowalbinna-halo", type: "circle", source: "known-location-source",
    filter: ["==", ["get", "featured"], true],
    paint: {
      "circle-color": "#ffd65b", "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 15, 14, 24],
      "circle-blur": 0.55, "circle-opacity": 0.68,
    },
  });
  map.addLayer({
    id: "jowalbinna-point", type: "circle", source: "known-location-source",
    filter: ["==", ["get", "featured"], true],
    paint: {
      "circle-color": "#f4b52f", "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 8, 14, 13],
      "circle-stroke-color": "#111a17", "circle-stroke-width": 3, "circle-opacity": 1,
    },
  });
  map.addLayer({
    id: "jowalbinna-initial", type: "symbol", source: "known-location-source",
    filter: ["==", ["get", "featured"], true],
    layout: {"text-field": "J", "text-font": ["Noto Sans Regular"], "text-size": 11, "text-allow-overlap": true},
    paint: {"text-color": "#111a17"},
  });
  map.addLayer({
    id: "jowalbinna-label", type: "symbol", source: "known-location-source", minzoom: 6,
    filter: ["==", ["get", "featured"], true],
    layout: {
      "text-field": "JOWALBINNA", "text-font": ["Noto Sans Regular"], "text-size": 13,
      "text-offset": [0, 1.5], "text-anchor": "top", "text-letter-spacing": 0.08,
      "text-allow-overlap": true,
    },
    paint: {"text-color": "#111a17", "text-halo-color": "#fff7d5", "text-halo-width": 2.4},
  });
  map.addSource("field-observation-source", {type: "geojson", data: fieldGeoJson});
  map.addLayer({
    id: "expedition-camp-halo", type: "circle", source: "field-observation-source",
    filter: ["==", ["get", "role"], "camp"],
    paint: {
      "circle-color": "#67d4ff", "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 13, 15, 26],
      "circle-blur": 0.5, "circle-opacity": 0.72,
    },
  });
  map.addLayer({
    id: "expedition-camp-point", type: "circle", source: "field-observation-source",
    filter: ["==", ["get", "role"], "camp"],
    paint: {
      "circle-color": "#137fbb", "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 8, 15, 14],
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 3, "circle-opacity": 1,
    },
  });
  map.addLayer({
    id: "expedition-camp-initial", type: "symbol", source: "field-observation-source",
    filter: ["==", ["get", "role"], "camp"],
    layout: {"text-field": "C", "text-font": ["Noto Sans Regular"], "text-size": 11, "text-allow-overlap": true},
    paint: {"text-color": "#ffffff"},
  });
  map.addLayer({
    id: "expedition-camp-label", type: "symbol", source: "field-observation-source", minzoom: 8,
    filter: ["==", ["get", "role"], "camp"],
    layout: {
      "text-field": "EXPEDITION CAMP", "text-font": ["Noto Sans Regular"], "text-size": 13,
      "text-offset": [0, 1.6], "text-anchor": "top", "text-letter-spacing": 0.08, "text-allow-overlap": true,
    },
    paint: {"text-color": "#073d5a", "text-halo-color": "#e8f8ff", "text-halo-width": 2.5},
  });
  map.addLayer({
    id: "field-observation-points", type: "circle", source: "field-observation-source",
    filter: ["!=", ["get", "role"], "camp"],
    paint: {
      "circle-color": ["match", ["get", "role"], "confirmed_cave_field_observation", "#e0245e", "spring_field_observation", "#1f9bd8", "#753bbd"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 7, 15, 12],
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5, "circle-opacity": 1,
    },
  });
  map.addLayer({
    id: "field-observation-labels", type: "symbol", source: "field-observation-source", minzoom: 11,
    filter: ["!=", ["get", "role"], "camp"],
    layout: {
      "text-field": ["upcase", ["get", "title"]], "text-font": ["Noto Sans Regular"], "text-size": 12,
      "text-offset": [0, 1.4], "text-anchor": "top", "text-letter-spacing": 0.06,
      "text-allow-overlap": true,
    },
    paint: {"text-color": "#3c126e", "text-halo-color": "#f7efff", "text-halo-width": 2.2},
  });
}

function applyMapSettings(
  map: MapLibreMap,
  overlays: readonly RasterOverlay[],
  settings: Readonly<{threshold: number; overlayOpacity: number; activeOverlays: Set<string>; layers: LayerSettings; viewMode: ViewMode}>,
) {
  for (const overlay of overlays) {
    const id = `overlay-${overlay.id}`;
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, "visibility", settings.activeOverlays.has(overlay.id) ? "visible" : "none");
    map.setPaintProperty(id, "raster-opacity", overlay.opacity * settings.overlayOpacity / 100);
  }
  setLayerVisibility(map, ["known-uncertainty-fill", "known-uncertainty-line", "known-points", "known-labels", "jowalbinna-halo", "jowalbinna-point", "jowalbinna-initial", "jowalbinna-label"], settings.layers.known);
  setLayerVisibility(map, ["expedition-camp-halo", "expedition-camp-point", "expedition-camp-initial", "expedition-camp-label"], settings.layers.camp);
  setLayerVisibility(map, ["field-observation-points", "field-observation-labels"], settings.layers.field);
  setLayerVisibility(map, ["regional-proposals"], settings.layers.regional);
  setLayerVisibility(map, ["high-resolution-proposals"], settings.layers.highResolution);
  setLayerVisibility(map, ["field-shortlist", "field-shortlist-labels"], settings.layers.shortlist);
  setLayerVisibility(map, [...contextLayerIds.public_heritage_acquisition_frame], settings.layers.heritage);
  setLayerVisibility(map, [...contextLayerIds.qld_elevation_project_coverage], settings.layers.projects);
  setLayerVisibility(map, [...contextLayerIds.qld_elevation_tile_coverage], settings.layers.tiles);
  setLayerVisibility(map, ["photo-points"], settings.layers.photos);
  setLayerVisibility(map, ["field-roads-casing", "field-roads-line", "field-roads-labels", "field-watercourses-casing", "field-watercourses-line", "field-watercourses-labels"], settings.layers.fieldReference);
  setLayerVisibility(map, ["native-title-fill", "native-title-line", "native-title-labels"], settings.layers.nativeTitle);
  const filter: Parameters<MapLibreMap["setFilter"]>[1] = [">=", ["get", "confidencePercentile"], settings.threshold / 100];
  if (map.getLayer("regional-proposals")) map.setFilter("regional-proposals", filter);
  if (map.getLayer("high-resolution-proposals")) map.setFilter("high-resolution-proposals", filter);
  applyMapView(map, settings.viewMode, false);
}

function applyMapView(map: MapLibreMap, mode: ViewMode, animate: boolean, exaggeration = 1.45) {
  if (!map.getSource(terrainSourceId)) return;
  const enabled = mode !== "plan";
  map.setTerrain(enabled ? {source: terrainSourceId, exaggeration: mode === "three-dimensional" ? exaggeration : Math.min(exaggeration, 1.15)} : null);
  const pitch = mode === "three-dimensional" ? 67 : mode === "terrain" ? 36 : 0;
  const bearing = mode === "three-dimensional" ? -24 : 0;
  if (Math.abs(map.getPitch() - pitch) < 0.5 && Math.abs(map.getBearing() - bearing) < 0.5) return;
  const camera = {pitch, bearing, duration: animate ? 500 : 0};
  if (animate) map.easeTo(camera);
  else map.jumpTo(camera);
}

function setLayerVisibility(map: MapLibreMap, ids: readonly string[], visible: boolean) {
  for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

function pointsForKnown(locations: readonly KnownLocation[]): FeatureCollection {
  const bestPerIdentity = new Map<string, KnownLocation>();
  for (const location of locations) {
    const group = location.identityGroup ?? location.id;
    const current = bestPerIdentity.get(group);
    const uncertainty = location.uncertaintyMetres ?? 0;
    if (!current || uncertainty < (current.uncertaintyMetres ?? 0)) bestPerIdentity.set(group, location);
  }
  return {
    type: "FeatureCollection",
    features: [...bestPerIdentity.values()].map((location) => ({
      type: "Feature",
      id: location.id,
      properties: {
        id: location.id,
        kind: "known",
        title: location.title,
        shortTitle: location.title.split("\u2014")[0].trim(),
        classification: location.classification,
        featured: location.id === featuredLandmarkId,
        precisionClass: location.precisionClass,
      },
      geometry: {type: "Point", coordinates: [location.longitude, location.latitude]},
    })),
  };
}

function uncertaintyAreasForKnown(locations: readonly KnownLocation[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: locations.flatMap((location) => {
      if (location.uncertaintyMetres === null) return [];
      const latitudeRadius = location.uncertaintyMetres / 111_320;
      const longitudeRadius = latitudeRadius / Math.cos(location.latitude * Math.PI / 180);
      const ring = Array.from({length: 65}, (_, index) => {
        const angle = index / 64 * Math.PI * 2;
        return [
          location.longitude + Math.cos(angle) * longitudeRadius,
          location.latitude + Math.sin(angle) * latitudeRadius,
        ];
      });
      return [{
        type: "Feature" as const,
        id: `uncertainty-${location.id}`,
        properties: {id: location.id, precisionClass: location.precisionClass},
        geometry: {type: "Polygon" as const, coordinates: [ring]},
      }];
    }),
  };
}

function PhotoInspector({photo}: {photo: Readonly<{title: string; thumbUrl: string; pageUrl: string; license: string; author: string; source: string; observedOn?: string}>}) {
  return (
    <div className="opsInspectorBody">
      <p className="opsInspectorKicker">{photo.source === "wikimedia-commons" ? "Wikimedia Commons" : "iNaturalist"} · geotagged photo</p>
      <h3>{photo.title}</h3>
      <a className="opsPhotoThumb" href={photo.pageUrl} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.thumbUrl} alt={photo.title} loading="lazy" />
      </a>
      <div className="opsFactList">
        {photo.author ? <div><span>By</span><strong>{photo.author}</strong></div> : null}
        {photo.license ? <div><span>Licence</span><strong>{photo.license}</strong></div> : null}
        {photo.observedOn ? <div><span>Observed</span><strong>{photo.observedOn}</strong></div> : null}
      </div>
      <p className="opsReferenceNote">The photo stays on its source site; only its public location and thumbnail are shown here. <a href={photo.pageUrl} target="_blank" rel="noreferrer">View original ↗</a></p>
    </div>
  );
}

function pointsForField(observations: readonly FieldObservation[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: observations.map((observation) => ({
      type: "Feature",
      id: observation.id,
      properties: {
        id: observation.id,
        kind: "field",
        title: observation.workingName,
        role: observation.role,
        trainingRole: observation.trainingRole,
      },
      geometry: {type: "Point", coordinates: [observation.longitude, observation.latitude]},
    })),
  };
}

function pointsForProposals(proposals: readonly ProposalMarker[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: proposals.map((proposal) => ({
      type: "Feature",
      id: proposal.id,
      properties: {
        id: proposal.id,
        kind: "proposal",
        collectionId: proposal.collectionId,
        confidencePercentile: proposal.confidencePercentile,
        priorityScore: proposal.priorityScore,
      },
      geometry: {type: "Point", coordinates: [proposal.longitude, proposal.latitude]},
    })),
  };
}

function groupOverlays(overlays: readonly RasterOverlay[]): Array<[string, readonly RasterOverlay[]]> {
  const groups = new Map<string, RasterOverlay[]>();
  for (const overlay of overlays) groups.set(overlay.group, [...(groups.get(overlay.group) ?? []), overlay]);
  return [...groups.entries()];
}

function overlayGroupTitle(group: string): string {
  return group.replaceAll("_", " ");
}

function InfoTip({text}: Readonly<{text: string}>) {
  return (
    <span className="opsTip">
      <button type="button" aria-label={`Explain: ${text}`} title={text}>i</button>
      <span role="tooltip">{text}</span>
    </span>
  );
}

function ToggleRow({active, onChange, color, title, value, tip}: Readonly<{active: boolean; onChange: () => void; color: string; title: string; value: string; tip?: string}>) {
  return (
    <button className="opsToggleRow" type="button" aria-pressed={active} onClick={onChange} title={tip}>
      <span className="opsCheck" aria-hidden="true">{active ? "✓" : ""}</span>
      <i style={{background: color}} aria-hidden="true" />
      <span>{title}<small>{value}</small></span>
    </button>
  );
}

function OverlayRow({overlay, active, onChange}: Readonly<{overlay: RasterOverlay; active: boolean; onChange: () => void}>) {
  return (
    <div className="opsOverlayItem">
      <button className="opsOverlayRow" type="button" aria-pressed={active} onClick={onChange} title={overlay.interpretation}>
        <span className="opsCheck" aria-hidden="true">{active ? "✓" : ""}</span>
        <span><strong>{overlay.title}</strong><small>{overlay.legend}</small></span>
      </button>
      {overlay.sourceUrl ? <a className="opsOverlaySource" href={overlay.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open source for ${overlay.title}`}>Source ↗</a> : null}
    </div>
  );
}

function PanelTop({title, onClose}: Readonly<{title: string; onClose: () => void}>) {
  return <div className="opsPanelTop"><strong>{title}</strong><button type="button" onClick={onClose} aria-label={`Close ${title}`}>×</button></div>;
}

function KnownInspector({location}: Readonly<{location: KnownLocation}>) {
  const featured = location.id === featuredLandmarkId;
  return (
    <article className="opsInspectArticle">
      <p className="opsEyebrow"><span className={featured ? "opsLandmarkDot" : "opsKnownDot"} /> {featured ? "Featured orientation landmark" : "Public source assertion"}</p>
      <h1>{location.title}</h1>
      <p className="opsCoordinate">{formatCoordinate(location.latitude, location.longitude)}</p>
      <div className="opsFactGrid">
        <div><span>Source</span><strong>{location.sourceKind}</strong></div>
        <div><span>Record</span><strong>{location.sourceRecordId}</strong></div>
        <div><span>Precision class</span><strong>{humanizeColumn(location.precisionClass)}</strong></div>
        <div><span>Support</span><strong>{formatter.format(location.supportingRecordCount)} source record{location.supportingRecordCount === 1 ? "" : "s"}</strong></div>
        <div><span>Uncertainty</span><strong>{location.uncertaintyMetres === null ? "Not supplied" : `± ${formatter.format(location.uncertaintyMetres)} m`}</strong></div>
        <div><span>Identity group</span><strong>{location.identityGroup}</strong></div>
      </div>
      <section className="opsInspectSection">
        <h2>Recorded classification</h2>
        <p>{location.classification}</p>
      </section>
      <section className="opsInspectSection">
        <h2>Location precision</h2>
        <p>{location.locationPrecision}</p>
      </section>
      <div className="opsCaution"><AlertIcon /><p>{location.note}</p></div>
      <a className="opsSourceLink" href={location.sourceUrl} target="_blank" rel="noreferrer">Open source record <span>↗</span></a>
    </article>
  );
}

function NativeTitleInspector({determination}: Readonly<{determination: NativeTitleProperties}>) {
  return (
    <article className="opsInspectArticle">
      <p className="opsEyebrow"><span className="opsNativeTitleDot" /> Native title determination</p>
      <h1>{determination.Name}</h1>
      <p className="opsCoordinate">{determination.Tribunal_ID}</p>
      <div className="opsFactGrid">
        <div><span>Federal Court</span><strong>{determination.FC_No}</strong></div>
        <div><span>Jurisdiction</span><strong>{determination.Jurisdiction}</strong></div>
        <div><span>Determined</span><strong>{formatNnttDate(determination.Determination_Date)}</strong></div>
        <div><span>Registered</span><strong>{formatNnttDate(determination.NNTR_Registration_Date)}</strong></div>
        <div><span>Method</span><strong>{determination.Determined_Method}</strong></div>
        <div><span>Area</span><strong>{formatter.format(determination.Area_Sqkm)} km²</strong></div>
      </div>
      <section className="opsInspectSection">
        <h2>Determined outcome</h2>
        <p>{determination.Determined_Outcome}</p>
      </section>
      <section className="opsInspectSection">
        <h2>Registered Native Title Body Corporate</h2>
        <p>{determination.RNTBC_Name ?? "Not supplied in this spatial record."}</p>
      </section>
      <section className="opsInspectSection">
        <h2>Federal Court matter</h2>
        <p>{determination.FC_Name}</p>
      </section>
      <dl className="opsMiniLedger">
        <div><dt>Status</dt><dd>{determination.Determination_Type}</dd></div>
        <div><dt>Claimant type</dt><dd>{determination.Claimant_Type}</dd></div>
        <div><dt>Data currency</dt><dd>{formatNnttDate(determination.Date_Currency)}</dd></div>
      </dl>
      <div className="opsCaution"><AlertIcon /><p>This public legal-boundary overlay is for orientation only. The NNTT states that its spatial information is general information, not professional advice, and must not be relied on for cultural-heritage matters.</p></div>
      <a className="opsSourceLink" href={nativeTitleSourceUrl} target="_blank" rel="noreferrer">Open official NNTT source <span>↗</span></a>
    </article>
  );
}

function FieldInspector({observation, validation}: Readonly<{observation: FieldObservation; validation: FieldModelValidation | null}>) {
  const [query, setQuery] = useState("");
  const isCamp = observation.role === "camp";
  const holdoutResults = useMemo(() => validation?.designs.flatMap((design) =>
    design.folds.flatMap((fold) => fold.heldOut
      .filter((result) => result.pointId === observation.id)
      .map((result) => ({design, fold, result}))),
  ) ?? [], [observation.id, validation]);
  const covariates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return observation.covariates;
    return observation.covariates.filter((covariate) =>
      covariate.column.toLowerCase().includes(normalized)
      || covariate.sourcePath.toLowerCase().includes(normalized)
      || humanizeColumn(covariate.column).toLowerCase().includes(normalized),
    );
  }, [observation.covariates, query]);
  return (
    <article className="opsInspectArticle">
      <p className="opsEyebrow"><span className={isCamp ? "opsCampDot" : "opsFieldDot"} /> {isCamp ? "Expedition orientation point" : "User-attested field observation"}</p>
      <h1>{observation.workingName}</h1>
      <p className="opsCoordinate">{formatCoordinate(observation.latitude, observation.longitude)}</p>
      {!isCamp ? (() => {
        const value = (column: string) => observation.covariates.find((covariate) => covariate.column === column)?.value;
        const slope = value("slope_degrees");
        const rugged = value("terrain_ruggedness_riley");
        const cliffs = value("cliff_gradient_density_radius_300m");
        if (slope === undefined) return null;
        const label = slope < 5 ? "easy walk" : slope < 12 ? "moderate walk" : slope < 20 ? "steep climb" : "scramble";
        return (
          <p className="opsApproach">
            <strong>Approach terrain (90 m cell):</strong> {slope.toFixed(1)}° slope — {label}
            {rugged !== undefined ? ` · ruggedness ${rugged.toFixed(1)}` : ""}
            {cliffs !== undefined ? ` · ${(cliffs * 100).toFixed(0)}% cliff cells within 300 m` : ""}.
            {" "}Terrain-only estimate; use the 3D view to read the ascent.
          </p>
        );
      })() : null}
      <div className="opsFactGrid">
        <div><span>Role</span><strong>{isCamp ? "Camp — excluded from fitting" : "Found today — positive input"}</strong></div>
        <div><span>Variables</span><strong>{observation.covariates.length} / {observation.covariates.length}</strong></div>
        <div><span>Nearest 90 m cell</span><strong>{observation.nearestCovariateCellId}</strong></div>
        <div><span>Snap distance</span><strong>{numberFormatter.format(observation.nearestCovariateCellDistanceMetres)} m</strong></div>
      </div>
      <section className="opsInspectSection">
        <h2>Coordinate as supplied</h2>
        <p>{observation.coordinateAsSupplied}</p>
      </section>
      <section className="opsInspectSection">
        <h2>Field attestation</h2>
        <p>{observation.attestation}</p>
      </section>
      {!isCamp ? <div className="opsCaution"><AlertIcon /><p>The name is an arbitrary working label assigned in the supplied order. These four records are one tight spatial cluster; they improve local conditioning but do not independently validate the model.</p></div> : null}
      {holdoutResults.length > 0 ? (
        <section className="opsInspectSection opsHoldoutSection">
          <div className="opsVariableHeading"><div><h2>Cluster-held-out retrieval</h2><p>The model target was refitted without this point&apos;s whole source or spatial cluster, then this cell was ranked against all {validation ? formatter.format(validation.evaluatedRegionalCellCount) : "regional"} cells.</p></div><strong>{holdoutResults.length}</strong></div>
          <div className="opsHoldoutList">
            {holdoutResults.map(({design, fold, result}) => (
              <article className="opsHoldoutResult" key={design.designId}>
                <header><span>{humanizeColumn(design.designId)}</span><strong>{percentFormatter.format(result.rankPercentile * 100)}%</strong></header>
                <dl>
                  <div><dt>Held-out group</dt><dd>{fold.groupId}</dd></div>
                  <div><dt>Similarity score</dt><dd>{numberFormatter.format(result.priorityScore)}</dd></div>
                  <div><dt>Nearest training point</dt><dd>{numberFormatter.format(result.nearestTrainingPointDistanceMetres / 1000)} km</dd></div>
                  <div><dt>Training cells</dt><dd>{formatter.format(fold.trainingUniqueCellCount)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <p className="opsHoldoutWarning">Positive-retrieval diagnostic only. It is not an independent field test, probability, precision/recall estimate, or evidence of an undiscovered place.</p>
        </section>
      ) : null}
      <section className="opsInspectSection opsVariableSection">
        <div className="opsVariableHeading"><div><h2>All environmental variables</h2><p>Regional 90 m cell values, fitted positive-profile targets, weights, and source artifacts.</p></div><strong>{covariates.length}</strong></div>
        <label className="opsVariableSearch"><span>Filter variables</span><input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="slope, geology, Landsat…" /></label>
        <div className="opsVariableList">
          {covariates.map((covariate) => (
            <details className="opsVariable" key={covariate.column}>
              <summary><span><strong>{humanizeColumn(covariate.column)}</strong><small>{covariate.column}</small></span><b>{numberFormatter.format(covariate.value)}</b></summary>
              <dl>
                <div><dt>Observed cell value</dt><dd>{numberFormatter.format(covariate.value)}</dd></div>
                <div><dt>Positive-profile target</dt><dd>{numberFormatter.format(covariate.targetValue)}</dd></div>
                <div><dt>Model weight</dt><dd>{numberFormatter.format(covariate.modelWeight)}</dd></div>
                <div><dt>Source artifact</dt><dd>{covariate.sourcePath}</dd></div>
              </dl>
            </details>
          ))}
          {covariates.length === 0 ? <p className="opsNoVariables">No variable matches this filter.</p> : null}
        </div>
      </section>
    </article>
  );
}

function ProposalInspector({selection}: Readonly<{selection: Extract<Selection, {kind: "proposal"}>}>) {
  const {summary, detail, loading, error} = selection;
  return (
    <article className="opsInspectArticle">
      <p className="opsEyebrow"><span className={summary.collectionId === "regional" ? "opsRegionalDot" : "opsHighresDot"} /> Unvalidated survey hypothesis</p>
      <h1>{summary.collectionId === "regional" ? "Regional morphology proposal" : "Five-metre morphology proposal"}</h1>
      <p className="opsCoordinate">{formatCoordinate(summary.latitude, summary.longitude)}</p>
      <div className="opsMetricGrid">
        <Metric label="Rank percentile" value={`${percentFormatter.format(summary.confidencePercentile * 100)}%`} tip="Where this cell sits in the model's ordering of all 313,941 evaluated cells. 99.9% means only 0.1% of the landscape ranks higher. An ordering, not a probability." />
        <Metric label="Priority score" value={numberFormatter.format(summary.priorityScore)} tip="The raw model score (0–1): the redundancy-weighted average of how closely this cell's environment matches the attested-cave profile across every covariate." />
        <Metric label="Uncertainty" value={numberFormatter.format(summary.uncertainty)} tip="How much the covariates disagree with each other at this cell. High disagreement means only some environmental signals point here — treat the rank more cautiously." />
      </div>
      <div className="opsCaution"><AlertIcon /><p>Rank percentile is a model ordering, not the probability that a cave, cultural place, or artwork exists.</p></div>
      {loading ? <AlgorithmLoading count={summary.algorithmScores.length} /> : null}
      {error ? <p className="opsInlineError" role="alert">{error}</p> : null}
      {detail ? (
        <>
          <section className="opsInspectSection">
            <h2>Why this marker appears</h2>
            <p>{detail.interpretation}</p>
            <dl className="opsMiniLedger"><div><dt>Source cell</dt><dd>{detail.sourceCellId}</dd></div><div><dt>Spatial block</dt><dd>{detail.blockId}</dd></div></dl>
          </section>
          <div className="opsAlgorithms">
            {detail.algorithmResults.map((algorithm, index) => <AlgorithmCard key={algorithm.modelId} algorithm={algorithm} index={index + 1} />)}
            {detail.observationProcess ? <ObservationProcessCard observation={detail.observationProcess} /> : null}
          </div>
          <section className="opsInspectSection">
            <h2>Limits carried with this point</h2>
            <ul className="opsWarnings">{detail.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </section>
        </>
      ) : null}
    </article>
  );
}

function AlgorithmCard({algorithm, index}: Readonly<{algorithm: AlgorithmResult; index: number}>) {
  return (
    <section className="opsAlgorithm">
      <header>
        <span>Algorithm {String(index).padStart(2, "0")}</span>
        <h2>{algorithm.title}</h2>
        <p>{algorithm.modelId}</p>
      </header>
      <div className="opsAlgorithmMetrics">
        <div><span>Rank</span><strong>{percentFormatter.format(algorithm.rankPercentile * 100)}%</strong></div>
        <div><span>Score</span><strong>{numberFormatter.format(algorithm.score)}</strong></div>
        <div><span>Uncertainty</span><strong>{numberFormatter.format(algorithm.uncertainty)}</strong></div>
      </div>
      <div className="opsContributors">
        <h3>All feature contributions</h3>
        {algorithm.contributors.map((contributor) => (
          <div className="opsContributor" key={contributor.column}>
            <div className="opsContributorTop"><strong>{contributor.label}</strong><span>{numberFormatter.format(contributor.rawValue)} {contributor.unit}</span></div>
            <div className="opsContributionTrack"><i style={{width: `${Math.max(1, Math.min(100, contributor.modelContribution * 100))}%`}} /></div>
            <dl>
              <div><dt>Model contribution</dt><dd>{percentFormatter.format(contributor.modelContribution * 100)}%</dd></div>
              <div><dt>Empirical percentile</dt><dd>{percentFormatter.format(contributor.empiricalPercentile * 100)}%</dd></div>
              <div><dt>Weight</dt><dd>{numberFormatter.format(contributor.weight)}</dd></div>
              {contributor.targetValue === null ? null : <div><dt>Positive target</dt><dd>{numberFormatter.format(contributor.targetValue)}</dd></div>}
              <div><dt>Direction</dt><dd>{contributor.direction}</dd></div>
              <div><dt>Transform</dt><dd>{contributor.transform}</dd></div>
            </dl>
            <p>{contributor.rationale}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ObservationProcessCard({observation}: Readonly<{observation: ObservationProcessDetail}>) {
  const residual = observation.occurrenceMinusObservationRank;
  return (
    <section className="opsAlgorithm">
      <header>
        <span>Observation-process diagnostic</span>
        <h2>{observation.title}</h2>
        <p>{observation.indexId}</p>
      </header>
      <div className="opsAlgorithmMetrics">
        <div><span>Availability rank</span><strong>{percentFormatter.format(observation.observationAvailabilityRankPercentile * 100)}%</strong></div>
        <div><span>Under-observed rank</span><strong>{percentFormatter.format(observation.underObservedRankPercentile * 100)}%</strong></div>
        <div><span>Occurrence − observed</span><strong>{residual >= 0 ? "+" : ""}{numberFormatter.format(residual)}</strong></div>
      </div>
      <div className="opsCaution"><AlertIcon /><p>{observation.warning}</p></div>
      <p>{observation.interpretation}</p>
      <p className="opsAlgorithmNote">{observation.residualDefinition}</p>
      <div className="opsContributors">
        <h3>Observation components</h3>
        {observation.components.map((component) => (
          <div className="opsContributor" key={component.componentId}>
            <div className="opsContributorTop"><strong>{component.title}</strong><span>{percentFormatter.format(component.score * 100)}%</span></div>
            <div className="opsContributionTrack"><i style={{width: `${Math.max(1, Math.min(100, component.score * 100))}%`}} /></div>
            <dl>
              <div><dt>Primary index</dt><dd>{component.includedInPrimaryIndex ? "Included" : "Diagnostic only"}</dd></div>
              <div><dt>Combine weight</dt><dd>{numberFormatter.format(component.combineWeight)}</dd></div>
            </dl>
            <p>{component.interpretation}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyInspector({workspace}: Readonly<{workspace: OperationalWorkspace}>) {
  return (
    <article className="opsInspectArticle opsEmptyInspector">
      <p className="opsEyebrow">Operational release</p>
      <h1>Click any point to audit it</h1>
      <p>Known open-data records show their original source and precision. Orange and pink markers expose every model score and contributing environmental measurement.</p>
      <div className="opsCaution"><AlertIcon /><p>{workspace.warning}</p></div>
      <section className="opsInspectSection">
        <h2>Current evidence boundary</h2>
        <ul className="opsWarnings">{workspace.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      </section>
      <section className="opsInspectSection">
        <h2>Open map sources</h2>
        <div className="opsSourceList">{workspace.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><small>{source.licence}</small></a>)}</div>
      </section>
    </article>
  );
}

function Metric({label, value, tip}: Readonly<{label: string; value: string; tip?: string}>) {
  return (
    <div>
      <span>{label}{tip ? <InfoTip text={tip} /> : null}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AlgorithmLoading({count}: Readonly<{count: number}>) {
  return <div className="opsAlgorithmLoading" role="status"><i /><span>Loading {count} algorithm record{count === 1 ? "" : "s"} and all feature contributions…</span></div>;
}

function WorkspaceLoading() {
  return (
    <div className="opsLoadScreen" role="status">
      <div className="opsLoadBrand"><span>LQ</span><strong>Laura Discovery Atlas</strong></div>
      <div className="opsLoadMap"><i /><i /><i /></div>
      <p>Verifying the immutable spatial release and preparing the evidence map…</p>
    </div>
  );
}

function WorkspaceFailure({message}: Readonly<{message: string}>) {
  return <main className="opsFailure"><span>LQ</span><h1>The operational map could not be opened.</h1><p>{message}</p><a href="/admin/research/quinkan/evidence">Open the evidence index</a></main>;
}

function formatCoordinate(latitude: number, longitude: number): string {
  return `${Math.abs(latitude).toFixed(6)}° S · ${longitude.toFixed(6)}° E`;
}

function formatNnttDate(timestamp: number | null): string {
  return timestamp === null ? "Not supplied" : dateFormatter.format(new Date(timestamp));
}

function nativeTitleProperties(properties: Record<string, unknown> | null | undefined): NativeTitleProperties | null {
  if (!properties || typeof properties.Tribunal_ID !== "string" || typeof properties.Name !== "string") return null;
  const text = (key: string) => typeof properties[key] === "string" ? properties[key] as string : "Not supplied";
  const optionalText = (key: string) => typeof properties[key] === "string" ? properties[key] as string : null;
  const numeric = (key: string) => typeof properties[key] === "number" ? properties[key] as number : 0;
  const optionalNumeric = (key: string) => typeof properties[key] === "number" ? properties[key] as number : null;
  return {
    OBJECTID: numeric("OBJECTID"),
    Tribunal_ID: properties.Tribunal_ID,
    Name: properties.Name,
    FC_No: text("FC_No"),
    FC_Name: text("FC_Name"),
    Determination_Date: optionalNumeric("Determination_Date"),
    NNTR_Registration_Date: optionalNumeric("NNTR_Registration_Date"),
    Determined_Method: text("Determined_Method"),
    Determination_Type: text("Determination_Type"),
    Determined_Outcome: text("Determined_Outcome"),
    RNTBC_Name: optionalText("RNTBC_Name"),
    Related_NTDA: optionalText("Related_NTDA"),
    Area_Sqkm: numeric("Area_Sqkm"),
    Date_Currency: optionalNumeric("Date_Currency"),
    NNTT_Seq_No: text("NNTT_Seq_No"),
    Linked_File_No: optionalText("Linked_File_No"),
    Jurisdiction: text("Jurisdiction"),
    Overlap: optionalText("Overlap"),
    Date_extracted: optionalNumeric("Date_extracted"),
    Claimant_Type: text("Claimant_Type"),
  };
}

function nativeTitleBounds(feature: NativeTitleFeature): [[number, number], [number, number]] {
  const pairs: Array<[number, number]> = [];
  collectCoordinatePairs(feature.geometry.coordinates, pairs);
  const longitudes = pairs.map(([longitude]) => longitude);
  const latitudes = pairs.map(([, latitude]) => latitude);
  return [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]];
}

function collectCoordinatePairs(value: unknown, pairs: Array<[number, number]>): void {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    pairs.push([value[0], value[1]]);
    return;
  }
  for (const child of value) collectCoordinatePairs(child, pairs);
}

function humanizeColumn(column: string): string {
  return column.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function LayersIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Zm-7.5 9.5L12 17l7.5-4.5M4.5 17 12 21l7.5-4" /></svg>;
}

function InspectIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 5 5M11 8v6M8 11h6" /></svg>;
}

function AlertIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v5M12 17.5v.1" /></svg>;
}
