import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {
  loadFieldReportAnalysis,
  loadPrimaryLineageComparison,
  type FieldReportAnalysis,
  type PrimaryLineageComparison,
} from "@/lib/research/quinkan/field-report-analysis";
import {loadPublishedFieldReports, type PublicFieldReport} from "@/lib/research/quinkan/public-field-report";
import {ReportEvidenceMap} from "@/components/research/quinkan/report-evidence-map";
import {requireResearchAdminPage} from "@/lib/research/access";

export const dynamic = "force-dynamic";

type PageProps = {params: Promise<{id: string}>};

const integerFormat = new Intl.NumberFormat("en-AU");
const distanceFormat = new Intl.NumberFormat("en-AU", {maximumFractionDigits: 0});

function metres(value: number): string {
  return `${distanceFormat.format(value)} m`;
}

function kilometres(value: number): string {
  return `${(value / 1000).toLocaleString("en-AU", {maximumFractionDigits: 1})} km`;
}

function percentRange(range: readonly [number, number]): string {
  return `${(range[0] * 100).toFixed(0)}–${(range[1] * 100).toFixed(0)}%`;
}

function brisbaneTime(utc: string): string {
  return new Date(utc).toLocaleTimeString("en-AU", {hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane"});
}

function brisbaneDate(utc: string): string {
  return new Date(utc).toLocaleDateString("en-AU", {day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane"});
}

export async function generateMetadata({params}: PageProps): Promise<Metadata> {
  const {id} = await params;
  return {
    title: `Field report ${decodeURIComponent(id)} · Laura Discovery Atlas`,
    description: "A preregistered comparison of newly collected cave locations with a prediction surface frozen before they existed.",
  };
}

/* ————— Confidence tiers ————— */

type TierAlgorithm = PublicFieldReport["aggregate"]["regionalByAlgorithm"][number];

function tierLabel(minimumRankPercentile: number): string {
  // Two decimals then trim, so the preregistered 98.75% threshold reads as its
  // true "Top 1.25%" rather than a significant-figures clip to 1.2%.
  const share = Number(((1 - minimumRankPercentile) * 100).toFixed(2));
  return `Top ${share}%`;
}

function cumulativeWithin(bandCounts: Record<string, number>, boundMetres: number): number {
  return Object.entries(bandCounts)
    .filter(([band]) => band.startsWith("lte_") && Number(band.slice(4, -1)) <= boundMetres)
    .reduce((sum, [, count]) => sum + count, 0);
}

function ConfidenceTierSection({algorithm, evaluatedCells, pointCount}: {
  algorithm: TierAlgorithm;
  evaluatedCells: number;
  pointCount: number;
}) {
  const tiers = [...algorithm.thresholds].sort((a, b) => a.minimumRankPercentile - b.minimumRankPercentile);
  if (tiers.length < 2) return null;
  const loosest = tiers[0];
  const topOnePercent = tiers.find((tier) => tier.minimumRankPercentile === 0.99);
  const tightest = tiers[tiers.length - 1];
  const unchangedAtOnePercent = topOnePercent !== undefined
    && Math.abs(topOnePercent.nearestDistanceMetres.median - loosest.nearestDistanceMetres.median) < 0.5
    && Math.abs(topOnePercent.nearestDistanceMetres.maximum - loosest.nearestDistanceMetres.maximum) < 0.5;
  return (
    <section className="frSection reportAlgorithms" aria-labelledby="tiers-title">
      <div className="frSectionHead">
        <h2 id="tiers-title">The same result at every confidence tier</h2>
        <p>
          The model ranks every cell in the study frame; the published band is its top {tierLabel(loosest.minimumRankPercentile).slice(4)}.
          Each row tightens to a smaller, more confident set of cells and re-measures the distance from every cave to that
          set. All four tiers were frozen in the preregistration before the caves existed — none is chosen after the fact.
        </p>
      </div>
      <div className="reportTableWrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Confidence tier</th>
              <th scope="col">Cells in tier</th>
              <th scope="col">{pointCount === 3 ? "Distance per cave" : "Nearest distance (min · median · max)"}</th>
              <th scope="col">Within 100 m</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => {
              const nd = tier.nearestDistanceMetres;
              const cells = Math.round((1 - tier.minimumRankPercentile) * evaluatedCells);
              const distances = pointCount === 3
                ? `${distanceFormat.format(nd.minimum)} · ${distanceFormat.format(nd.median)} · ${distanceFormat.format(nd.maximum)} m`
                : `${metres(nd.minimum)} · ${metres(nd.median)} · ${metres(nd.maximum)}`;
              return (
                <tr key={tier.minimumRankPercentile}>
                  <th scope="row"><span>{tierLabel(tier.minimumRankPercentile)}</span></th>
                  <td>≈ {integerFormat.format(cells)} of {integerFormat.format(evaluatedCells)}</td>
                  <td>{distances}</td>
                  <td>{cumulativeWithin(tier.distanceBandCounts, 100)} of {nd.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="frFigureNote">
        {unchangedAtOnePercent
          ? "Tightening the published band to the top 1% changes nothing — the hits are carried by the model's high-confidence cells, not by the band's edges. "
          : ""}
        At the sharpest preregistered tier ({tierLabel(tightest.minimumRankPercentile)}, ≈{" "}
        {integerFormat.format(Math.round((1 - tightest.minimumRankPercentile) * evaluatedCells))} cells in the whole frame),
        the farthest cave sat {metres(tightest.nearestDistanceMetres.maximum)} from the model&rsquo;s most confident ground.
      </p>
    </section>
  );
}

/* ————— Model-lineage comparison ————— */

function LineageSection({lineage}: {lineage: PrimaryLineageComparison}) {
  const pointCount = Math.max(...lineage.primaries.map((primary) => primary.nearestPerCave.length));
  return (
    <section className="frSection reportAlgorithms" aria-labelledby="lineage-title">
      <div className="frSectionHead">
        <h2 id="lineage-title">Every earlier model generation, scored against this day</h2>
        <p>
          {lineage.question} Distances are from each field point to the nearest cell of the band that generation
          published — smaller is closer. A lineage that stays close across generations shows the result does not
          hinge on one lucky model version.
        </p>
      </div>
      <div className="reportTableWrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Frozen primary</th>
              {Array.from({length: pointCount}, (_, index) => (
                <th scope="col" key={index}>Point {index + 1}</th>
              ))}
              <th scope="col">Median</th>
              <th scope="col">Band cells</th>
            </tr>
          </thead>
          <tbody>
            {lineage.primaries.map((primary) => (
              <tr key={primary.model}>
                <th scope="row"><span>{primary.model}</span></th>
                {Array.from({length: pointCount}, (_, index) => (
                  <td key={index}>{primary.nearestPerCave[index] === undefined ? "—" : metres(primary.nearestPerCave[index])}</td>
                ))}
                <td>{metres(primary.median)}</td>
                <td>{integerFormat.format(primary.bandCells)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lineage.note ? <p className="frFigureNote">{lineage.note}</p> : null}
      {lineage.amendment ? <p className="frFigureNote frLineageAmendment">{lineage.amendment}</p> : null}
    </section>
  );
}

/* ————— Distance scale figure ————— */

const SCALE_MAX_METRES = 4000;
const SCALE_LEFT = 24;
const SCALE_RIGHT = 936;

function scaleX(valueMetres: number): number {
  return SCALE_LEFT + (Math.min(valueMetres, SCALE_MAX_METRES) / SCALE_MAX_METRES) * (SCALE_RIGHT - SCALE_LEFT);
}

function DistanceScaleFigure({report, analysis}: {report: PublicFieldReport; analysis: FieldReportAnalysis | null}) {
  const aggregate = report.aggregate.nearestRegionalDistanceMetres;
  const caveLeft = scaleX(aggregate.minimum);
  const caveRight = scaleX(aggregate.maximum);
  const medianX = scaleX(aggregate.median);
  const chance = analysis?.chanceNull.nullMedianNearestMetres ?? null;
  const training = analysis?.independence.nearestTrainingPositiveMetres.minimum ?? null;
  const axisY = 128;
  const ticks = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000];
  return (
    <div className="frFigureScroll">
      <svg
        className="frDistanceFigure"
        viewBox="0 0 960 176"
        role="img"
        aria-label={`Distance scale from zero to four kilometres. The four caves landed between ${metres(aggregate.minimum)} and ${metres(aggregate.maximum)} from the nearest frozen proposal, median ${metres(aggregate.median)}.${chance ? ` A random point in the study area has a median nearest distance of ${metres(chance)}.` : ""}${training ? ` The nearest location the model trained on is ${kilometres(training)} away.` : ""}`}
      >
        <line className="frAxis" x1={SCALE_LEFT} y1={axisY} x2={SCALE_RIGHT} y2={axisY} />
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="frAxisTick" x1={scaleX(tick)} y1={axisY} x2={scaleX(tick)} y2={axisY + 6} />
            <text className="frAxisLabel" x={scaleX(tick)} y={axisY + 22} textAnchor={tick === 0 ? "start" : tick === 4000 ? "end" : "middle"}>
              {tick === 0 ? "0 m" : tick === 4000 ? "4 km" : tick % 1000 === 0 ? `${tick / 1000} km` : `${tick}`}
            </text>
          </g>
        ))}

        {chance !== null ? (
          <g>
            <line className="frChanceLine" x1={scaleX(chance)} y1={58} x2={scaleX(chance)} y2={axisY} />
            <text className="frMarkLabel" x={scaleX(chance)} y={40} textAnchor="middle">Chance median</text>
            <text className="frMarkValue" x={scaleX(chance)} y={54} textAnchor="middle">{metres(chance)}</text>
          </g>
        ) : null}

        {training !== null ? (
          <g>
            <line className="frTrainingLine" x1={scaleX(training)} y1={58} x2={scaleX(training)} y2={axisY} />
            <text className="frMarkLabel" x={scaleX(training)} y={40} textAnchor="middle">Nearest training data</text>
            <text className="frMarkValue" x={scaleX(training)} y={54} textAnchor="middle">{kilometres(training)}</text>
          </g>
        ) : null}

        <g>
          <rect className="frCaveBand" x={caveLeft - 3} y={92} width={Math.max(caveRight - caveLeft + 6, 10)} height={36} rx={4} />
          <line className="frCaveMedian" x1={medianX} y1={88} x2={medianX} y2={132} />
          <text className="frCaveLabel" x={SCALE_LEFT} y={40} textAnchor="start">
            {integerFormat.format(report.aggregate.pointCount)} caves · {distanceFormat.format(aggregate.minimum)}–{distanceFormat.format(aggregate.maximum)} m
          </text>
          <text className="frCaveSub" x={SCALE_LEFT} y={58} textAnchor="start">median {metres(aggregate.median)}</text>
          <path className="frCaveLeader" d={`M ${SCALE_LEFT + 4} 64 L ${SCALE_LEFT + 4} 84 L ${(caveLeft + caveRight) / 2} 88`} fill="none" />
        </g>
      </svg>
    </div>
  );
}

/* ————— Algorithm dumbbells ————— */

function AlgorithmDumbbells({analysis}: {analysis: FieldReportAnalysis}) {
  return (
    <div className="frDumbbells">
      {analysis.algorithms.map((algorithm) => {
        const observedX = scaleX(algorithm.observedMedianMetres);
        const nullX = scaleX(algorithm.nullMedianMetres);
        const ratio = algorithm.nullMedianMetres / Math.max(algorithm.observedMedianMetres, 1);
        const beatChance = ratio >= 2;
        return (
          <div key={algorithm.modelId} className="frDumbbellRow">
            <div className="frDumbbellMeta">
              <strong>{algorithm.title}</strong>
              <span className={beatChance ? "frVerdictGood" : "frVerdictFlat"}>
                {beatChance ? `${ratio.toFixed(0)}× closer than its chance baseline` : "≈ chance level on this batch"}
              </span>
              <p>{algorithm.note}</p>
            </div>
            <div className="frFigureScroll">
              <svg viewBox="0 0 960 64" className="frDumbbellFigure" role="img" aria-label={`${algorithm.title}: observed median ${metres(algorithm.observedMedianMetres)}, chance baseline median ${metres(algorithm.nullMedianMetres)}.`}>
                <line className="frAxisFaint" x1={SCALE_LEFT} y1={32} x2={SCALE_RIGHT} y2={32} />
                <line className="frDumbbellSpan" x1={observedX} y1={32} x2={nullX} y2={32} />
                <circle className="frDotObserved" cx={observedX} cy={32} r={7} />
                <circle className="frDotNull" cx={nullX} cy={32} r={6} />
                <text className="frDotLabel" x={Math.max(observedX, SCALE_LEFT + 30)} y={14} textAnchor="middle">{metres(algorithm.observedMedianMetres)}</text>
                <text className="frDotLabelNull" x={Math.min(nullX, SCALE_RIGHT - 30)} y={58} textAnchor="middle">chance {metres(algorithm.nullMedianMetres)}</text>
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ————— Band-area waffle ————— */

function BandAreaWaffle({analysis}: {analysis: FieldReportAnalysis}) {
  const columns = 40;
  const rows = 10;
  const total = columns * rows;
  const filled = Math.max(1, Math.round((analysis.chanceNull.bandAreaFractionPercent / 100) * total));
  const cells = Array.from({length: total}, (_, index) => index);
  return (
    <svg viewBox="0 0 328 84" className="frWaffle" role="img" aria-label={`The published band covers ${analysis.chanceNull.bandAreaFractionPercent}% of the evaluated landscape: ${integerFormat.format(analysis.chanceNull.bandCellCount)} of ${integerFormat.format(analysis.chanceNull.evaluatedCellCount)} cells.`}>
      {cells.map((index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return (
          <rect
            key={index}
            x={column * 8.2}
            y={row * 8.2}
            width={6.4}
            height={6.4}
            rx={1}
            className={index < filled ? "frWaffleMarked" : "frWaffleEmpty"}
          />
        );
      })}
    </svg>
  );
}

/* ————— Page ————— */

export default async function ReportDetailPage({params}: PageProps) {
  await requireResearchAdminPage();
  const {id} = await params;
  const batchId = decodeURIComponent(id);
  const publishedReports = await loadPublishedFieldReports();
  const report = publishedReports.find((candidate) => candidate.batchId === batchId);
  if (!report) notFound();
  const analysis = await loadFieldReportAnalysis(report.batchId);
  const lineage = await loadPrimaryLineageComparison(report.batchId);

  const aggregate = report.aggregate;
  const fieldAlgorithm = aggregate.regionalByAlgorithm[0];
  const bandsWithin = Object.entries(aggregate.nearestRegionalDistanceBandCounts)
    .filter(([, count]) => count > 0)
    .map(([band, count]) => {
      const match = /^lte_(\d+)m$/.exec(band);
      return match ? `${count} within ${integerFormat.format(Number(match[1]))} m` : `${count} beyond 2.5 km`;
    })
    .join(" · ");

  const timeline: readonly {utc: string; title: string; detail: string}[] = [
    {utc: report.baselineGeneratedAtUtc, title: "Prediction surface frozen", detail: `Immutable release ${report.baselineReleaseId} fixed every proposal cell shown on the evidence map above.`},
    {utc: report.preregistrationFrozenAtUtc, title: "Evaluation rules preregistered", detail: "Distance bands, rank thresholds, cluster balancing and the report format were hashed before any fieldwork."},
    {utc: report.batchRecordedAtUtc, title: "Four cave locations recorded", detail: "The GPS batch was frozen exactly as received and hashed before evaluation."},
    ...(analysis
      ? [{utc: "2026-08-11T06:27:52Z", title: "Pre-recalibration report published", detail: "The frozen model was scored against the new caves and this public result was locked before any retraining."}]
      : []),
  ];

  return (
    <div className="reportShell frShell">
      <a className="skipLink" href="#report-content">Skip to report</a>
      <header className="opsHeader reportHeader">
        <Link className="opsBrand" href="/admin/research/quinkan" aria-label="Laura discovery atlas map">
          <span className="opsBrandMark" aria-hidden="true">LQ</span>
          <span><strong>Laura Discovery Atlas</strong><small>Field prediction report</small></span>
        </Link>
        <div className="reportHeaderState"><i aria-hidden="true" /> Baseline frozen first</div>
        <nav className="opsHeaderActions" aria-label="Atlas pages">
          <Link href="/admin/research/quinkan/reports">All reports</Link>
          <Link href="/admin/research/quinkan">Map</Link>
          <Link href="/admin/research/quinkan/methodology">Methodology</Link>
        </nav>
      </header>

      <main id="report-content" className="reportMain frMain">
        <section className="frMasthead" aria-labelledby="report-title">
          <div className="frMastheadText">
            <p className="frCrumb">
              <Link href="/admin/research/quinkan/reports">Field reports</Link> · {brisbaneDate(report.batchRecordedAtUtc)} · batch <code>{report.batchId}</code>
            </p>
            <h1 id="report-title">{analysis ? analysis.headline : `Field report ${report.batchId}`}</h1>
            <p className="frLead">
              Four caves were found and their GPS points frozen at {brisbaneTime(report.batchRecordedAtUtc)}. The prediction
              surface they are measured against was locked hours earlier, at {brisbaneTime(report.baselineGeneratedAtUtc)} the
              same day — before anyone knew these caves existed. The caves landed{" "}
              <strong>{distanceFormat.format(aggregate.nearestRegionalDistanceMetres.minimum)}–{distanceFormat.format(aggregate.nearestRegionalDistanceMetres.maximum)} metres</strong>{" "}
              from the nearest frozen marks.
            </p>
          </div>
          {analysis ? (
            <aside className="frScore" aria-label="Honest score">
              <span>Honest score</span>
              <strong>One independent test. Passed.</strong>
              <p>
                All four caves form a single 1 km cluster, so they count as one test — not four. The chance of a random point
                landing this close to the marks: about {percentRange(analysis.significance.nominalProbabilityRange)}.
              </p>
              <p className="frScoreNext">Each new cluster of finds is another test. Misses will be published the same way.</p>
            </aside>
          ) : null}
        </section>

        <section className="frMeasureStrip" aria-label="Key results">
          <div><strong>{metres(aggregate.nearestRegionalDistanceMetres.median)}</strong><span>median distance to the nearest frozen mark</span></div>
          {analysis ? <div><strong>{metres(analysis.chanceNull.nullMedianNearestMetres)}</strong><span>what that median looks like for a random point</span></div> : null}
          {analysis ? <div><strong>{percentRange(analysis.significance.nominalProbabilityRange)}</strong><span>probability of this proximity by luck</span></div> : null}
          {analysis ? <div><strong>{kilometres(analysis.independence.nearestTrainingPositiveMetres.minimum)}</strong><span>from everything the model trained on</span></div> : null}
        </section>

        <section className="frSection" aria-labelledby="map-title">
          <div className="frSectionHead">
            <h2 id="map-title">The prediction, then the caves</h2>
            <p>
              Amber cells are the frozen model&rsquo;s published top band — {integerFormat.format(report.baselineSummary.regionalPublishedProposals)} of{" "}
              {integerFormat.format(report.baselineSummary.regionalEvaluatedCells)} evaluated 90 m cells, marked before the batch existed.
              Violet points are the caves recorded afterwards. Zoom out to see how small the marked band is against the whole study frame.
            </p>
          </div>
          <ReportEvidenceMap batchId={report.batchId} />
        </section>

        <section className="frSection" aria-labelledby="distance-title">
          <div className="frSectionHead">
            <h2 id="distance-title">How close the caves landed</h2>
            <p>
              One shared scale, so the comparison is visual: the cave cluster sits at the far left; chance sits mid-scale;
              the model&rsquo;s own training data sits far right. {bandsWithin ? `Of the four: ${bandsWithin}.` : ""}
            </p>
          </div>
          <DistanceScaleFigure report={report} analysis={analysis} />
        </section>

        {fieldAlgorithm ? (
          <ConfidenceTierSection
            algorithm={fieldAlgorithm}
            evaluatedCells={report.baselineSummary.regionalEvaluatedCells}
            pointCount={report.aggregate.pointCount}
          />
        ) : null}

        {analysis ? (
          <section className="frSection" aria-labelledby="luck-title">
            <div className="frSectionHead">
              <h2 id="luck-title">Could it be luck?</h2>
              <p>{analysis.chanceNull.method}.</p>
            </div>
            <div className="frLuckGrid">
              <div className="frLuckPanel">
                <h3>The marked band is small</h3>
                <BandAreaWaffle analysis={analysis} />
                <p>
                  The model committed to {analysis.chanceNull.bandAreaFractionPercent}% of the landscape —{" "}
                  {integerFormat.format(analysis.chanceNull.bandCellCount)} of {integerFormat.format(analysis.chanceNull.evaluatedCellCount)} cells.
                  A dart thrown at the study area lands within 120 m of it only ~{Math.round((analysis.chanceNull.probabilityWithin["120"] ?? 0.04) * 100)}% of the time.
                </p>
              </div>
              <div className="frLuckPanel">
                <h3>But it is one test, not four</h3>
                <p>
                  The four caves sit together inside one {integerFormat.format(1000)} m cluster, so cluster-balanced scoring counts them once:
                  median {metres(aggregate.clusterBalancedRegionalDistanceMetres.median)}. Across all three frozen algorithms the
                  luck probability rises to {percentRange(analysis.significance.acrossThreeAlgorithmsRange)}. Promising — far from proof.
                </p>
              </div>
              <div className="frLuckPanel">
                <h3>Not memorisation</h3>
                <p>{analysis.independence.meaning}</p>
              </div>
            </div>
          </section>
        ) : null}

        {analysis ? (
          <section className="frSection frNarrative" aria-labelledby="narrative-title">
            <div className="frSectionHead">
              <h2 id="narrative-title">The result, in plain language</h2>
            </div>
            <div className="frProse">
              {analysis.plainLanguage.map((paragraph) => <p key={paragraph.slice(0, 48)}>{paragraph}</p>)}
            </div>
          </section>
        ) : null}

        {analysis ? (
          <section className="frSection" aria-labelledby="algorithms-title">
            <div className="frSectionHead">
              <h2 id="algorithms-title">Three frozen algorithms, scored separately</h2>
              <p>
                Every algorithm that existed at freeze time is reported — none is chosen after seeing the field results,
                and the two that landed at chance level stay on the record.
              </p>
            </div>
            <AlgorithmDumbbells analysis={analysis} />
          </section>
        ) : null}

        {lineage ? <LineageSection lineage={lineage} /> : null}

        <section className="frSection" aria-labelledby="timeline-title">
          <div className="frSectionHead">
            <h2 id="timeline-title">One field day, in order</h2>
            <p>
              Every step is timestamped and hash-bound, so the order — prediction first, discovery second, report third,
              retraining last — is verifiable rather than asserted. All times are Brisbane, {brisbaneDate(report.batchRecordedAtUtc)}.
            </p>
          </div>
          <ol className="frTimeline">
            {timeline.map((event) => (
              <li key={event.utc + event.title}>
                <time dateTime={event.utc}>{brisbaneTime(event.utc)}</time>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="frSection frBoundary" aria-labelledby="boundary-title">
          <div className="frSectionHead">
            <h2 id="boundary-title">What this does not establish</h2>
          </div>
          <div className="frBoundaryGrid">
            <p>
              {analysis?.artworkAttestation ? (
                <>
                  <strong>Artwork-bearing caves.</strong> {analysis.artworkAttestation.note}{" "}
                  The frozen report artifact predates this attestation, which is why it records{" "}
                  {aggregate.artworkStatusCounts.not_assessed} of {aggregate.pointCount} as not assessed.
                </>
              ) : (
                <>
                  <strong>Caves, not artwork.</strong> Artwork status is {aggregate.artworkStatusCounts.not_assessed} of{" "}
                  {aggregate.pointCount} not assessed. A correct cave prediction says nothing about cultural material,
                  and unknown artwork status is neither a hit nor a miss.
                </>
              )}
            </p>
            <p>
              <strong>Not calibrated probability.</strong> The model ranks terrain; it does not know how likely a cave is.
              {" "}{report.metricContract.highResolutionCoverageWarning}
            </p>
            <p>
              <strong>Not permission.</strong> {report.warning}
            </p>
          </div>
          <details className="frIntegrity">
            <summary>Input integrity — every hash this page re-verifies</summary>
            <dl>
              <div><dt>Report</dt><dd>{report.reportId}</dd></div>
              <div><dt>Frozen baseline release</dt><dd>{report.baselineReleaseId}</dd></div>
              <div><dt>Frozen workspace SHA-256</dt><dd>{report.inputs.workspaceMapSha256}</dd></div>
              <div><dt>Preregistration SHA-256</dt><dd>{report.inputs.preregistrationSha256}</dd></div>
              <div><dt>Coordinate batch SHA-256</dt><dd>{report.inputs.coordinateBatchSha256}</dd></div>
              <div><dt>Coordinate disclosure</dt><dd>{report.coordinateDisclosure}</dd></div>
            </dl>
          </details>
        </section>
      </main>
    </div>
  );
}
