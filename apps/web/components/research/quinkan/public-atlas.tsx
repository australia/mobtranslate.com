"use client";

import {memo, useState, useTransition, type FormEvent} from "react";
import type {
  AtlasOverview,
  EnvironmentalLayer,
  ExperimentRecord,
  PagedResult,
  SourceRecord,
} from "@/lib/research/quinkan/atlas-types";

type ExplorerKind = "sources" | "bibliography" | "layers" | "experiments";
type ExplorerResult =
  | Readonly<{kind: "sources"; result: PagedResult<SourceRecord>}>
  | Readonly<{kind: "bibliography"; result: PagedResult<SourceRecord>}>
  | Readonly<{kind: "layers"; result: PagedResult<EnvironmentalLayer>}>
  | Readonly<{kind: "experiments"; result: PagedResult<ExperimentRecord>}>;

const layerClass: Record<AtlasOverview["map"]["layers"][number]["layerId"], string> = {
  public_heritage_acquisition_frame: "mapLayerFrame",
  qld_elevation_project_coverage: "mapLayerProjects",
  qld_elevation_tile_coverage: "mapLayerTiles",
};
const countFormatter = new Intl.NumberFormat("en-AU");
const wordStartPattern = /\b\w/g;

export function PublicAtlas({overview}: Readonly<{overview: AtlasOverview}>) {
  const [kind, setKind] = useState<ExplorerKind>("sources");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ExplorerResult>(() => initialResult("sources", overview));
  const [loading, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function selectKind(next: ExplorerKind) {
    setKind(next);
    setQuery("");
    setError(null);
    setResult(initialResult(next, overview));
  }

  function loadPage(page: number, submittedQuery = query) {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/research/quinkan/atlas/${kind}?q=${encodeURIComponent(submittedQuery)}&page=${page}`);
        if (!response.ok) throw new Error(`The evidence index returned ${response.status}.`);
        const payload: unknown = await response.json();
        setResult({kind, result: payload as never});
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The evidence index could not be read.");
      }
    });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadPage(1);
  }

  return (
    <div className="siteShell">
      <a className="skipLink" href="#main">Skip to atlas content</a>
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Laura–Quinkan evidence atlas home">
          <span className="wordmarkMark" aria-hidden="true">LQ</span>
          <span>PUBLIC EVIDENCE ATLAS</span>
        </a>
        <nav aria-label="Atlas sections">
          <a href="#map">Map</a>
          <a href="#evidence">Evidence</a>
          <a href="#method">Method</a>
          <a href="#provenance">Provenance</a>
          <a href="/admin/research/quinkan/methodology">Methodology</a>
        </nav>
        <span className="releaseState"><span aria-hidden="true" /> VERIFIED RELEASE</span>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="heroKicker">Laura, Cape York Peninsula · public environmental research</div>
          <div className="heroGrid">
            <div>
              <h1>Read the landscape.<br />Audit the evidence.</h1>
              <p className="heroLead">{overview.project.purpose}</p>
            </div>
            <aside className="fieldNote" aria-label="Release field note">
              <p className="fieldLabel">FIELD NOTE / 01</p>
              <p>This atlas exposes research structure, public environmental coverage, provenance and falsifiable ideas. It does not expose cultural places or predictions.</p>
              <dl>
                <div><dt>Evidence stage</dt><dd>{humanize(overview.project.evidenceStage)}</dd></div>
                <div><dt>Current through</dt><dd>{overview.project.dataCurrentThrough}</dd></div>
                <div><dt>Release</dt><dd>{overview.releaseId}</dd></div>
              </dl>
            </aside>
          </div>
        </section>

        <section className="measureStrip" aria-label="Atlas counts">
          <Measure value={formatCount(overview.counts.sources)} label="source records" />
          <Measure value={formatCount(overview.counts.layers)} label="environmental assets" />
          <Measure value={formatCount(overview.counts.experiments)} label="falsifiable ideas" />
          <Measure value={formatCount(overview.counts.mapFeatures)} label="public coverage features" />
        </section>

        <section className="atlasSection mapSection" id="map">
          <SectionHead index="01" eyebrow="Public geometry" title="Environmental coverage map" description="A disclosure-limited view of the public acquisition frame and elevation-data coverage. This is not a site map or probability surface." />
          <CoverageMap map={overview.map} />
        </section>

        <section className="atlasSection" id="evidence">
          <SectionHead index="02" eyebrow="Search the record" title="Evidence index" description="Every admitted source pointer, ranked bibliography record, environmental asset and proposed experiment remains inspectable. Searches are literal filters over the frozen release—not relevance claims." />
          <div className="explorer">
            <div className="explorerTabs" role="tablist" aria-label="Evidence collection">
              {(["sources", "bibliography", "layers", "experiments"] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={kind === tab} onClick={() => selectKind(tab)}>
                  {humanize(tab)} <span>{formatCount(overview.counts[tab])}</span>
                </button>
              ))}
            </div>
            <form className="searchBar" role="search" onSubmit={submitSearch}>
              <SearchIcon />
              <label className="srOnly" htmlFor="evidence-query">Search {kind}</label>
              <input id="evidence-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Filter ${kind} by recorded text…`} />
              <button type="submit" disabled={loading}>{loading ? "Reading…" : "Search"}</button>
            </form>
            <div className="resultMeta" aria-live="polite">
              <span>{formatCount(result.result.total)} records</span>
              <span>page {result.result.page} / {result.result.pageCount}</span>
            </div>
            {error ? <p className="errorNotice" role="alert">{error}</p> : null}
            <div className="resultList" aria-busy={loading}>
              {result.kind === "sources" && result.result.items.map((item) => <SourceRow key={item.source_id} item={item} />)}
              {result.kind === "bibliography" && result.result.items.map((item) => <BibliographyRow key={item.source_id} item={item} />)}
              {result.kind === "layers" && result.result.items.map((item) => <LayerRow key={item.layer_id} item={item} />)}
              {result.kind === "experiments" && result.result.items.map((item) => <ExperimentRow key={item.experiment_id} item={item} />)}
            </div>
            <div className="pager">
              <button type="button" disabled={loading || result.result.page <= 1} onClick={() => loadPage(result.result.page - 1)}>← Previous</button>
              <button type="button" disabled={loading || result.result.page >= result.result.pageCount} onClick={() => loadPage(result.result.page + 1)}>Next →</button>
            </div>
          </div>
        </section>

        <section className="atlasSection methodSection" id="method">
          <SectionHead index="03" eyebrow="Model restraint" title="What the baseline can—and cannot—say" description="The current model is retained as proposal evidence. Its strongest diagnostic is caution: a spatial placebo nearly matches the declared target." />
          <div className="methodGrid">
            <div className="methodReading">
              <p className="fieldLabel">BOUNDARY NEGATIVE CONTROL</p>
              <div className="aucLine"><span>Declared target</span><strong>{overview.model.targetAuc.toFixed(4)}</strong><i style={{width: `${overview.model.targetAuc * 100}%`}} /></div>
              <div className="aucLine placebo"><span>Strongest placebo</span><strong>{overview.model.placeboAucMaximum.toFixed(4)}</strong><i style={{width: `${overview.model.placeboAucMaximum * 100}%`}} /></div>
              <p className="readingCaption">Difference from median placebo: <strong>{overview.model.targetMinusPlaceboMedianAuc.toFixed(4)}</strong>. This does not justify candidate geography.</p>
            </div>
            <div className="methodText">
              <h3>{humanize(overview.model.evidenceStage)}</h3>
              <p>{overview.model.methodSummary}</p>
              <dl>
                <div><dt>Analysis cells</dt><dd>{formatCount(overview.model.cellCount)}</dd></div>
                <div><dt>Input features</dt><dd>{overview.model.featureCount}</dd></div>
                <div><dt>Validation</dt><dd>{humanize(overview.model.validationStatus)}</dd></div>
              </dl>
            </div>
          </div>
          <div className="warningLedger">
            {overview.model.warnings.map((warning, index) => <p key={warning}><span>{String(index + 1).padStart(2, "0")}</span>{warning}</p>)}
          </div>
        </section>

        <section className="atlasSection provenanceSection" id="provenance">
          <SectionHead index="04" eyebrow="Chain of custody" title="Release provenance" description="The browser accepts one immutable, human-approved release. Every payload is named, sized and SHA-256 bound by both the approval record and release manifest." />
          <div className="provenanceGrid">
            <dl className="releaseLedger">
              <div><dt>Release ID</dt><dd>{overview.releaseId}</dd></div>
              <div><dt>Approved at</dt><dd>{overview.approvedAtUtc}</dd></div>
              <div><dt>Authority record</dt><dd>{overview.authorityRecordId}</dd></div>
              <div><dt>Manifest digest hint</dt><dd className="mono">{overview.manifestShaHint}</dd></div>
              <div><dt>Inventory generated</dt><dd>{overview.project.inventoryGeneratedAt}</dd></div>
            </dl>
            <div className="governanceNote">
              <ShieldIcon />
              <h3>Public and private are separate systems</h3>
              <p>Restricted research is not hidden with CSS, obscured in API responses or bundled into this application. It belongs to a different authenticated runtime and release tree.</p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <p><strong>Laura–Quinkan public evidence atlas</strong><br />Environmental research, provenance and falsifiable method.</p>
        <p>This atlas is not permission to enter Country or disturb any place. Follow Traditional Owner direction, land access requirements and applicable law.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  );
}

