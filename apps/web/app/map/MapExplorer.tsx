'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  MAPLIBRE_JS,
  MAPLIBRE_CSS,
  BASEMAP,
  AU_BOUNDS,
  OTHER_COLOR,
  ISOLATE_COLOR,
  NOT_CODED,
  CLUSTER_COLORS,
  buildFamilyColors,
  buildFeatureColors,
  ENDANGERMENT_LABEL,
  DOMAIN_ORDER,
  austlangUrl,
  glottologUrl,
  type Mode,
  type PointProps,
  type FeatureCatalogItem,
  type Neighbour,
} from './mapConfig';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface MetaData {
  counts: {
    points: number;
    with_typology: number;
    with_grambank: number;
    with_dictionary: number;
    registry_total: number;
    grambank_assessed: number;
  };
  families: Record<string, number>;
  sources: { name: string; license: string; attribution: string; used_for: string }[];
  metric: { name: string; definition: string; not_called: string; min_n_joint: number };
  unknown_vs_absent: string;
}

interface LangDetail {
  glottocode: string;
  name: string | null;
  iso639_3: string | null;
  family: string | null;
  subgroup: string | null;
  family_chain: { glottocode: string; name: string }[];
  austlang_codes: string[];
  endangerment: string | null;
  coverage: {
    grambank_coded: number;
    grambank_unknown: number;
    grambank_total: number;
    grambank_pct: number;
    wals_coded: number;
    aus_extension_coded: number;
    aus_extension_total: number;
  };
  grambank_features: { id: string; name: string; value: string; value_meaning?: string; domain: string }[];
  constructions: {
    id: string;
    domain: string;
    construction_name: string;
    description: string;
    example: { form: string; gloss: string; translation: string };
    source: { work: string; section: string; via?: string };
    analyst_confidence: string;
  }[];
  dictionary: { code: string; href: string } | null;
}

const MODES: { id: Mode; label: string }[] = [
  { id: 'family', label: 'Family' },
  { id: 'feature', label: 'Feature' },
  { id: 'agreement', label: 'Recorded agreement' },
];

function isDark() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

