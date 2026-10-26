import type {Metadata} from "next";
import Link from "next/link";
import {requireResearchAdminPage} from "@/lib/research/access";

export const metadata: Metadata = {
  title: "Methodology · Laura Discovery Atlas",
  description:
    "How the Laura–Quinkan research program acquires, derives, audits, validates and publishes environmental evidence — and the governance boundaries it will not cross.",
};

const pipelineStages = [
  "Acquisition — every source is fetched by a scripted, append-only, no-clobber wrapper that records URL, acquisition time, byte count, SHA-256 and validation state in an immutable manifest. Failed and zero-result acquisitions are preserved as first-class negative results. Acquisition is storage-governed: transfers require byte estimates first and are deferred rather than run when a hard free-space floor would be breached.",
  "Terrain and morphology derivation — a 30 m analysis grid from the national one-second DEM carries slope, aspect, roughness, ruggedness and multi-scale topographic position, alongside a high-resolution proof window derived from Queensland's official 0.5 m bare-earth DTM. Stitching was validated bitwise against a contiguous control export before any derived product was trusted.",
  "Feature extraction — a governed covariate table on a fixed 90 m lattice, grown family by family (geophysics, soils, radar, climate, visibility history). Coverage shrinkage from intersecting source masks is reported honestly, never back-filled. Each new family is audited; none is automatically added to any score.",
  "Ranking hypotheses — explicitly plural and explicitly unlabelled. Percentile-ensemble terrain baselines and independent morphology hypotheses are retained side by side. Ranking uses empirical percentiles, not probability. Roads and tracks are kept out of the morphology score and confined to the observation-bias model.",
  "Audits — every derived product passes a deterministic Rust auditor whose outputs are byte-identical on rerun and refuse to overwrite. Audits cover redundancy and correlation within families, zero-mask ambiguity, exact envelopes, join and seam leakage, and disclosure redaction.",
  "Validation — observed-positive-versus-unlabelled discrimination with train-only standardization, regularized class-balanced logistic fitting, contiguous spatial stripe folds, and a buffer excluded from training on both sides of every fold. Folds that lose a class after buffering are retained as skipped with a reason, never imputed or dropped.",
  "Disclosure review — a separate, human step. Mechanical gates supplement human review; they never replace it.",
  "Publication — one immutable release, built atomically by a fail-closed Rust gate against a human approval record, then a portal cutover with browser and disclosure-scan verification.",
] as const;

const evidenceLadder = [
  "Catalogued — a source pointer exists and is recorded",
  "Downloaded — original bytes are held with an immutable acquisition receipt",
  "Validated — structure, coverage and integrity checks have passed",
  "Derived — an audited product has been computed from validated inputs",
  "Modelled — the product participates in an unlabelled ranking hypothesis",
  "Spatially validated — held-out, buffered spatial evaluation exists",
  "Traditional Owner reviewed — the governing authority has reviewed the result",
  "Field checked — independent field observation has tested the claim",
] as const;

const safeguards = [
  {
    title: "Pre-registration",
    body: "Experiments freeze their question, inputs (by SHA-256), configuration, label construction, sampling rule, fold design, output schema and interpretation before first execution on real data. Where a freeze followed exploratory reconnaissance, the record says so explicitly rather than posing as blind pre-registration.",
    note: "Pre-registration receipts are hashed",
  },
  {
    title: "Controls chosen blind",
    body: "Placebo and control windows are fixed before execution and selected symmetrically or by deterministic hash ordering over frozen metadata — never from morphology values, model results, or visual appeal. Projects with no eligible control window are published as negative results.",
    note: "No retrospective substitution of a better-looking control",
  },
  {
    title: "Leakage hunted, not assumed away",
    body: "Join and source-boundary proximity in rankings is measured directly. Where upper ranks were enriched near data-request joins, the affected ranking sets were quarantined rather than published as candidates.",
    note: "Quarantine is an explicit retained state, not deletion",
  },
  {
    title: "Buffered spatial cross-validation",
    body: "Folds are contiguous spatial stripes with adjacent territory excluded from training. Nearby observations are grouped into roughly one-kilometre clusters so a dense cluster cannot masquerade as independent replication.",
    note: "Macro metrics are secondary to the per-fold pattern",
  },
  {
    title: "Unlabelled is never absent",
    body: "Unrecorded cells, zero search results, cultural stops, non-disclosure and database absence are never converted into negatives. Coverage gaps stay visible as unknowns.",
    note: "No absence in a register is evidence a place lacks heritage",
  },
  {
    title: "Scores are not probabilities",
    body: "The engine reports discrimination, ranks and distances only. Sensitivity, specificity and calibration are declared unidentifiable without governed negatives and survey-effort evidence. Lanes whose apparent skill vanishes against an access-bias-only baseline are rejected, and declared stop conditions exist.",
    note: "An untested morphology baseline is never restyled as likely rock art",
  },
] as const;