function initialResult(kind: ExplorerKind, overview: AtlasOverview): ExplorerResult {
  if (kind === "sources") return {kind, result: pageOne(overview.initialSources, overview.counts.sources, 12)};
  if (kind === "bibliography") return {kind, result: pageOne(overview.initialBibliography, overview.counts.bibliography, 10)};
  if (kind === "layers") return {kind, result: pageOne(overview.initialLayers, overview.counts.layers, 12)};
  return {kind, result: pageOne(overview.initialExperiments, overview.counts.experiments, 9)};
}

function pageOne<T>(items: readonly T[], total: number, pageSize: number): PagedResult<T> {
  return {page: 1, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)), items};
}

function Measure({value, label}: Readonly<{value: string; label: string}>) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function SectionHead({index, eyebrow, title, description}: Readonly<{index: string; eyebrow: string; title: string; description: string}>) {
  return <header className="sectionHead"><span>{index}</span><div><p>{eyebrow}</p><h2>{title}</h2></div><p>{description}</p></header>;
}

const CoverageMap = memo(function CoverageMap({map}: Readonly<{map: AtlasOverview["map"]}>) {
  const [visibleLayers, setVisibleLayers] = useState(() => new Set(map.layers.map((layer) => layer.layerId)));
  const [zoom, setZoom] = useState(1);
  const viewWidth = 1000 / zoom;
  const viewHeight = 760 / zoom;
  const viewBox = `${(1000 - viewWidth) / 2} ${(760 - viewHeight) / 2} ${viewWidth} ${viewHeight}`;

  function toggleLayer(layerId: AtlasOverview["map"]["layers"][number]["layerId"]) {
    setVisibleLayers((current) => {
      const next = new Set(current);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }

  return <div className="mapWorkspace">
    <div className="mapCanvas">
      <div className="mapToolbar" aria-label="Map controls">
        <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.5))} aria-label="Zoom in" title="Zoom in">+</button>
        <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.5))} aria-label="Zoom out" title="Zoom out">−</button>
        <button type="button" onClick={() => setZoom(1)}>Reset</button>
        <output aria-live="polite">{zoom.toFixed(1)}×</output>
      </div>
      <svg className="coverageMap" viewBox={viewBox} role="img" aria-labelledby="mapTitle mapDescription">
        <title id="mapTitle">Public environmental coverage within the Laura–Quinkan acquisition frame</title>
        <desc id="mapDescription">Three toggleable public layers: the acquisition frame, Queensland elevation project extents, and elevation tile footprints. No cultural or candidate locations are present.</desc>
        <defs>
          <pattern id="atlas-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" className="mapGridLine" />
          </pattern>
        </defs>
        <rect width="1000" height="760" className="mapGround" />
        <rect width="1000" height="760" fill="url(#atlas-grid)" />
        {map.layers.map((layer) => visibleLayers.has(layer.layerId) ? (
          <g key={layer.layerId} className={layerClass[layer.layerId]} aria-label={`${layer.title}, ${layer.featureCount} features`}>
            {layer.paths.map((path, index) => <path key={`${layer.layerId}-${index}`} d={path} vectorEffect="non-scaling-stroke" />)}
          </g>
        ) : null)}
      </svg>
      <div className="mapCoordinates" aria-hidden="true">
        <span>{Math.abs(map.bounds.north).toFixed(3)}° S</span>
        <span>CRS84 · PUBLIC COVERAGE ONLY</span>
        <span>{Math.abs(map.bounds.south).toFixed(3)}° S</span>
      </div>
    </div>
    <aside className="layerLedger" aria-label="Map layer ledger">
      <p className="fieldLabel">LAYER LEDGER</p>
      {map.layers.map((layer) => (
        <label className="layerToggle" key={layer.layerId}>
          <input type="checkbox" checked={visibleLayers.has(layer.layerId)} onChange={() => toggleLayer(layer.layerId)} />
          <span className={`legendSwatch ${layerClass[layer.layerId]}`} aria-hidden="true" />
          <span><strong>{layer.title}</strong><small>{formatCount(layer.featureCount)} public features · {humanize(layer.role)}</small></span>
        </label>
      ))}
      <div className="mapRule">
        <ShieldIcon />
        <p><strong>Disclosure rule</strong>No known sites, candidate locations, routes, cultural material, score rasters or survey-priority geometry.</p>
      </div>
      <details>
        <summary>Map provenance</summary>
        {map.layers.map((layer) => <p className="mono" key={layer.layerId}>{layer.artifactPath}<br />sha256:{layer.artifactSha256.slice(0, 16)}…</p>)}
      </details>
    </aside>
  </div>;
});