export default function MapExplorer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const fcRef = useRef<any>(null); // the points FeatureCollection in memory
  const coordRef = useRef<Record<string, [number, number]>>({}); // gc -> [lon,lat]
  const markersRef = useRef<any[]>([]);
  const initedRef = useRef(false);
  const pendingSelRef = useRef<string | null>(null);
  const deeplinkReadRef = useRef(false);

  const [libReady, setLibReady] = useState(false);
  const [libError, setLibError] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);

  const [meta, setMeta] = useState<MetaData | null>(null);
  const [agreement, setAgreement] = useState<{
    _meta: any;
    clusters: Record<string, { size: number; dominant_subgroup: string; purity: number }>;
    neighbours: Record<string, Neighbour[]>;
  } | null>(null);
  const [catalog, setCatalog] = useState<FeatureCatalogItem[] | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string>> | null>(null);

  const [mode, setMode] = useState<Mode>('family');
  const [featureId, setFeatureId] = useState<string>('GB020');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProps, setSelectedProps] = useState<PointProps | null>(null);
  const [detail, setDetail] = useState<LangDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; sub: string } | null>(null);

  const familyColors = useMemo(
    () => (meta ? buildFamilyColors(meta.families) : { map: {}, distinct: [] }),
    [meta],
  );

  const selectedFeature = useMemo(
    () => catalog?.find((f) => f.id === featureId) ?? null,
    [catalog, featureId],
  );
  const featureColorMap = useMemo(
    () => (selectedFeature ? buildFeatureColors(selectedFeature) : {}),
    [selectedFeature],
  );

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

  // ------------------------------------------------------- deep-link (read once)
  useEffect(() => {
    if (deeplinkReadRef.current) return;
    deeplinkReadRef.current = true;
    const sp = new URLSearchParams(window.location.search);
    const m = sp.get('mode');
    if (m === 'family' || m === 'feature' || m === 'agreement') setMode(m);
    const f = sp.get('feature');
    if (f) setFeatureId(f);
    const sel = sp.get('sel');
    if (sel) pendingSelRef.current = sel;
  }, []);

  // ---------------------------------------------------------------- load data
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/map-data/points.geojson').then((r) => r.json()),
      fetch('/map-data/meta.json').then((r) => r.json()),
      fetch('/map-data/agreement.json').then((r) => r.json()),
    ])
      .then(([pts, m, agr]) => {
        if (!alive) return;
        fcRef.current = pts;
        const coords: Record<string, [number, number]> = {};
        for (const f of pts.features) {
          const gc = f.properties.gc;
          if (gc) coords[gc] = f.geometry.coordinates;
        }
        coordRef.current = coords;
        setMeta(m);
        setAgreement(agr);
        setDataReady(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // lazily fetch the feature catalog + values when Feature mode is first used
  useEffect(() => {
    if (mode !== 'feature' || catalog) return;
    Promise.all([
      fetch('/map-data/features-catalog.json').then((r) => r.json()),
      fetch('/map-data/feature-values.json').then((r) => r.json()),
    ]).then(([c, v]) => {
      setCatalog(c.features);
      setValues(v);
    });
  }, [mode, catalog]);

  // apply a deep-linked selection once the points are in memory
  useEffect(() => {
    if (!dataReady || !pendingSelRef.current || !fcRef.current) return;
    const key = pendingSelRef.current;
    pendingSelRef.current = null;
    const f = fcRef.current.features.find(
      (x: any) => x.properties.gc === key || x.properties.id === key,
    );
    if (f) {
      setSelectedId(f.properties.id);
      setSelectedProps(f.properties);
    }
  }, [dataReady]);

  // keep the URL shareable (mode + feature + selected language)
  useEffect(() => {
    if (!dataReady) return;
    const sp = new URLSearchParams();
    if (mode !== 'family') sp.set('mode', mode);
    if (mode === 'feature') sp.set('feature', featureId);
    if (selectedProps) sp.set('sel', selectedProps.gc || selectedProps.id);
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [mode, featureId, selectedProps, dataReady]);

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
        { id: 'basemap', type: 'raster', source: 'carto', paint: { 'raster-opacity': dark ? 0.82 : 0.9 } },
      ],
    };
  }, []);

  // ---------------------------------------------------------------- init map
  useEffect(() => {
    if (!libReady || !dataReady || !containerRef.current || initedRef.current) return;
    const maplibregl = (window as any).maplibregl;
    initedRef.current = true;
    const dark = isDark();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(dark),
      // construct with an explicit centre (NOT `bounds`): if the flex container
      // is momentarily 0-height at construction, `bounds` yields a NaN transform
      // and the map never fires `load`. We fitBounds() precisely once loaded.
      center: [134, -28],
      zoom: 3.1,
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
      if (!map.getSource('langs')) {
        map.addSource('langs', { type: 'geojson', data: fcRef.current });
      }
      if (!map.getSource('edges')) {
        map.addSource('edges', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      if (!map.getLayer('edge-lines')) {
        map.addLayer({
          id: 'edge-lines',
          type: 'line',
          source: 'edges',
          layout: { 'line-cap': 'round' },
          paint: {
            'line-color': [
              'interpolate', ['linear'], ['get', 'agr'],
              0.4, '#b9a68f', 0.7, '#c07a3c', 0.9, '#b23d2e',
            ],
            'line-width': ['interpolate', ['linear'], ['get', 'agr'], 0.4, 1, 0.9, 4],
            'line-opacity': 0.75,
          },
        });
      }
      if (!map.getLayer('lang-points')) {
        map.addLayer({
          id: 'lang-points',
          type: 'circle',
          source: 'langs',
          paint: {
            'circle-color': ['get', '__c'],
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              2.5, ['+', ['case', ['get', '__dim'], 2.1, 3.4], ['case', ['get', '__sel'], 3, 0]],
              5, ['+', ['case', ['get', '__dim'], 3.2, 5.2], ['case', ['get', '__sel'], 3.5, 0]],
              8, ['+', ['case', ['get', '__dim'], 4.4, 7.4], ['case', ['get', '__sel'], 4, 0]],
            ],
            'circle-opacity': ['case', ['get', '__dim'], 0.5, 0.9],
            'circle-stroke-width': ['case', ['get', '__sel'], 2.6, ['case', ['get', '__dim'], 0, 0.7]],
            'circle-stroke-color': ['case', ['get', '__sel'], '#111', stroke],
          },
        });
      }
    };

    map.on('load', () => {
      addLayers();
      applyStyling();
      // the flex container can finish sizing after map init — force a resize +
      // re-fit so Australia is framed correctly regardless of layout timing.
      map.resize();
      map.fitBounds(AU_BOUNDS, { padding: 40, duration: 0 });
    });

    // keep the canvas matched to the container as the layout settles / on resize
    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        /* torn down */
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    // hover tooltip
    map.on('mousemove', 'lang-points', (e: any) => {
      map.getCanvas().style.cursor = 'pointer';
      const p = e.features?.[0]?.properties;
      if (p) {
        setTooltip({
          x: e.point.x,
          y: e.point.y,
          name: p.name || p.id,
          sub: p.subgroup || p.family || (p.level === 'dialect' ? 'dialect' : 'language'),
        });
      }
    });
    map.on('mouseleave', 'lang-points', () => {
      map.getCanvas().style.cursor = '';
      setTooltip(null);
    });

    // click → select or deselect
    map.on('click', (e: any) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['lang-points'] });
      if (hits.length) {
        const p = hits[0].properties as PointProps;
        setSelectedId(p.id);
        setSelectedProps(p);
      } else {
        setSelectedId(null);
        setSelectedProps(null);
      }
    });

    // theme swap: replace only the basemap raster, keep data layers
    const observer = new MutationObserver(() => {
      const d = isDark();
      const strokeNow = d ? BASEMAP.stroke.dark : BASEMAP.stroke.light;
      try {
        if (map.getLayer('basemap')) map.removeLayer('basemap');
        if (map.getSource('carto')) map.removeSource('carto');
        map.addSource('carto', {
          type: 'raster', tiles: d ? BASEMAP.dark : BASEMAP.light, tileSize: 256, attribution: BASEMAP.attribution,
        });
        map.addLayer(
          { id: 'basemap', type: 'raster', source: 'carto', paint: { 'raster-opacity': d ? 0.82 : 0.9 } },
          'edge-lines',
        );
        map.setPaintProperty('bg', 'background-color', d ? BASEMAP.bg.dark : BASEMAP.bg.light);
        map.setPaintProperty('lang-points', 'circle-stroke-color', ['case', ['get', '__sel'], '#111', strokeNow]);
      } catch {
        /* map torn down */
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
  }, [libReady, dataReady, buildStyle]);

  // -------------------------------------------------------------- recolor + edges
  const applyStyling = useCallback(() => {
    const map = mapRef.current;
    const fc = fcRef.current;
    if (!map || !fc || !map.getSource('langs')) return;

    for (const f of fc.features) {
      const p: PointProps = f.properties;
      let color = OTHER_COLOR;
      let dim = false;
      if (mode === 'family') {
        color = familyColors.map[p.family || 'Unclassified / isolate'] || OTHER_COLOR;
      } else if (mode === 'feature') {
        const v = p.gc && values ? values[featureId]?.[p.gc] : undefined;
        if (v == null) {
          color = NOT_CODED;
          dim = true;
        } else {
          color = featureColorMap[v] || OTHER_COLOR;
        }
      } else if (mode === 'agreement') {
        if (p.cl == null) {
          color = NOT_CODED;
          dim = true;
        } else {
          color = CLUSTER_COLORS[p.cl % CLUSTER_COLORS.length];
        }
      }
      f.properties.__c = color;
      f.properties.__dim = dim;
      f.properties.__sel = p.id === selectedId;
    }
    map.getSource('langs').setData(fc);

    // edges (agreement mode only)
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    const edgeSrc = map.getSource('edges');
    const maplibregl = (window as any).maplibregl;
    if (mode === 'agreement' && selectedProps?.gc && agreement) {
      const gc = selectedProps.gc;
      const origin = coordRef.current[gc];
      const nbrs = agreement.neighbours[gc] || [];
      const feats: any[] = [];
      for (const n of nbrs) {
        const dest = coordRef.current[n.gc];
        if (!origin || !dest) continue;
        feats.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [origin, dest] },
          properties: { agr: n.agr },
        });
        const mid: [number, number] = [(origin[0] + dest[0]) / 2, (origin[1] + dest[1]) / 2];
        const el = document.createElement('div');
        el.className = 'mt-edge-label';
        el.textContent = `${Math.round(n.agr * 100)}% · n=${n.n}`;
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(mid).addTo(map);
        markersRef.current.push(marker);
      }
      edgeSrc?.setData({ type: 'FeatureCollection', features: feats });
    } else {
      edgeSrc?.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [mode, values, featureId, featureColorMap, familyColors, selectedId, selectedProps, agreement]);

  useEffect(() => {
    applyStyling();
  }, [applyStyling]);

  // fly to selected point
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedProps) return;
    const gc = selectedProps.gc;
    const coord = gc ? coordRef.current[gc] : null;
    if (coord) {
      map.easeTo({ center: coord, duration: 600, offset: [-80, 0] });
    }
  }, [selectedProps]);

  // load rich detail for the selected language (typology snapshot; registry-only otherwise)
  useEffect(() => {
    setDetail(null);
    if (!selectedProps?.gc || !selectedProps.typ) return;
    setDetailLoading(true);
    let alive = true;
    fetch(`/typology/lang/${selectedProps.gc}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch(() => {})
      .finally(() => alive && setDetailLoading(false));
    return () => {
      alive = false;
    };
  }, [selectedProps]);

  const neighbours = selectedProps?.gc && agreement ? agreement.neighbours[selectedProps.gc] : undefined;

  // feature picker filtered list
  const filteredFeatures = useMemo(() => {
    if (!catalog) return [];
    const q = search.trim().toLowerCase();
    const list = q
      ? catalog.filter(
          (f) => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q) || f.domain.toLowerCase().includes(q),
        )
      : catalog;
    return list;
  }, [catalog, search]);

  const coveredCount = selectedFeature?.coded ?? 0;
  const mappedTotal = meta?.counts.points ?? 847;

  return (
    <div className="space-y-4">
      <MapStyles />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary mb-1">Atlas</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">The language map</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl leading-relaxed text-sm md:text-base">
            Every Australian language variety in our registry, plotted from open coordinates. Colour it by
            language family, by a single grammatical feature, or by how much recorded Grambank data two
            languages share &mdash; with <strong>not&nbsp;coded</strong> always shown, never hidden.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/spread"
            className="group inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            How our languages spread &mdash; animated
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              &rarr;
            </span>
          </Link>
          <button
            onClick={() => setAboutOpen(true)}
            className="rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
          >
            About this data
          </button>
        </div>
      </header>

      <div className="relative w-full h-[calc(100dvh-13rem)] min-h-[540px] rounded-2xl border border-border overflow-hidden shadow-sm bg-muted/40">
        {/* h-full w-full (not absolute inset-0): MapLibre's own CSS forces
            .maplibregl-map { position: relative }, which would cancel inset-0
            and collapse the container to 0px. */}
        <div ref={containerRef} className="h-full w-full" />

        {/* loading / error states */}
        {(!libReady || !dataReady) && !libError && (
          <div className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-sm z-[5]">
            <div className="flex flex-col items-center gap-3 text-muted-foreground text-sm">
              <span className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              Loading the atlas&hellip;
            </div>
          </div>
        )}
        {libError && (
          <div className="absolute inset-0 grid place-items-center bg-background z-[5] p-6 text-center">
            <div className="max-w-sm">
              <p className="font-semibold mb-1">The map engine could not load</p>
              <p className="text-sm text-muted-foreground">
                MapLibre GL is served from a CDN and appears to be blocked on this network. The underlying data
                is still available on the{' '}
                <Link href="/languages" className="text-primary underline">
                  Languages
                </Link>{' '}
                page.
              </p>
            </div>
          </div>
        )}

        {/* top-left controls */}
        {dataReady && (
          <div className="absolute top-3 left-3 z-[4] flex flex-col gap-2 max-w-[calc(100%-1.5rem)] w-[280px]">
            <div className="rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-md p-1 flex">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] sm:text-xs font-semibold transition-colors ${
                    mode === m.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* mode-specific control card */}
            <div className="rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-md p-3 max-h-[60dvh] overflow-y-auto">
              {mode === 'family' && <FamilyLegend distinct={familyColors.distinct} meta={meta} />}
              {mode === 'feature' && (
                <FeatureControls
                  catalog={catalog}
                  filtered={filteredFeatures}
                  search={search}
                  setSearch={setSearch}
                  featureId={featureId}
                  setFeatureId={setFeatureId}
                  selectedFeature={selectedFeature}
                  colorMap={featureColorMap}
                  covered={coveredCount}
                  total={mappedTotal}
                />
              )}
              {mode === 'agreement' && <AgreementLegend agreement={agreement} />}
            </div>
          </div>
        )}

        {/* point count chip */}
        {dataReady && meta && (
          <div className="absolute top-3 right-3 z-[4] rounded-lg border border-border bg-card/95 backdrop-blur-md shadow-sm px-3 py-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{meta.counts.points}</span> languages plotted
          </div>
        )}

        {tilesFailed && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[4] rounded-lg border border-amber-500/40 bg-amber-100/90 text-amber-900 px-3 py-1.5 text-xs shadow-sm">
            Basemap tiles unavailable — showing points on a plain background.
          </div>
        )}

        {/* hover tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-[130%] rounded-md bg-foreground text-background px-2 py-1 text-xs font-medium shadow-lg whitespace-nowrap"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.name}
            <span className="opacity-60"> · {tooltip.sub}</span>
          </div>
        )}

        {/* language panel */}
        {selectedProps && (
          <LanguagePanel
            props={selectedProps}
            detail={detail}
            loading={detailLoading}
            neighbours={neighbours}
            onClose={() => {
              setSelectedId(null);
              setSelectedProps(null);
            }}
            onPickNeighbour={(gc) => {
              const f = fcRef.current?.features.find((x: any) => x.properties.gc === gc);
              if (f) {
                setSelectedId(f.properties.id);
                setSelectedProps(f.properties);
              }
            }}
          />
        )}
      </div>

      {aboutOpen && meta && <AboutModal meta={meta} onClose={() => setAboutOpen(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ legends */

function FamilyLegend({
  distinct,
  meta,
}: {
  distinct: { family: string; color: string; count: number }[];
  meta: MetaData | null;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Language family</p>
      <ul className="space-y-1.5">
        {distinct.map((d) => (
          <li key={d.family} className="flex items-center gap-2 text-xs">
            <span className="h-3 w-3 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-foreground truncate">{d.family}</span>
            <span className="ml-auto text-muted-foreground tabular-nums">{d.count}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-xs">
          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: ISOLATE_COLOR }} />
          <span className="text-foreground">Unclassified / isolate</span>
        </li>
        <li className="flex items-center gap-2 text-xs">
          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: OTHER_COLOR }} />
          <span className="text-muted-foreground">Other families</span>
        </li>
      </ul>
      {meta && (
        <p className="mt-2.5 pt-2.5 border-t border-border text-[11px] leading-snug text-muted-foreground">
          Pama-Nyungan spans most of the continent; smaller non-Pama-Nyungan families cluster across the north.
        </p>
      )}
    </div>
  );
}

function FeatureControls({
  catalog,
  filtered,
  search,
  setSearch,
  featureId,
  setFeatureId,
  selectedFeature,
  colorMap,
  covered,
  total,
}: {
  catalog: FeatureCatalogItem[] | null;
  filtered: FeatureCatalogItem[];
  search: string;
  setSearch: (s: string) => void;
  featureId: string;
  setFeatureId: (s: string) => void;
  selectedFeature: FeatureCatalogItem | null;
  colorMap: Record<string, string>;
  covered: number;
  total: number;
}) {
  if (!catalog) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <span className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        Loading features&hellip;
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Grammatical feature</p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search 248 features…"
        className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border mb-2">
        {filtered.slice(0, 120).map((f) => (
          <button
            key={f.id}
            onClick={() => setFeatureId(f.id)}
            className={`w-full text-left px-2 py-1.5 text-[11px] leading-snug hover:bg-muted/60 transition-colors ${
              f.id === featureId ? 'bg-primary/10' : ''
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span
                className={`text-[9px] font-bold uppercase tracking-wide rounded px-1 py-px shrink-0 ${
                  f.catalog === 'baseline'
                    ? 'bg-nightsky-600/15 text-nightsky-700 dark:text-nightsky-300'
                    : 'bg-eucalyptus-600/15 text-eucalyptus-700 dark:text-eucalyptus-300'
                }`}
              >
                {f.catalog === 'baseline' ? 'base' : 'ext'}
              </span>
              <span className="text-foreground truncate">{f.name}</span>
            </span>
          </button>
        ))}
        {filtered.length === 0 && <p className="px-2 py-2 text-[11px] text-muted-foreground">No features match.</p>}
      </div>

      {selectedFeature && (
        <div>
          <p className="text-[11px] leading-snug text-muted-foreground mb-1.5">{selectedFeature.gloss}</p>
          <ul className="space-y-1 mb-2">
            {selectedFeature.values.map((v) => (
              <li key={v.value} className="flex items-center gap-2 text-[11px]">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: colorMap[v.value] }} />
                <span className="text-foreground capitalize">{v.meaning}</span>
              </li>
            ))}
            <li className="flex items-center gap-2 text-[11px]">
              <span className="h-3 w-3 rounded-full shrink-0 opacity-60" style={{ background: NOT_CODED }} />
              <span className="text-muted-foreground">Not coded</span>
            </li>
          </ul>
          <p className="text-[11px] leading-snug text-muted-foreground border-t border-border pt-2">
            Coded for <span className="font-semibold text-foreground tabular-nums">{covered}</span> of {total} mapped
            languages.
            <span className="block mt-0.5 opacity-80">
              {selectedFeature.catalog === 'baseline'
                ? 'Grambank baseline feature (195-feature standardized set).'
                : 'Australianist extension feature — coverage is honestly low.'}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function AgreementLegend({
  agreement,
}: {
  agreement: {
    _meta: any;
    clusters: Record<string, { size: number; dominant_subgroup: string; purity: number }>;
  } | null;
}) {
  if (!agreement) return null;
  const ids = Object.keys(agreement.clusters).sort((a, b) => Number(a) - Number(b));
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Recorded agreement</p>
      <p className="text-[11px] leading-snug text-muted-foreground mb-2">
        Colours = typological clusters over <em>recorded Grambank features only</em>. Click a language to see its
        top matches. This is <strong>not</strong> a claim about overall grammatical similarity.
      </p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-2">
        {ids.map((id) => (
          <li key={id} className="flex items-center gap-2 text-[11px]">
            <span className="h-3 w-3 rounded-full shrink-0" style={{ background: CLUSTER_COLORS[Number(id) % CLUSTER_COLORS.length] }} />
            <span className="text-foreground">Cluster {id}</span>
            <span className="ml-auto text-muted-foreground tabular-nums">{agreement.clusters[id].size}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-[11px]">
          <span className="h-3 w-3 rounded-full shrink-0 opacity-60" style={{ background: NOT_CODED }} />
          <span className="text-muted-foreground">Not clustered</span>
        </li>
      </ul>
      <p className="text-[11px] leading-snug text-muted-foreground border-t border-border pt-2">
        k=8 clusters (silhouette {Number(agreement._meta.silhouette).toFixed(2)}); minimum {agreement._meta.min_n_joint}{' '}
        jointly-coded features per pair. Clusters cut across genealogy.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ panel */

function CoverageBar({ pct }: { pct: number }) {
  return (
    <span className="inline-flex h-1.5 w-16 rounded-full bg-muted overflow-hidden align-middle">
      <span className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, pct)}%` }} />
    </span>
  );
}

function DomainSpark({ dom }: { dom: Record<string, [number, number]> }) {
  return (
    <span className="inline-flex items-end gap-[2px] h-3 align-middle" title="per-domain agreement">
      {DOMAIN_ORDER.map((d) => {
        const cell = dom[d];
        const a = cell ? cell[0] : null;
        return (
          <span
            key={d}
            className="w-[3px] rounded-sm"
            style={{
              height: a == null ? '2px' : `${Math.max(12, a * 100)}%`,
              background: a == null ? 'var(--color-border)' : 'var(--color-primary)',
              opacity: a == null ? 0.5 : 0.85,
            }}
          />
        );
      })}
    </span>
  );
}

function LanguagePanel({
  props,
  detail,
  loading,
  neighbours,
  onClose,
  onPickNeighbour,
}: {
  props: PointProps;
  detail: LangDetail | null;
  loading: boolean;
  neighbours: Neighbour[] | undefined;
  onClose: () => void;
  onPickNeighbour: (gc: string) => void;
}) {
  const chain = detail?.family_chain?.map((c) => c.name) ?? [props.family, props.subgroup].filter(Boolean);
  const gbPct = detail?.coverage.grambank_pct ?? (props.gb ? (props.gb / 195) * 100 : 0);
  const topFeatures = (detail?.grambank_features ?? [])
    .filter((f) => f.value_meaning)
    .slice(0, 8);
  const endLabel = props.end ? ENDANGERMENT_LABEL[props.end] ?? props.end : null;

  return (
    <aside className="mt-panel absolute inset-y-0 right-0 z-[7] w-full sm:w-[384px] bg-card border-l border-border shadow-2xl flex flex-col">
      <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold leading-tight truncate">{props.name || props.id}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {props.level ? props.level[0].toUpperCase() + props.level.slice(1) : 'Language'}
            {props.iso && <> · ISO {props.iso}</>}
            {props.gc && <> · {props.gc}</>}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* family chain */}
        {chain.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {chain.map((c, i) => (
              <React.Fragment key={c ?? i}>
                {i > 0 && <span className="opacity-40">›</span>}
                <span className={i === chain.length - 1 ? 'text-foreground font-medium' : ''}>{c}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* badges */}
        <div className="flex flex-wrap gap-1.5">
          {endLabel && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-foreground">{endLabel}</span>
          )}
          {props.typ ? (
            <span className="rounded-full bg-nightsky-600/15 text-nightsky-700 dark:text-nightsky-300 px-2.5 py-0.5 text-[11px] font-medium inline-flex items-center gap-1.5">
              Grambank {detail ? detail.coverage.grambank_coded : props.gb}/195 <CoverageBar pct={gbPct} />
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              No Grambank data yet
            </span>
          )}
          {props.ncon > 0 && (
            <span className="rounded-full bg-eucalyptus-600/15 text-eucalyptus-700 dark:text-eucalyptus-300 px-2.5 py-0.5 text-[11px] font-medium">
              {props.ncon} construction records
            </span>
          )}
        </div>

        {/* external links */}
        <div className="flex flex-wrap gap-2 text-xs">
          {props.dict && (
            <Link
              href={`/dictionaries/${props.dict}`}
              className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-medium hover:bg-primary-hover transition-colors"
            >
              Dictionary available →
            </Link>
          )}
          {props.gc && (
            <a
              href={glottologUrl(props.gc)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted/60 transition-colors"
            >
              Glottolog ↗
            </a>
          )}
          {props.austlang && (
            <a
              href={austlangUrl(props.austlang)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted/60 transition-colors"
            >
              AUSTLANG {props.austlang} ↗
            </a>
          )}
        </div>

        {loading && <p className="text-xs text-muted-foreground">Loading grammatical profile…</p>}

        {/* top features in plain english */}
        {topFeatures.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Grammatical profile
            </h3>
            <ul className="space-y-1.5">
              {topFeatures.map((f) => (
                <li key={f.id} className="text-xs leading-snug">
                  <span className="text-foreground">{f.name}</span>{' '}
                  <span className="text-primary font-medium">{f.value_meaning}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* similar languages */}
        {neighbours && neighbours.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Similar in recorded features
            </h3>
            <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
              Agreement over jointly-coded Grambank features (not overall similarity).
            </p>
            <ul className="space-y-1">
              {neighbours.map((n) => (
                <li key={n.gc}>
                  <button
                    onClick={() => onPickNeighbour(n.gc)}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/60 transition-colors text-left"
                  >
                    <span className="text-foreground truncate flex-1">{n.name || n.gc}</span>
                    <DomainSpark dom={n.dom} />
                    <span className="font-semibold text-foreground tabular-nums w-9 text-right">
                      {Math.round(n.agr * 100)}%
                    </span>
                    <span className="text-muted-foreground tabular-nums w-12 text-right">n={n.n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* construction records */}
        {detail?.constructions && detail.constructions.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Construction records
            </h3>
            <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
              Primary descriptive facts transcribed from reference grammars, with citations.
            </p>
            <div className="space-y-2">
              {detail.constructions.slice(0, 10).map((c) => (
                <div key={c.id} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">{c.domain}</span>
                    <span className="text-xs font-medium text-foreground">{c.construction_name}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug mb-1.5">{c.description}</p>
                  {c.example?.form && (
                    <p className="text-[11px] leading-snug">
                      <span className="font-medium text-foreground italic">{c.example.form}</span>
                      {c.example.gloss && <span className="text-muted-foreground"> — {c.example.gloss}</span>}
                      {c.example.translation && <span className="text-muted-foreground"> ‘{c.example.translation}’</span>}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/80 mt-1">
                    {c.source.work}
                    {c.source.section && `, ${c.source.section}`}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {!props.typ && !loading && (
          <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
            This variety is in the registry from Glottolog / AUSTLANG but has no Grambank typological assessment
            yet — so no grammatical profile or feature colouring is available for it. That absence is itself
            honest data.
          </p>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ about */

function AboutModal({ meta, onClose }: { meta: MetaData; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4 bg-foreground/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="font-display text-2xl font-bold">About this data</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {meta.counts.points} language varieties are plotted, of which {meta.counts.with_typology} carry typological
          data and {meta.counts.grambank_assessed} have a Grambank assessment. Everything below is built only from
          openly-licensed (CC-BY-4.0) releases.
        </p>

        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Data releases</h3>
        <ul className="space-y-2.5 mb-5">
          {meta.sources.map((s) => (
            <li key={s.name} className="text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{s.name}</span>
                <span className="rounded bg-eucalyptus-600/15 text-eucalyptus-700 dark:text-eucalyptus-300 px-1.5 py-px text-[10px] font-medium">
                  {s.license}
                </span>
              </div>
              <p className="text-muted-foreground leading-snug mt-0.5">{s.attribution}</p>
            </li>
          ))}
        </ul>

        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          The agreement metric
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          <span className="font-medium text-foreground">{meta.metric.name}</span> — {meta.metric.definition} A minimum
          of {meta.metric.min_n_joint} jointly-coded features is required for a pair to count. It is deliberately{' '}
          <em>not</em> called overall grammatical similarity: two languages can share every recorded Grambank code and
          still differ in everything Grambank never asked about.
        </p>

        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Unknown is not absent
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">{meta.unknown_vs_absent}</p>

        <p className="text-[11px] text-muted-foreground/80 border-t border-border pt-3">
          Grambank&rsquo;s 195 variables are a standardized cross-linguistic baseline, not an exhaustive grammar.
          Finer Australianist distinctions live in the extension catalog; primary description lives in the construction
          records. See the{' '}
          <Link href="/languages" className="text-primary underline" onClick={onClose}>
            Languages
          </Link>{' '}
          section for the full per-language detail.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ styles */

function MapStyles() {
  return (
    <style>{`
      @keyframes mtslide { from { transform: translateX(18px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      .mt-panel { animation: mtslide .28s cubic-bezier(0.16, 1, 0.3, 1) }
      @media (prefers-reduced-motion: reduce) {
        .mt-panel { animation: none }
      }
      .mt-edge-label {
        background: var(--color-card); color: var(--color-foreground);
        border: 1px solid var(--color-border); border-radius: 9999px;
        font-size: 10px; font-weight: 600; padding: 1px 6px; white-space: nowrap;
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.18); pointer-events: none;
      }
      .maplibregl-ctrl-attrib { font-size: 10px }
      .maplibregl-popup { display: none }
    `}</style>
  );
}
