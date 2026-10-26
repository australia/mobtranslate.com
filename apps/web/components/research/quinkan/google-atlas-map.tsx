/// <reference types="google.maps" />
"use client";

import type {Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position} from "geojson";
import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from "react";
import {loadGoogleMaps} from "@/lib/research/quinkan/google-maps-loader";
import type {ContextAtlas, FieldObservation, KnownLocation, OperationalWorkspace, ProposalMarker} from "@/lib/research/quinkan/workspace-types";

export type GoogleMapType = "roadmap" | "satellite" | "hybrid" | "terrain" | "research";
export type MeasurementMode = "distance" | "area";
export type GoogleReferenceLayers = Readonly<{traffic: boolean; transit: boolean; bicycling: boolean}>;
export type GoogleLayerSettings = Readonly<{
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
export type NativeTitleProperties = Readonly<{
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

type NativeTitleCollection = FeatureCollection<Polygon | MultiPolygon, NativeTitleProperties>;
type PublicPhoto = Readonly<{
  title: string;
  thumbUrl: string;
  pageUrl: string;
  license: string;
  author: string;
  source: string;
  observedOn?: string;
}>;

export type GoogleAtlasHandle = Readonly<{
  fitRegion: () => void;
  focus: (longitude: number, latitude: number, minimumZoom: number) => void;
  fitBounds: (west: number, south: number, east: number, north: number, maxZoom?: number) => void;
  markCoordinate: (longitude: number, latitude: number, minimumZoom?: number) => void;
  locateUser: () => void;
  openStreetView: () => void;
  closeStreetView: () => void;
  zoomToBestImagery: () => void;
  resetNorth: () => void;
}>;

type Measurement = Readonly<{distanceMetres: number | null; areaSquareMetres: number | null}>;
type GoogleAtlasProps = Readonly<{
  apiKey: string;
  workspace: OperationalWorkspace;
  contextAtlas: ContextAtlas;
  knownGeoJson: FeatureCollection;
  knownUncertaintyGeoJson: FeatureCollection;
  fieldGeoJson: FeatureCollection;
  regionalGeoJson: FeatureCollection;
  highResolutionGeoJson: FeatureCollection;
  shortlistGeoJson: FeatureCollection;
  nativeTitles: NativeTitleCollection | null;
  layers: GoogleLayerSettings;
  threshold: number;
  overlayOpacity: number;
  activeOverlays: ReadonlySet<string>;
  mapType: GoogleMapType;
  referenceLayers: GoogleReferenceLayers;
  measuring: boolean;
  measurementMode: MeasurementMode;
  threeDimensional: boolean;
  onCoordinate: (coordinate: [number, number]) => void;
  onMeasurement: (measurement: Measurement) => void;
  onKnown: (location: KnownLocation) => void;
  onField: (observation: FieldObservation) => void;
  onProposal: (proposal: ProposalMarker) => void;
  onNativeTitle: (determination: NativeTitleProperties) => void;
  onPhoto: (photo: PublicPhoto) => void;
  onStatus: (message: string | null) => void;
  onError: (message: string | null) => void;
}>;

type RuntimeLayers = {
  known?: google.maps.Data;
  knownUncertainty?: google.maps.Data;
  field?: google.maps.Data;
  regional?: google.maps.Data;
  highResolution?: google.maps.Data;
  shortlist?: google.maps.Data;
  heritage?: google.maps.Data;
  projects?: google.maps.Data;
  tiles?: google.maps.Data;
  nativeTitle?: google.maps.Data;
  photos?: google.maps.Data;
  roadsCasing?: google.maps.Data;
  roads?: google.maps.Data;
  waterCasing?: google.maps.Data;
  water?: google.maps.Data;
  tools?: google.maps.Data;
};

type LabelCandidate = Readonly<{name: string; latitude: number; longitude: number; kind: "road" | "water"; priority: number}>;

const mapReferenceBaseUrl = "/api/admin/research/quinkan/static/map-data/v1-20260811";

function featureString(feature: google.maps.Data.Feature, key: string): string | null {
  const value = feature.getProperty(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function featureNumber(feature: google.maps.Data.Feature, key: string): number | null {
  const value = Number(feature.getProperty(key));
  return Number.isFinite(value) ? value : null;
}

function dataLayer(map: google.maps.Map, collection?: FeatureCollection): google.maps.Data {
  const layer = new google.maps.Data({map});
  if (collection) layer.addGeoJson(collection);
  return layer;
}

function lineCoordinates(geometry: Geometry | null): Position[][] {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function lineMidpoint(lines: Position[][]): [number, number] | null {
  const segments: Array<{start: Position; end: Position; length: number}> = [];
  let total = 0;
  for (const line of lines) {
    for (let index = 1; index < line.length; index += 1) {
      const start = line[index - 1];
      const end = line[index];
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      segments.push({start, end, length});
      total += length;
    }
  }
  if (segments.length === 0) return null;
  let walked = 0;
  for (const segment of segments) {
    if (walked + segment.length >= total / 2) {
      const fraction = segment.length === 0 ? 0 : (total / 2 - walked) / segment.length;
      return [
        segment.start[0] + (segment.end[0] - segment.start[0]) * fraction,
        segment.start[1] + (segment.end[1] - segment.start[1]) * fraction,
      ];
    }
    walked += segment.length;
  }
  const final = segments.at(-1)?.end;
  return final ? [final[0], final[1]] : null;
}

function labelCandidates(collection: FeatureCollection, kind: "road" | "water"): LabelCandidate[] {
  const candidates: LabelCandidate[] = [];
  for (const feature of collection.features) {
    const rawName = kind === "road" ? feature.properties?.road_name_full : feature.properties?.name;
    if (typeof rawName !== "string" || rawName.trim().length === 0) continue;
    const midpoint = lineMidpoint(lineCoordinates(feature.geometry));
    if (!midpoint) continue;
    const streamOrder = Number(feature.properties?.stream_order ?? 0);
    candidates.push({
      name: rawName.trim(),
      longitude: midpoint[0],
      latitude: midpoint[1],
      kind,
      priority: kind === "road" ? 100 : streamOrder,
    });
  }
  return candidates.sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));
}

function quadTransform(points: readonly google.maps.Point[]): string | null {
  if (points.length !== 4) return null;
  const [p0, p1, p2, p3] = points;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(denominator) < 1e-8) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / denominator;
  const h = (dx1 * dy3 - dx3 * dy1) / denominator;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,1)`;
}

function mapBounds(workspace: OperationalWorkspace): google.maps.LatLngBoundsLiteral {
  return {west: workspace.bounds.west, south: workspace.bounds.south, east: workspace.bounds.east, north: workspace.bounds.north};
}

export const GoogleAtlasMap = forwardRef<GoogleAtlasHandle, GoogleAtlasProps>(function GoogleAtlasMap(props, forwardedRef) {
  const mapNode = useRef<HTMLDivElement>(null);
  const threeDimensionalNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const threeDimensionalRef = useRef<google.maps.maps3d.Map3DElement | null>(null);
  const runtimeLayers = useRef<RuntimeLayers>({});
  const quadOverlays = useRef<Map<string, google.maps.OverlayView>>(new Map());
  const labelOverlay = useRef<(google.maps.OverlayView & {setVisible: (visible: boolean) => void}) | null>(null);
  const trafficLayer = useRef<google.maps.TrafficLayer | null>(null);
  const transitLayer = useRef<google.maps.TransitLayer | null>(null);
  const bicyclingLayer = useRef<google.maps.BicyclingLayer | null>(null);
  const locationCircle = useRef<google.maps.Circle | null>(null);
  const measurementPoints = useRef<google.maps.LatLng[]>([]);
  const propsRef = useRef(props);
  const [ready, setReady] = useState(false);
  const [streetViewOpen, setStreetViewOpen] = useState(false);
  const [zoomRevision, setZoomRevision] = useState(0);
  propsRef.current = props;

  useImperativeHandle(forwardedRef, () => ({
    fitRegion() {
      mapRef.current?.fitBounds(mapBounds(props.workspace), 64);
      if (threeDimensionalRef.current) {
        threeDimensionalRef.current.center = {
          lat: (props.workspace.bounds.south + props.workspace.bounds.north) / 2,
          lng: (props.workspace.bounds.west + props.workspace.bounds.east) / 2,
          altitude: 0,
        };
        threeDimensionalRef.current.range = 70000;
      }
    },
    focus(longitude, latitude, minimumZoom) {
      const map = mapRef.current;
      if (map) {
        map.panTo({lng: longitude, lat: latitude});
        map.setZoom(Math.max(map.getZoom() ?? 0, minimumZoom));
      }
      if (threeDimensionalRef.current) {
        threeDimensionalRef.current.center = {lat: latitude, lng: longitude, altitude: 0};
        threeDimensionalRef.current.range = minimumZoom >= 14 ? 2500 : 9000;
      }
    },
    fitBounds(west, south, east, north, maxZoom) {
      const map = mapRef.current;
      if (!map) return;
      map.fitBounds({west, south, east, north}, 70);
      if (maxZoom !== undefined) google.maps.event.addListenerOnce(map, "idle", () => map.setZoom(Math.min(map.getZoom() ?? maxZoom, maxZoom)));
    },
    markCoordinate(longitude, latitude, minimumZoom = 14) {
      const tools = runtimeLayers.current.tools;
      if (tools) {
        tools.forEach((feature) => {
          if (feature.getProperty("kind") === "goto") tools.remove(feature);
        });
        tools.add({geometry: new google.maps.Data.Point({lng: longitude, lat: latitude}), properties: {kind: "goto"}});
      }
      const map = mapRef.current;
      map?.panTo({lng: longitude, lat: latitude});
      map?.setZoom(Math.max(map.getZoom() ?? 0, minimumZoom));
    },
    locateUser() {
      if (!navigator.geolocation) {
        propsRef.current.onError("This browser does not provide location access.");
        return;
      }
      propsRef.current.onStatus("Requesting browser location…");
      navigator.geolocation.getCurrentPosition((position) => {
        const center = {lat: position.coords.latitude, lng: position.coords.longitude};
        const map = mapRef.current;
        if (!map) return;
        locationCircle.current?.setMap(null);
        locationCircle.current = new google.maps.Circle({
          map,
          center,
          radius: Math.max(position.coords.accuracy, 5),
          fillColor: "#137fbb",
          fillOpacity: 0.13,
          strokeColor: "#07557d",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          clickable: false,
        });
        map.panTo(center);
        map.setZoom(Math.max(map.getZoom() ?? 0, 15));
        propsRef.current.onStatus(`Location fix ±${Math.round(position.coords.accuracy)} m.`);
      }, (error) => propsRef.current.onError(`Location unavailable: ${error.message}`), {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000});
    },
    openStreetView() {
      const map = mapRef.current;
      const center = map?.getCenter();
      if (!map || !center) return;
      propsRef.current.onStatus("Finding the nearest Street View panorama…");
      const service = new google.maps.StreetViewService();
      service.getPanorama({location: center, radius: 50000, preference: google.maps.StreetViewPreference.NEAREST}, (data, status) => {
        if (status !== google.maps.StreetViewStatus.OK || !data?.location?.latLng) {
          propsRef.current.onError("No Street View panorama was found within 50 km of the current map centre.");
          return;
        }
        const panorama = map.getStreetView();
        if (data.location.pano) panorama.setPano(data.location.pano);
        else panorama.setPosition(data.location.latLng);
        panorama.setPov({heading: 0, pitch: 0});
        panorama.setVisible(true);
        propsRef.current.onStatus("Street View opened at the nearest available panorama.");
      });
    },
    closeStreetView() {
      mapRef.current?.getStreetView().setVisible(false);
    },
    zoomToBestImagery() {
      const map = mapRef.current;
      const center = map?.getCenter();
      if (!map || !center) return;
      new google.maps.MaxZoomService().getMaxZoomAtLatLng(center, (result) => {
        if (result.status !== google.maps.MaxZoomStatus.OK) {
          propsRef.current.onError("Google could not report the maximum imagery zoom here.");
          return;
        }
        map.setZoom(result.zoom);
        propsRef.current.onStatus(`Zoomed to Google imagery level ${result.zoom}.`);
      });
    },
    resetNorth() {
      mapRef.current?.setHeading(0);
      if (threeDimensionalRef.current) threeDimensionalRef.current.heading = 0;
    },
  }), [props.workspace]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];
    const fetchController = new AbortController();
    const mapErrorObserver = new MutationObserver(() => {
      if (!mapNode.current?.querySelector(".gm-err-container, a[href*='g.co/dev/maps-no-account']")) return;
      propsRef.current.onError("Google Maps rejected the map request. Enable billing and check this website's key restrictions.");
    });
    mapErrorObserver.observe(mapNode.current, {childList: true, subtree: true});

    void loadGoogleMaps(props.apiKey).then(async () => {
      if (cancelled || !mapNode.current) return;
      await Promise.all([google.maps.importLibrary("maps"), google.maps.importLibrary("geometry"), google.maps.importLibrary("streetView")]);
      if (cancelled || !mapNode.current) return;

      const map = new google.maps.Map(mapNode.current, {
        center: {
          lat: (props.workspace.bounds.south + props.workspace.bounds.north) / 2,
          lng: (props.workspace.bounds.west + props.workspace.bounds.east) / 2,
        },
        zoom: 8,
        mapTypeId: props.mapType === "research" ? "research" : props.mapType,
        mapTypeControl: false,
        fullscreenControl: true,
        fullscreenControlOptions: {position: google.maps.ControlPosition.LEFT_BOTTOM},
        streetViewControl: true,
        streetViewControlOptions: {position: google.maps.ControlPosition.LEFT_BOTTOM},
        zoomControl: true,
        zoomControlOptions: {position: google.maps.ControlPosition.LEFT_BOTTOM},
        scaleControl: true,
        rotateControl: true,
        keyboardShortcuts: true,
        gestureHandling: "cooperative",
        clickableIcons: false,
        backgroundColor: "#dbe1de",
        restriction: {latLngBounds: mapBounds(props.workspace), strictBounds: false},
      });
      mapRef.current = map;

      const researchMap = new google.maps.StyledMapType([
        {featureType: "poi", stylers: [{visibility: "simplified"}]},
        {featureType: "poi.business", stylers: [{visibility: "off"}]},
        {featureType: "landscape.natural", elementType: "geometry", stylers: [{color: "#dce7dc"}]},
        {featureType: "water", elementType: "geometry", stylers: [{color: "#b9d8df"}]},
        {featureType: "road", elementType: "geometry", stylers: [{color: "#f7f3e8"}]},
        {featureType: "road", elementType: "labels.text.fill", stylers: [{color: "#50493c"}]},
      ], {name: "Research"});
      map.mapTypes.set("research", researchMap);
      map.fitBounds(mapBounds(props.workspace), 64);

      const layers = runtimeLayers.current;
      layers.known = dataLayer(map, props.knownGeoJson);
      layers.knownUncertainty = dataLayer(map, props.knownUncertaintyGeoJson);
      layers.field = dataLayer(map, props.fieldGeoJson);
      layers.regional = dataLayer(map, props.regionalGeoJson);
      layers.highResolution = dataLayer(map, props.highResolutionGeoJson);
      layers.shortlist = dataLayer(map, props.shortlistGeoJson);
      layers.tools = dataLayer(map);
      for (const context of props.contextAtlas.layers) {
        const target = dataLayer(map, context.feature_collection as unknown as FeatureCollection);
        if (context.layer_id === "public_heritage_acquisition_frame") layers.heritage = target;
        else if (context.layer_id === "qld_elevation_project_coverage") layers.projects = target;
        else if (context.layer_id === "qld_elevation_tile_coverage") layers.tiles = target;
        else target.setMap(null);
      }
      if (props.nativeTitles) layers.nativeTitle = dataLayer(map, props.nativeTitles);

      const attachPointer = (layer: google.maps.Data) => {
        listeners.push(layer.addListener("mouseover", () => { map.getDiv().style.cursor = "pointer"; }));
        listeners.push(layer.addListener("mouseout", () => { map.getDiv().style.cursor = ""; }));
      };
      const clickById = (layer: google.maps.Data, kind: "known" | "field" | "proposal") => {
        attachPointer(layer);
        listeners.push(layer.addListener("click", (event: google.maps.Data.MouseEvent) => {
          if (propsRef.current.measuring) return;
          const id = featureString(event.feature, "id");
          if (!id) return;
          if (kind === "known") {
            const location = propsRef.current.workspace.knownLocations.find((item) => item.id === id);
            if (location) propsRef.current.onKnown(location);
          } else if (kind === "field") {
            const observation = propsRef.current.workspace.fieldObservations.find((item) => item.id === id);
            if (observation) propsRef.current.onField(observation);
          } else {
            const proposal = propsRef.current.workspace.proposals.find((item) => item.id === id);
            if (proposal) propsRef.current.onProposal(proposal);
          }
        }));
      };
      clickById(layers.known, "known");
      clickById(layers.field, "field");
      clickById(layers.regional, "proposal");
      clickById(layers.highResolution, "proposal");
      clickById(layers.shortlist, "proposal");
      if (layers.nativeTitle) {
        attachPointer(layers.nativeTitle);
        listeners.push(layers.nativeTitle.addListener("click", (event: google.maps.Data.MouseEvent) => {
          if (propsRef.current.measuring) return;
          const tribunalId = featureString(event.feature, "Tribunal_ID");
          const determination = propsRef.current.nativeTitles?.features.find((feature) => feature.properties.Tribunal_ID === tribunalId)?.properties;
          if (determination) propsRef.current.onNativeTitle(determination);
        }));
      }

      class QuadImageOverlay extends google.maps.OverlayView {
        #image: HTMLImageElement | null = null;
        #opacity = 0.5;
        constructor(readonly url: string, readonly corners: OperationalWorkspace["imageCorners"]) { super(); }
        setOpacity(opacity: number) {
          this.#opacity = opacity;
          if (this.#image) this.#image.style.opacity = String(opacity);
        }
        onAdd() {
          const image = document.createElement("img");
          image.src = this.url;
          image.alt = "";
          image.className = "googleQuadOverlay";
          image.style.opacity = String(this.#opacity);
          this.#image = image;
          this.getPanes()?.overlayLayer.append(image);
        }
        draw() {
          if (!this.#image) return;
          const projection = this.getProjection();
          const points = this.corners.map(([lng, lat]) => projection.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng)));
          if (points.some((point) => point === null)) return;
          const transform = quadTransform(points as google.maps.Point[]);
          if (transform) this.#image.style.transform = transform;
        }
        onRemove() {
          this.#image?.remove();
          this.#image = null;
        }
      }
      for (const overlay of props.workspace.overlays) {
        const instance = new QuadImageOverlay(overlay.assetUrl, props.workspace.imageCorners);
        instance.setOpacity(props.overlayOpacity / 100);
        quadOverlays.current.set(overlay.id, instance);
      }

      class FieldLabelOverlay extends google.maps.OverlayView {
        #container: HTMLDivElement | null = null;
        #visible = true;
        #candidates: LabelCandidate[] = [];
        setCandidates(candidates: LabelCandidate[]) { this.#candidates = candidates; this.draw(); }
        setVisible(visible: boolean) { this.#visible = visible; this.draw(); }
        onAdd() {
          this.#container = document.createElement("div");
          this.#container.className = "googleFieldLabels";
          this.getPanes()?.overlayLayer.append(this.#container);
        }
        draw() {
          if (!this.#container) return;
          this.#container.replaceChildren();
          if (!this.#visible || (map.getZoom() ?? 0) < 7) return;
          const projection = this.getProjection();
          const bounds = map.getBounds();
          if (!bounds) return;
          const occupied = new Set<string>();
          const shownNames = new Map<string, number>();
          let count = 0;
          for (const candidate of this.#candidates) {
            if (count >= 160) break;
            const location = new google.maps.LatLng(candidate.latitude, candidate.longitude);
            if (!bounds.contains(location)) continue;
            const point = projection.fromLatLngToDivPixel(location);
            if (!point) continue;
            const cell = `${Math.round(point.x / 120)}:${Math.round(point.y / 38)}`;
            const repeated = shownNames.get(candidate.name) ?? 0;
            if (occupied.has(cell) || repeated >= 3) continue;
            occupied.add(cell);
            shownNames.set(candidate.name, repeated + 1);
            const label = document.createElement("span");
            label.className = `googleFieldLabel is${candidate.kind === "road" ? "Road" : "Water"}`;
            label.textContent = candidate.name;
            label.style.left = `${point.x}px`;
            label.style.top = `${point.y}px`;
            this.#container.append(label);
            count += 1;
          }
        }
        onRemove() { this.#container?.remove(); this.#container = null; }
      }
      const labels = new FieldLabelOverlay();
      labels.setMap(map);
      labelOverlay.current = labels;

      trafficLayer.current = new google.maps.TrafficLayer();
      transitLayer.current = new google.maps.TransitLayer();
      bicyclingLayer.current = new google.maps.BicyclingLayer();

      const panorama = map.getStreetView();
      listeners.push(panorama.addListener("visible_changed", () => setStreetViewOpen(panorama.getVisible())));
      listeners.push(map.addListener("zoom_changed", () => setZoomRevision((revision) => revision + 1)));
      listeners.push(map.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (!event.latLng) return;
        const coordinate: [number, number] = [event.latLng.lng(), event.latLng.lat()];
        propsRef.current.onCoordinate(coordinate);
        if (!propsRef.current.measuring) return;
        measurementPoints.current.push(event.latLng);
        updateMeasurementLayer();
      }));

      const fetched = await Promise.allSettled([
        fetch(`${mapReferenceBaseUrl}/photos.geojson`, {signal: fetchController.signal}).then((response) => response.ok ? response.json() as Promise<FeatureCollection> : Promise.reject(new Error(`photos returned ${response.status}`))),
        fetch(`${mapReferenceBaseUrl}/roads.geojson`, {signal: fetchController.signal}).then((response) => response.ok ? response.json() as Promise<FeatureCollection> : Promise.reject(new Error(`roads returned ${response.status}`))),
        fetch(`${mapReferenceBaseUrl}/watercourses.geojson`, {signal: fetchController.signal}).then((response) => response.ok ? response.json() as Promise<FeatureCollection> : Promise.reject(new Error(`watercourses returned ${response.status}`))),
      ]);
      if (cancelled) return;
      const [photosResult, roadsResult, watercoursesResult] = fetched;
      if (photosResult.status === "fulfilled") {
        layers.photos = dataLayer(map, photosResult.value);
        attachPointer(layers.photos);
        listeners.push(layers.photos.addListener("click", (event: google.maps.Data.MouseEvent) => {
          if (propsRef.current.measuring) return;
          const thumbUrl = featureString(event.feature, "thumbUrl");
          const pageUrl = featureString(event.feature, "pageUrl");
          if (!thumbUrl || !pageUrl) return;
          propsRef.current.onPhoto({
            title: featureString(event.feature, "title") ?? "Photo",
            thumbUrl,
            pageUrl,
            license: featureString(event.feature, "license") ?? "",
            author: featureString(event.feature, "author") ?? "",
            source: featureString(event.feature, "source") ?? "",
            observedOn: featureString(event.feature, "observedOn") ?? undefined,
          });
        }));
      }
      const labelsToDisplay: LabelCandidate[] = [];
      if (roadsResult.status === "fulfilled") {
        layers.roadsCasing = dataLayer(map, roadsResult.value);
        layers.roads = dataLayer(map, roadsResult.value);
        labelsToDisplay.push(...labelCandidates(roadsResult.value, "road"));
      }
      if (watercoursesResult.status === "fulfilled") {
        layers.waterCasing = dataLayer(map, watercoursesResult.value);
        layers.water = dataLayer(map, watercoursesResult.value);
        labelsToDisplay.push(...labelCandidates(watercoursesResult.value, "water"));
      }
      labels.setCandidates(labelsToDisplay);
      const failedReferences = fetched.filter((result) => result.status === "rejected").length;

      function updateMeasurementLayer() {
        const tools = runtimeLayers.current.tools;
        if (!tools) return;
        tools.forEach((feature) => {
          if (feature.getProperty("kind") !== "goto") tools.remove(feature);
        });
        const points = measurementPoints.current;
        for (const point of points) tools.add({geometry: new google.maps.Data.Point(point), properties: {kind: "measure-point"}});
        if (propsRef.current.measurementMode === "area" && points.length >= 3) {
          tools.add({geometry: new google.maps.Data.Polygon([points]), properties: {kind: "measure-area"}});
          propsRef.current.onMeasurement({distanceMetres: null, areaSquareMetres: google.maps.geometry.spherical.computeArea(points)});
        } else if (points.length >= 2) {
          tools.add({geometry: new google.maps.Data.LineString(points), properties: {kind: "measure-line"}});
          propsRef.current.onMeasurement({distanceMetres: google.maps.geometry.spherical.computeLength(points), areaSquareMetres: null});
        } else {
          propsRef.current.onMeasurement({distanceMetres: propsRef.current.measurementMode === "distance" ? 0 : null, areaSquareMetres: propsRef.current.measurementMode === "area" ? 0 : null});
        }
      }
      (runtimeLayers.current as RuntimeLayers & {updateMeasurement?: () => void}).updateMeasurement = updateMeasurementLayer;

      setReady(true);
      propsRef.current.onError(null);
      propsRef.current.onStatus(failedReferences === 0
        ? "Google Maps loaded with the verified public atlas layers."
        : `Google Maps loaded; ${failedReferences} optional reference layer${failedReferences === 1 ? "" : "s"} could not be fetched.`);
    }).catch((caught: unknown) => {
      if (cancelled || (caught instanceof DOMException && caught.name === "AbortError")) return;
      propsRef.current.onError(caught instanceof Error ? caught.message : "Google Maps could not be initialized.");
    });

    return () => {
      cancelled = true;
      fetchController.abort();
      mapErrorObserver.disconnect();
      for (const listener of listeners) listener.remove();
      for (const layer of Object.values(runtimeLayers.current)) {
        if (typeof layer === "object" && layer !== null && "setMap" in layer) layer.setMap(null);
      }
      for (const overlay of quadOverlays.current.values()) overlay.setMap(null);
      quadOverlays.current.clear();
      labelOverlay.current?.setMap(null);
      trafficLayer.current?.setMap(null);
      transitLayer.current?.setMap(null);
      bicyclingLayer.current?.setMap(null);
      locationCircle.current?.setMap(null);
      runtimeLayers.current = {};
      mapRef.current = null;
      setReady(false);
    };
  }, [props.apiKey, props.contextAtlas, props.fieldGeoJson, props.highResolutionGeoJson, props.knownGeoJson, props.knownUncertaintyGeoJson, props.nativeTitles, props.regionalGeoJson, props.shortlistGeoJson, props.workspace]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const runtime = runtimeLayers.current;
    if (!map) return;
    const zoom = map.getZoom() ?? 8;
    const point = (color: string, scale: number, strokeColor = "#17231f"): google.maps.Data.StyleOptions => ({
      icon: {path: google.maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 0.92, strokeColor, strokeOpacity: 1, strokeWeight: 1.5, scale},
    });
    runtime.known?.setStyle((feature) => ({...point(featureString(feature, "id") === "osm-jowalbinna-camp" ? "#f4b52f" : "#00a67a", 6), visible: props.layers.known, zIndex: 70}));
    runtime.knownUncertainty?.setStyle({fillColor: "#d58a1f", fillOpacity: 0.09, strokeColor: "#a5660f", strokeOpacity: 0.85, strokeWeight: 1.2, visible: props.layers.known, clickable: false});
    runtime.field?.setStyle((feature) => {
      const role = featureString(feature, "role");
      const visible = role === "camp" ? props.layers.camp : props.layers.field;
      const color = role === "camp" ? "#137fbb" : role?.includes("cave") ? "#c43d3d" : "#753bbd";
      return {...point(color, role === "camp" ? 7 : 6), visible, zIndex: 90};
    });
    runtime.regional?.setStyle((feature) => ({...point("#f4a62a", zoom >= 12 ? 4.5 : 3.2), visible: props.layers.regional && (featureNumber(feature, "confidencePercentile") ?? 0) * 100 >= props.threshold, zIndex: 35}));
    runtime.highResolution?.setStyle((feature) => ({...point("#e0528d", zoom >= 12 ? 4.5 : 3.2), visible: props.layers.highResolution && (featureNumber(feature, "confidencePercentile") ?? 0) * 100 >= props.threshold, zIndex: 40}));
    runtime.shortlist?.setStyle((feature) => ({...point("#7a3fe0", 6.5, "#2f1760"), visible: props.layers.shortlist, zIndex: 60, title: `S${featureNumber(feature, "shortlistRank") ?? ""}`}));
    runtime.heritage?.setStyle({fillColor: "#2962ff", fillOpacity: 0.07, strokeColor: "#2962ff", strokeOpacity: 0.9, strokeWeight: 2.2, visible: props.layers.heritage, clickable: false});
    runtime.projects?.setStyle({fillColor: "#00a7bb", fillOpacity: 0.05, strokeColor: "#00a7bb", strokeOpacity: 0.85, strokeWeight: 1.6, visible: props.layers.projects, clickable: false});
    runtime.tiles?.setStyle({fillOpacity: 0, strokeColor: "#7856d8", strokeOpacity: 0.7, strokeWeight: 0.8, visible: props.layers.tiles, clickable: false});
    runtime.nativeTitle?.setStyle({fillColor: "#b4238a", fillOpacity: 0.1, strokeColor: "#7b145e", strokeOpacity: 0.95, strokeWeight: 2.3, visible: props.layers.nativeTitle, zIndex: 15});
    runtime.photos?.setStyle((feature) => ({...point(featureString(feature, "source") === "wikimedia-commons" ? "#f2b134" : "#8fd0c3", zoom >= 12 ? 4.8 : 3), visible: props.layers.photos, zIndex: 30}));
    runtime.roadsCasing?.setStyle({strokeColor: "#1c1204", strokeOpacity: 0.98, strokeWeight: zoom >= 12 ? 7 : 4, visible: props.layers.fieldReference, clickable: false, zIndex: 20});
    runtime.roads?.setStyle({strokeColor: "#ff9f1c", strokeOpacity: 1, strokeWeight: zoom >= 12 ? 4.5 : 2.3, visible: props.layers.fieldReference, clickable: false, zIndex: 21});
    runtime.waterCasing?.setStyle({strokeColor: "#052b4a", strokeOpacity: 0.95, strokeWeight: zoom >= 12 ? 5 : 3, visible: props.layers.fieldReference, clickable: false, zIndex: 18});
    runtime.water?.setStyle({strokeColor: "#1ed2ff", strokeOpacity: 0.95, strokeWeight: zoom >= 12 ? 2.8 : 1.5, visible: props.layers.fieldReference, clickable: false, zIndex: 19});
    runtime.tools?.setStyle((feature) => {
      const kind = featureString(feature, "kind");
      if (kind === "goto") return {...point("#ffd166", 8), zIndex: 100};
      if (kind === "measure-point") return {...point("#ffd166", 4), zIndex: 101};
      if (kind === "measure-area") return {fillColor: "#ffd166", fillOpacity: 0.16, strokeColor: "#8b5a00", strokeOpacity: 1, strokeWeight: 2.5, zIndex: 100};
      return {strokeColor: "#8b5a00", strokeOpacity: 1, strokeWeight: 2.5, zIndex: 100};
    });
    labelOverlay.current?.setVisible(props.layers.fieldReference);
    for (const overlay of props.workspace.overlays) {
      const instance = quadOverlays.current.get(overlay.id);
      if (!instance) continue;
      (instance as google.maps.OverlayView & {setOpacity: (opacity: number) => void}).setOpacity(props.overlayOpacity / 100);
      instance.setMap(props.activeOverlays.has(overlay.id) ? map : null);
    }
    trafficLayer.current?.setMap(props.referenceLayers.traffic ? map : null);
    transitLayer.current?.setMap(props.referenceLayers.transit ? map : null);
    bicyclingLayer.current?.setMap(props.referenceLayers.bicycling ? map : null);
  }, [props.activeOverlays, props.layers, props.overlayOpacity, props.referenceLayers, props.threshold, props.workspace.overlays, ready, zoomRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setMapTypeId(props.mapType === "research" ? "research" : props.mapType);
  }, [props.mapType, ready]);

  useEffect(() => {
    if (!ready || props.measuring) {
      if (props.measuring) {
        measurementPoints.current = [];
        props.onMeasurement({distanceMetres: props.measurementMode === "distance" ? 0 : null, areaSquareMetres: props.measurementMode === "area" ? 0 : null});
        (runtimeLayers.current as RuntimeLayers & {updateMeasurement?: () => void}).updateMeasurement?.();
      }
      return;
    }
  }, [props.measurementMode, props.measuring, props.onMeasurement, ready]);

  useEffect(() => {
    if (!props.threeDimensional || !threeDimensionalNode.current || threeDimensionalRef.current) return;
    let cancelled = false;
    void loadGoogleMaps(props.apiKey).then(async () => {
      const {Map3DElement, MapMode, Marker3DInteractiveElement, AltitudeMode} = await google.maps.importLibrary("maps3d");
      if (cancelled || !threeDimensionalNode.current) return;
      const map = new Map3DElement({
        center: {
          lat: (props.workspace.bounds.south + props.workspace.bounds.north) / 2,
          lng: (props.workspace.bounds.west + props.workspace.bounds.east) / 2,
          altitude: 0,
        },
        range: 70000,
        tilt: 55,
        heading: 22,
        mode: MapMode.HYBRID,
        bounds: mapBounds(props.workspace),
        gestureHandling: "COOPERATIVE",
        description: "Photorealistic three-dimensional view of the public Laura–Quinkan atlas region.",
      });
      map.className = "googleMap3D";
      for (const observation of props.workspace.fieldObservations) {
        const marker = new Marker3DInteractiveElement({
          position: {lat: observation.latitude, lng: observation.longitude, altitude: 0},
          altitudeMode: AltitudeMode.CLAMP_TO_GROUND,
          label: observation.workingName || observation.role,
          sizePreserved: true,
          zIndex: 10,
        });
        marker.addEventListener("gmp-click", () => propsRef.current.onField(observation));
        map.append(marker);
      }
      for (const feature of props.shortlistGeoJson.features.slice(0, 60)) {
        if (feature.geometry.type !== "Point") continue;
        const proposal = props.workspace.proposals.find((item) => item.id === feature.properties?.id);
        if (!proposal) continue;
        const marker = new Marker3DInteractiveElement({
          position: {lat: proposal.latitude, lng: proposal.longitude, altitude: 0},
          altitudeMode: AltitudeMode.CLAMP_TO_GROUND,
          label: `S${feature.properties?.shortlistRank ?? ""}`,
          sizePreserved: true,
          zIndex: 5,
        });
        marker.addEventListener("gmp-click", () => propsRef.current.onProposal(proposal));
        map.append(marker);
      }
      map.addEventListener("gmp-click", (event) => {
        if (!(event instanceof google.maps.maps3d.LocationClickEvent) || !event.position) return;
        propsRef.current.onCoordinate([event.position.lng, event.position.lat]);
      });
      threeDimensionalNode.current.append(map);
      threeDimensionalRef.current = map;
      propsRef.current.onStatus("Google photorealistic 3D loaded with field and shortlist markers.");
    }).catch((caught: unknown) => {
      if (!cancelled) propsRef.current.onError(caught instanceof Error ? caught.message : "Google 3D could not be initialized.");
    });
    return () => {
      cancelled = true;
      threeDimensionalRef.current?.remove();
      threeDimensionalRef.current = null;
    };
  }, [props.apiKey, props.shortlistGeoJson.features, props.threeDimensional, props.workspace]);

  return (
    <div className={`googleAtlasFrame ${props.threeDimensional ? "isThreeDimensional" : ""}`}>
      <div ref={mapNode} className="googleAtlasCanvas" aria-label="Google Maps view of the public Laura–Quinkan atlas" />
      <div ref={threeDimensionalNode} className="googleAtlas3DCanvas" aria-label="Google photorealistic three-dimensional view of the public Laura–Quinkan atlas" />
      {!ready && !props.threeDimensional ? <div className="googleMapLoading" role="status">Loading Google Maps and public evidence layers…</div> : null}
      {streetViewOpen ? <button className="googleStreetViewClose" type="button" onClick={() => mapRef.current?.getStreetView().setVisible(false)}>Return to atlas</button> : null}
      {props.threeDimensional ? <div className="google3DNote">Google photorealistic 3D · field observations + 60-target shortlist · model rank only</div> : null}
    </div>
  );
});