function SourceRow({item}: Readonly<{item: SourceRecord}>) {
  return <article className="resultRow sourceRow">
    <div className="resultIndex">SRC</div>
    <div><h3>{item.title}</h3><p>{item.coverage_summary}</p><small>{item.publisher} · {item.acquisition_status} · {formatCount(item.reference_count)} references</small></div>
    <a href={item.landing_page} target="_blank" rel="noreferrer">Open source <span aria-hidden="true">↗</span></a>
  </article>;
}

function BibliographyRow({item}: Readonly<{item: SourceRecord}>) {
  const record = item.bibliography;
  if (!record) return null;
  const metadata = record.metadata_availability;
  const years = record.publication_years.length > 0 ? record.publication_years.join(", ") : "year not recorded";
  const authors = record.authors.length > 0 ? record.authors.join(", ") : "authors not recorded";
  return <article className="resultRow bibliographyRow">
    <div className="resultIndex">#{String(record.priority_rank).padStart(2, "0")}</div>
    <div>
      <h3>{record.title}</h3>
      <p>{authors}</p>
      <small>{years} · {record.evidence_edge_count} evidence edges · {record.query_breadth} queries · {record.provider_breadth} providers</small>
      {metadata ? <dl className="bibliographySignals">
        <div><dt>Abstract</dt><dd>{metadata.abstract_available ? "Available" : "Not in frozen metadata"}</dd></div>
        <div><dt>OA signal</dt><dd>{metadata.openalex_is_oa === null ? "No OpenAlex match" : metadata.openalex_is_oa ? "Yes" : "No"}</dd></div>
        <div><dt>Licence metadata</dt><dd>{metadata.license_labels.join(", ") || (metadata.explicit_license_metadata ? "Recorded" : "Unresolved")}</dd></div>
        <div><dt>Citations</dt><dd>{metadata.openalex_cited_by_count === null ? "Not recorded" : `${formatCount(metadata.openalex_cited_by_count)} snapshot`}</dd></div>
        {metadata.primary_provider_topic ? <div className="wideSignal"><dt>Provider topic</dt><dd>{metadata.primary_provider_topic}</dd></div> : null}
      </dl> : null}
      <span className={`accessBadge access-${record.access_state}`}>{humanize(record.access_state)}</span>
    </div>
    <a href={item.landing_page} target="_blank" rel="noreferrer">Open record <span aria-hidden="true">↗</span></a>
  </article>;
}

