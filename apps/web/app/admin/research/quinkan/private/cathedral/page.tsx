import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import {notFound} from "next/navigation";
import {connection} from "next/server";
import {authorizePrivateRequest, logPrivateAuthorizationFailure} from "@/lib/research/quinkan-private/authorize";
import {
  loadConfiguredCathedralReport,
  type CathedralHypothesis,
} from "@/lib/research/quinkan-private/cathedral-report-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Cathedral hypotheses · Quinkan private workspace",
  description: "Restricted, authenticated review of The Cathedral place hypotheses.",
  robots: {index: false, follow: false, nocache: true},
};

const interpretation: Record<string, Readonly<{for: string; against: string}>> = {
  H01: {
    for: "Best joint fit to the supplied position and flat-bench clue. A broad high surface sits immediately above a strong break, with strong hydrogeomorphic support and a top-one-percent environmental cell nearby.",
    against: "The 90 m cell is fairly flat, not slab-level flat. The visible pale texture could still be vegetation, illumination, or ordinary sandstone exposure.",
  },
  H02: {
    for: "The local summit-axis maximum: very flat, elevated, beside a steep edge, and consistently high across the environmental comparison surfaces.",
    against: "It is much farther from the reported point than H01 or H06, and the image shows a broad summit rather than a uniquely diagnostic stone concentration.",
  },
  H03: {
    for: "The strongest scarp morphology in the search window. It preserves the possibility that the name refers to a wall, recess, or flat crown beside a sharp break.",
    against: "The selected cell is itself very steep, conflicts with a literal flat-surface description, and lies at the outer search boundary.",
  },
  H04: {
    for: "A pronounced plateau rim with very strong no-access and full-context environmental support among the southern alternatives.",
    against: "The selected cell is steep rather than flat. It remains plausible only if the rumour describes an adjacent platform or a wall-associated surface.",
  },
  H05: {
    for: "An unusually flat, prominent plateau surface with a very steep edge nearby—a strong physical match to the flat-surface clue.",
    against: "It is distant from the supplied point and the imagery cannot distinguish a slab group from an ordinary plateau surface.",
  },
  H06: {
    for: "The strongest nearby alternative to H01: very flat, beside a steep break, with comparatively clear pale linear and jointed-looking texture at QSat scale.",
    against: "Its terrain/geology rank is modest, and the texture could be vegetation or ordinary jointed bedrock rather than a named stone place.",
  },
  H07: {
    for: "An almost level high surface directly east of a strong break, fitting a flat pavement or platform interpretation.",
    against: "It is more distant, has weaker environmental support than the leading alternatives, and contains no object-scale evidence.",
  },
  H08: {
    for: "A broad, visibly mottled and locally prominent bench with high environmental-model support.",
    against: "It is materially less flat than the summit alternatives, much lower than most candidates, and far from the supplied point.",
  },
  H09: {
    for: "Very flat rim and summit morphology, strong cross-model support, and a steep neighbouring edge.",
    against: "It is almost two kilometres west at the search limit, and the image offers no unique visual discriminator.",
  },
  H10: {
    for: "A genuinely flat, elevated surface with strong no-access and full-context support and a global top-one-percent environmental cell nearby.",
    against: "It has less pronounced edge relief than H01, H02, H05, or H06, while its visible texture remains ambiguous.",
  },
  H11: {
    for: "The cell itself sits in the environmental median's global top one percent, with unusually consistent terrain, geology, and hydrogeomorphic support.",
    against: "It is at the search limit, only moderately prominent, and not especially flat. Model similarity should not outweigh the position and form clues.",
  },
  H12: {
    for: "Clear scarp and incision morphology with strong cross-model support, preserving a wall or recess-associated interpretation.",
    against: "The cell strongly conflicts with literal flatness and is secondary unless an adjacent platform is the true referent.",
  },
  H13: {
    for: "A highly prominent bench or crown with an unusually steep neighbouring edge and a clear plateau-break context.",
    against: "The selected cell is not very flat, is distant, and receives weak terrain and geology support.",
  },
  H14: {
    for: "The flattest selected cell and almost exactly east-west aligned with the supplied point.",
    against: "Low prominence, no strong nearby scarp, and weaker environmental support make it a poor match to a monumental wall or edge interpretation.",
  },
  H15: {
    for: "The most locally prominent selected surface, with very strong terrain, geology, and hydrogeomorphic support.",
    against: "It is not flat at 90 m scale and may be selecting a bench edge rather than the reported flat stone surface.",
  },
  H16: {
    for: "A relatively close, prominent northern bench with very strong no-access, hydrogeomorphic, and full-context support.",
    against: "It is only moderately flat and visually less distinctive than H01 or H06 at the available resolution.",
  },
};

function metres(value: number): string {
  return new Intl.NumberFormat("en-AU", {maximumFractionDigits: 0}).format(value);
}