const governance = [
  {
    title: "Two release systems, physically separate",
    body: "Public routes read only one explicit, disclosure-reviewed, immutable release. Restricted research lives in a separate authenticated runtime and release tree, sharing no database, storage prefix, token or server-side query path with the public atlas.",
  },
  {
    title: "Fail-closed publication gate",
    body: "The release builder accepts exactly the approved payloads, deserializes into closed types that reject unknown fields, rejects any lexical or resolved path containing a restricted component, rejects symlinks and extra files, verifies every payload against an approved SHA-256, and refuses to overwrite an existing release. Any failed check produces no release at all.",
  },
  {
    title: "Structurally unable to leak geometry",
    body: "Five of the six public payload schemas contain no spatial types. The map payload admits only allowlisted public environmental coverage geometry with upstream identifiers stripped. The public contract cannot express a site coordinate.",
  },
  {
    title: "Human authority, revocable approval",
    body: "Every release binds to a human approval record naming the approver, timestamp, artifact hashes, scope of permission and withdrawal procedure. Permission is revocable; retraction records a tombstone rather than silently rewriting provenance.",
  },
  {
    title: "Coordinate-free audit derivatives",
    body: "Sensitive-source audits write their detailed result only inside the governed restricted tree and emit a separately typed public summary carrying counts, completeness and validation state — no geometry, bounds, centroids, identifiers, attribute values, restricted paths or restricted hashes.",
  },
  {
    title: "Field work is gated, and the model can say no",
    body: "Field activity moves through staged human gates — partnership, data authority, question registration, model freeze, allocation review, visit authority, daily release, evidence review and learning release — with separated duties. A model output must be able to say do not visit, and failure at any gate is an ordinary retained result, never a reason to route around human authority.",
  },
] as const;

const sources = [
  {
    name: "Queensland elevation (QldDem)",
    contribution: "Fine bare-earth morphology in a controlled high-resolution proof window, plus a full census of elevation-project coverage across the study frame.",
    limitation: "A 2.5D bare-earth surface cannot represent overhang interiors; the national 5 m mosaic returned a constant-zero surface over the area and was recorded as a source failure.",
  },
  {
    name: "QSpatial / Queensland spatial estate",
    contribution: "A full public-service census spanning geology, structures, hydrology, regional ecosystems, access, protected areas, fire and land-cover visibility history, and historical map catalogues.",
    limitation: "A census records what the public estate exposed at acquisition time; catalogue coverage is not inspected imagery or a documented survey.",
  },
  {
    name: "SALI soil hydrology",
    contribution: "Grounds otherwise-undocumented drainage and permeability codes in official wetness-limitation descriptions through a data-native join.",
    limitation: "Admitted only as categorical code pairs with source text as provenance; treating the codes as continuous physical measurements remains disallowed.",
  },
  {
    name: "NASA ICESat-2 ATL08 · GEDI",
    contribution: "Catalogued vertical-structure and canopy context via exact footprint intersection with the public boundary, and a verified official subsetting route with a frozen quality-field retention contract.",
    limitation: "Catalogue-only: envelope intersection is not shot coverage, access is authentication-gated, and no science payload has been acquired.",
  },
  {
    name: "OpenAlex · Crossref bibliography",
    contribution: "A source-discovery graph of published research assembled from declarative queries, merged by DOI-preferred identity with provider ranks fused reciprocally.",
    limitation: "No semantic relevance filter and no full texts: broad-search false positives stay visible, and licence fields are evidence to verify, not legal conclusions.",
  },
  {
    name: "Subterranean GDE mapping",
    contribution: "Mapped karst and subterranean hydrogeology, acquired under a pre-registered private-workspace contract as an environmental covariate and observation-process control.",
    limitation: "Excluded from public stages; its public derivative is coordinate-free and remains subject to disclosure review. A polygon is not a cave, a cultural place, or an access route.",
  },
  {
    name: "Continental support families",
    contribution: "DEA land cover and water observations, barest-earth composites, ASTER and weathering products, radiometrics, magnetics, gravity, radar backscatter, climate normals and palaeoclimate reconstructions.",
    limitation: "All currently excluded from the unlabelled score pending governed, spatially held-out ablation — catalogued is not modelled.",
  },
] as const;