function LayerRow({item}: Readonly<{item: EnvironmentalLayer}>) {
  return <article className="resultRow layerRow">
    <div className="resultIndex">{item.data_kind.slice(0, 3).toUpperCase()}</div>
    <div><h3>{item.title}</h3><p>{item.coverage_summary}</p><small>{humanize(item.role)} · {formatBytes(item.bytes)}</small><code>{item.artifact_path}</code></div>
    <span className="hashMark" title={item.sha256}>sha256<br />{item.sha256.slice(0, 10)}…</span>
  </article>;
}

function ExperimentRow({item}: Readonly<{item: ExperimentRecord}>) {
  return <article className="resultRow experimentRow">
    <div className="resultIndex">{item.experiment_id.replace("exp-", "")}</div>
    <div><h3>{item.title}</h3><p>{item.hypothesis}</p><dl><div><dt>Falsify with</dt><dd>{item.falsification_test}</dd></div><div><dt>Confounder</dt><dd>{item.confounder}</dd></div></dl></div>
    <span className="scaleMark">{item.scale_metres}<small>metres</small></span>
  </article>;
}

function SearchIcon() {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

function ShieldIcon() {
  return <svg className="shieldIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(wordStartPattern, (letter) => letter.toUpperCase());
}

function formatCount(value: number): string {
  return countFormatter.format(value);
}

function formatBytes(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} GB`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} kB`;
  return `${value} B`;
}