function percentile(value: number): string {
  return (value * 100).toFixed(2);
}

function axisName(value: CathedralHypothesis["selection"]["bestAxis"]): string {
  return value.replace("Axis", "");
}

function mapSource(mapPath: string): string {
  const filename = mapPath.slice("maps/".length);
  return `/api/admin/research/quinkan/private/cathedral/maps/${encodeURIComponent(filename)}`;
}

function Hypothesis({item}: Readonly<{item: CathedralHypothesis}>) {
  const reasoning = interpretation[item.hypothesisId];
  if (!reasoning) throw new Error("Cathedral interpretation register is incomplete");
  const leading = item.hypothesisId === "H01" || item.hypothesisId === "H06";
  return (
    <article className="hypothesis" id={item.hypothesisId.toLowerCase()}>
      <div className="hypothesis-heading">
        <div>
          <p className="hypothesis-id">{item.hypothesisId}</p>
          <h2>{item.workingName}</h2>
        </div>
        <span className={leading ? "status status-leading" : "status"}>
          {leading ? "Leading review" : `${axisName(item.selection.bestAxis)} cue`}
        </span>
      </div>

      <div className="hypothesis-layout">
        <figure className="map-figure">
          <Image
            alt={`${item.hypothesisId} ${item.workingName} restricted QSat hypothesis map`}
            className="report-map"
            height={900}
            loading="lazy"
            src={mapSource(item.map)}
            unoptimized
            width={1320}
          />
          <figcaption>
            Cyan marks the selected 90 m cell and 250 m review area; orange marks the steepest
            nearby 30 m cell. Imagery texture is not field confirmation.
          </figcaption>
        </figure>

        <div className="hypothesis-evidence">
          <dl className="fact-list">
            <div><dt>Cell centre</dt><dd>{item.location.latitude.toFixed(6)}, {item.location.longitude.toFixed(6)}</dd></div>
            <div><dt>From supplied point</dt><dd>{metres(item.location.distanceFromSuppliedPointMetres)} m</dd></div>
            <div><dt>Elevation</dt><dd>{item.terrain.elevationMetres.toFixed(1)} m</dd></div>
            <div><dt>Slope at cell</dt><dd>{item.terrain.slopeDegrees.toFixed(1)}°</dd></div>
            <div><dt>TPI at 300 m</dt><dd>{item.terrain.tpi300mMetres > 0 ? "+" : ""}{item.terrain.tpi300mMetres.toFixed(1)} m</dd></div>
            <div><dt>Steepest ≤300 m</dt><dd>{item.terrain.steepestWithin300m.slopeDegrees.toFixed(1)}°</dd></div>
            <div><dt>Local cue</dt><dd>{axisName(item.selection.bestAxis)} rank {item.selection.bestAxisRankWithinSearchWindow}</dd></div>
            <div><dt>No-access ordering</dt><dd>Percentile {percentile(item.modelGlobalRankPercentiles.noAccess)}</dd></div>
          </dl>

          <div className="reasoning-block reasoning-for">
            <h3>Why it remains possible</h3>
            <p>{reasoning.for}</p>
          </div>
          <div className="reasoning-block">
            <h3>What argues against it</h3>
            <p>{reasoning.against}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function CathedralPage() {
  await connection();
  try {
    const [authorized, cathedral] = await Promise.all([
      authorizePrivateRequest("private_workspace:read"),
      loadConfiguredCathedralReport(),
    ]);
    const {operatorLabel, release} = authorized;
    const {report, manifestSha256} = cathedral;

    return (
      <main className="report-shell">
        <div className="private-session-bar">
          <div>
            <strong>Private / authorised session</strong>
            <span>{operatorLabel}</span>
          </div>
          <div>
            <span>Exact restricted geometry visible</span>
            <Link href="/admin/research/quinkan/private">Workspace</Link>
          </div>
        </div>

        <header className="report-header">
          <div className="report-title-block">
            <p className="classification-line">Restricted place-hypothesis report · 14 August 2026</p>
            <h1>The Cathedral</h1>
            <p className="report-lede">
              A reproducible review of every spatially distinct place hypothesis produced by the
              declared two-kilometre screen around the supplied location.
            </p>
          </div>
          <div className="report-guard" role="note" aria-label="Interpretation boundary">
            <strong>Desk hypotheses only</strong>
            <p>No field confirmation, discovery claim, access authority, or permission to publish coordinates.</p>
          </div>
        </header>

        <section className="report-facts" aria-label="Report facts">
          <div><span>Hypotheses</span><strong>{report.hypotheses.length}</strong></div>
          <div><span>Cells evaluated</span><strong>{metres(report.searchContract.evaluated90mCells)}</strong></div>
          <div><span>Search radius</span><strong>{metres(report.searchContract.radiusMetres)} m</strong></div>
          <div><span>Imagery</span><strong>{String(report.sourceState.imagery.year)} QSat · 2.4 m</strong></div>
        </section>

        <section className="overview-section" aria-labelledby="finding-heading">
          <div className="finding-copy">
            <h2 id="finding-heading">Current best reading</h2>
            <p>
              <strong>H01, Reported-point bench</strong>, is the strongest working hypothesis. Its
              terrain-cell centre lies 48 m from the supplied coordinate on a fairly flat, prominent
              bench beside a steep break. The visible surface is compatible with exposed or thinly
              vegetated sandstone, but the source resolution cannot resolve individual slabs.
            </p>
            <p>
              <strong>H06, East jointed bench</strong>, 681 m east, is the strongest nearby alternate.
              The remaining set deliberately preserves summit, bench, and scarp interpretations so
              the wording of the rumour is not forced into one landform.
            </p>
          </div>
          <figure className="overview-figure">
            <Image
              alt="Restricted overview map showing all sixteen Cathedral place hypotheses"
              className="overview-map"
              height={1500}
              priority
              src={mapSource(report.overviewMap)}
              unoptimized
              width={1930}
            />
            <figcaption>
              The white ring is the declared 2 km search area. H01 nearly overlaps the red supplied point.
            </figcaption>
          </figure>
        </section>

        <section className="method-section" aria-labelledby="method-heading">
          <div>
            <h2 id="method-heading">How to read this page</h2>
            <p>{report.searchContract.meaning}</p>
          </div>
          <dl className="method-list">
            <div><dt>Bench</dt><dd>Flatness, edge texture, prominence, spectral exposure, and environmental support.</dd></div>
            <div><dt>Summit</dt><dd>Flatness, prominence, spectral exposure, and environmental support.</dd></div>
            <div><dt>Scarp</dt><dd>Slope, roughness, cliff-prone lithology, and environmental support.</dd></div>
          </dl>
          <p className="rank-warning">
            Percentiles are whole-frame environmental-similarity orderings. They are not probabilities,
            and the underlying audits have no governed negatives or independent field validation.
          </p>
        </section>

        <nav className="hypothesis-index" aria-label="Hypothesis index">
          <span>Jump to</span>
          {report.hypotheses.map((item) => (
            <a href={`#${item.hypothesisId.toLowerCase()}`} key={item.hypothesisId}>
              {item.hypothesisId}
            </a>
          ))}
        </nav>

        <section className="hypothesis-register" aria-label="All hypotheses">
          {report.hypotheses.map((item) => <Hypothesis item={item} key={item.hypothesisId} />)}
        </section>

        <section className="next-evidence" aria-labelledby="next-evidence-heading">
          <h2 id="next-evidence-heading">Evidence that would reduce uncertainty</h2>
          <ol>
            <li>Record the rumour's source, original device and datum, uncertainty radius, approach direction, nearby creek or ridge, walking time, and why the name “Cathedral” was used.</li>
            <li>Ask whether “flat” describes the ground, the individual stones, or a platform beside a wall or overhang.</li>
            <li>Seek a custodian-approved current sub-metre orthophoto, historic family photograph, or photogrammetry surface before treating visible texture as stone geometry.</li>
            <li>Keep confirmed, ruled-out, inaccessible, not-observed, and indeterminate outcomes as separate evidence states.</li>
          </ol>
        </section>

        <details className="provenance-details">
          <summary>Source, geology, and immutable release details</summary>
          <div className="provenance-body">
            <p>
              The official Queensland geology response identifies {report.sourceState.geology.unit}: {report.sourceState.geology.lithology}.
              The {report.sourceState.geology.landSystem} land system includes deeply dissected quartz-sandstone plateaux and shallow rocky soils.
            </p>
            <p>{report.sourceState.imagery.limitation}</p>
            <p>{report.sourceState.elevation.limitation}</p>
            <dl className="release-list">
              <div><dt>Report ID</dt><dd><code>{report.reportId}</code></dd></div>
              <div><dt>Report manifest</dt><dd><code>{manifestSha256}</code></dd></div>
              <div><dt>Private workspace release</dt><dd><code>{release.manifest.release_id}</code></dd></div>
              <div><dt>Source inventory</dt><dd><code>{release.manifest.source_inventory_sha256}</code></dd></div>
            </dl>
            <p>
              Governance context: <a href="https://www.dcceew.gov.au/parks-heritage/heritage/places/national/quinkan-country" rel="noreferrer">Australian Government Quinkan Country guidance</a>.
            </p>
          </div>
        </details>

        <footer className="report-footer">
          <strong>A proposal is not a discovery and is not permission to enter Country.</strong>
          <span>Exports are disabled. Authenticated display cannot prevent screenshots or browser inspection.</span>
        </footer>
      </main>
    );
  } catch (error) {
    logPrivateAuthorizationFailure(error);
    notFound();
  }
}