const negatives = [
  {
    title: "The placebo nearly matched the target",
    body: "A pre-registered boundary negative control found the declared target only marginally ahead of its strongest spatial placebo, with placebo folds sometimes higher. The verdict was broad spatial nonstationarity, the quarantine stayed in place, and the record explicitly forbids tuning another exclusion distance on the same window.",
  },
  {
    title: "High-resolution rankings quarantined",
    body: "Upper ranks were enriched several-fold near data-request joins, and residual structure survived a 50 m guard. Two of three rankers proved near-duplicates — model-choice sensitivity, not corroboration. No candidate layer was produced.",
  },
  {
    title: "The sharp end of the map is unstable",
    body: "Two plausible baseline variants agree broadly on rank order yet share only a fraction of their top one percent. Plausible feature choices substantially reorder exactly the cells a naive reader would treat as answers.",
  },
  {
    title: "Sources that failed stayed on the record",
    body: "A constant-zero national elevation mosaic, palaeoclimate layers that collapsed into a single native cell over the study area, radar diagnostics with insufficient coverage, and redundant climate pairs were all excluded with their failure documented — none was quietly dropped or quietly kept.",
  },
  {
    title: "Rejected runs are preserved",
    body: "Model runs were rejected for an observation outside a pre-declared support gate, for unregistered metadata, and for a hard-coded prose sentence in an audit; a deployment was halted by a premature disclosure scan. Reruns after fixes produced byte-identical rankings, demonstrating determinism.",
  },
  {
    title: "Imprecise positives were declined",
    body: "Collector localities, rounded duplicate clusters and published-map digitisations with kilometre-scale uncertainty were declined as training positives to avoid false precision and duplicate weighting.",
  },
  {
    title: "Open defects are self-declared",
    body: "The program records its own standing contradictions and unfinished audits — including recommendations from an external methodology review — as open items rather than resolving them rhetorically.",
  },
] as const;

export default async function MethodologyPage() {
  await requireResearchAdminPage();
  return (
    <div className="reportShell">
      <a className="skipLink" href="#methodology-content">Skip to methodology</a>
      <header className="opsHeader reportHeader">
        <Link className="opsBrand" href="/admin/research/quinkan" aria-label="Laura discovery atlas map">
          <span className="opsBrandMark" aria-hidden="true">LQ</span>
          <span><strong>Laura Discovery Atlas</strong><small>Research methodology</small></span>
        </Link>
        <div className="reportHeaderState"><i aria-hidden="true" /> Method of record</div>
        <nav className="opsHeaderActions" aria-label="Atlas pages">
          <Link href="/admin/research/quinkan">Map</Link>
          <Link href="/admin/research/quinkan/evidence">Evidence</Link>
          <Link href="/admin/research/quinkan/reports">Field reports</Link>
          <Link href="/admin/research/quinkan/datasets">Datasets</Link>
          <Link href="/admin/research/quinkan/algorithms">Algorithms</Link>
        </nav>
      </header>

      <main id="methodology-content" className="reportMain">
        <section className="reportIntro" aria-labelledby="methodology-title">
          <div>
            <p className="reportState">Decision-support research — not an autonomous site finder</p>
            <h1 id="methodology-title">Methodology</h1>
            <p className="reportLead">
              This program builds environmental evidence about where the Laura landscape could plausibly form caves and rock
              shelters, under governance that keeps cultural authority with Traditional Owners. Every stage below is designed
              so that a model proposal can never be mistaken for a discovery, and an unrecorded place can never be mistaken
              for an empty one.
            </p>
          </div>
          <aside className="reportReady" aria-label="The two questions">
            <span>Two questions, kept apart</span>
            <strong>Landform first. Culture never inferred.</strong>
            <p>
              Geomorphic suitability — whether terrain plausibly forms a shelter detectable at sensor scale — is modelled.
              Cultural use is a separate hypothesis that only Traditional Owner knowledge and field evidence can test.
              Artwork presence is declared unanswerable from environmental data at all.
            </p>
          </aside>
        </section>

        <section className="reportSequence" aria-labelledby="pipeline-title">
          <div className="reportSectionHeading">
            <h2 id="pipeline-title">The evidence pipeline</h2>
            <p>Eight stages, each auditable, each able to fail without contaminating the others. Failure at any stage is a retained result, not a detour.</p>
          </div>
          <ol>
            {pipelineStages.map((stage, index) => (
              <li key={stage}><span>{String(index + 1).padStart(2, "0")}</span><p>{stage}</p></li>
            ))}
          </ol>
        </section>

        <section className="reportMetrics" aria-labelledby="safeguards-title">
          <div className="reportSectionHeading">
            <h2 id="safeguards-title">Methodological safeguards</h2>
            <p>The safeguards exist because each names a way this kind of research usually deceives itself.</p>
          </div>
          <div className="reportMetricRows">
            {safeguards.map((item) => (
              <article key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <small>{item.note}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="reportMetrics" aria-labelledby="governance-title">
          <div className="reportSectionHeading">
            <h2 id="governance-title">Governance and disclosure architecture</h2>
            <p>
              The public atlas never discloses exact coordinates, geometries, imagery crops, access routes, rank order, or
              environmental fingerprints precise enough to locate a place — without explicit written Traditional Owner
              authorization for that specific disclosure. Predictions are restricted by default because they create cultural
              and physical risk.
            </p>
          </div>
          <div className="reportMetricRows">
            {governance.map((item) => (
              <article key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="reportSequence" aria-labelledby="ladder-title">
          <div className="reportSectionHeading">
            <h2 id="ladder-title">The evidence ladder</h2>
            <p>Every public display names where a claim sits on this ladder. Nothing moves up a rung by presentation alone.</p>
          </div>
          <ol>
            {evidenceLadder.map((rung, index) => (
              <li key={rung}><span>{String(index + 1).padStart(2, "0")}</span><p>{rung}</p></li>
            ))}
          </ol>
        </section>

        <section className="reportAlgorithms" aria-labelledby="sources-title">
          <div className="reportSectionHeading">
            <h2 id="sources-title">Public data sources</h2>
            <p>What each source family contributes, and the limitation the program keeps attached to it. A catalogued source is not a modelled one.</p>
          </div>
          <div className="reportTableWrap methodologyTable">
            <table>
              <thead>
                <tr><th scope="col">Source family</th><th scope="col">Contribution</th><th scope="col">Retained limitation</th></tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.name}>
                    <th scope="row"><span>{source.name}</span></th>
                    <td>{source.contribution}</td>
                    <td>{source.limitation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="reportMetrics" aria-labelledby="negatives-title">
          <div className="reportSectionHeading">
            <h2 id="negatives-title">Documented negative results</h2>
            <p>The program treats failures as evidence and keeps them on the record. These are the ones that shaped the current state.</p>
          </div>
          <div className="reportMetricRows">
            {negatives.map((item) => (
              <article key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="reportCaution" aria-labelledby="methodology-boundary-title">
          <h2 id="methodology-boundary-title">Evidence boundary</h2>
          <p>
            No model score is a discovery. No absence in a register is evidence that a place lacks cultural heritage.
            This atlas is decision-support for a governed research partnership: it does not establish cultural significance,
            artwork presence, calibrated discovery probability, or permission to enter Country. Traditional Owners are the
            governing authority for cultural interpretation, known-place data, candidate disclosure and field access.
          </p>
        </section>
      </main>
    </div>
  );
}
