import type {FieldReportAnalysis} from "@/lib/research/quinkan/field-report-analysis";
import type {PublicFieldReport} from "@/lib/research/quinkan/public-field-report";

export const numberFormatter = new Intl.NumberFormat("en-AU");
export const distanceFormatter = new Intl.NumberFormat("en-AU", {maximumFractionDigits: 0});

export function metres(value: number): string {
  return `${distanceFormatter.format(value)} m`;
}

export function percentile(value: number): string {
  return `${(value * 100).toFixed(value >= 0.999 ? 1 : 2)}%`;
}

export function bandLabel(value: string): string {
  if (value === "gt_2500m") return "> 2,500 m";
  const match = /^lte_(\d+)m$/.exec(value);
  return match ? `≤ ${numberFormatter.format(Number(match[1]))} m` : value;
}

export function AccuracyAnalysis({analysis, headingId}: {analysis: FieldReportAnalysis; headingId: string}) {
  const nullEntries = Object.entries(analysis.chanceNull.probabilityWithin)
    .sort(([left], [right]) => Number(left) - Number(right));
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  return (
    <section className="reportResults" aria-labelledby={`${headingId}-accuracy`}>
      <div className="reportSectionHeading">
        <h2 id={`${headingId}-accuracy`}>Was the prediction accurate?</h2>
        <p>{analysis.headline}</p>
      </div>
      <div className="reportResultCards">
        <article><span>Observed median</span><strong>{metres(analysis.observed.nearestProposalMetres.median)}</strong><small>to the nearest marked cell</small></article>
        <article><span>Chance median</span><strong>{metres(analysis.chanceNull.nullMedianNearestMetres)}</strong><small>random point in the study area</small></article>
        <article><span>Chance of this proximity</span><strong>{pct(analysis.significance.nominalProbabilityRange[0])}–{pct(analysis.significance.nominalProbabilityRange[1])}</strong><small>{analysis.observed.independentClusterCount} independent cluster{analysis.observed.independentClusterCount === 1 ? "" : "s"}</small></article>
        <article><span>Distance from training data</span><strong>{metres(analysis.independence.nearestTrainingPositiveMetres.minimum)}+</strong><small>new area, not memorisation</small></article>
      </div>
      <div className="reportMetricRows">
        {analysis.plainLanguage.map((paragraph) => <article key={paragraph.slice(0, 40)}><p>{paragraph}</p></article>)}
      </div>
      <div className="reportResultGrid">
        <article className="reportResultPanel">
          <h3>Chance baseline</h3>
          <dl>
            {nullEntries.map(([band, probability]) => <div key={band}><dt>≤ {band} m by luck</dt><dd>{pct(probability)}</dd></div>)}
            <div><dt>Marked cells</dt><dd>{numberFormatter.format(analysis.chanceNull.bandCellCount)} of {numberFormatter.format(analysis.chanceNull.evaluatedCellCount)}</dd></div>
          </dl>
        </article>
        <article className="reportResultPanel">
          <h3>Model vs its own chance baseline</h3>
          <dl>
            {analysis.algorithms.map((algorithm) => (
              <div key={algorithm.modelId}><dt>{algorithm.title}</dt><dd>{metres(algorithm.observedMedianMetres)} vs {metres(algorithm.nullMedianMetres)}</dd></div>
            ))}
          </dl>
        </article>
        <article className="reportResultPanel">
          <h3>Honest caveats</h3>
          <dl>
            <div><dt>Independent tests so far</dt><dd>{analysis.observed.independentClusterCount}</dd></div>
            <div><dt>Across all 3 algorithms</dt><dd>{pct(analysis.significance.acrossThreeAlgorithmsRange[0])}–{pct(analysis.significance.acrossThreeAlgorithmsRange[1])}</dd></div>
            <div><dt>Verdict</dt><dd>{analysis.verdict.replaceAll("_", " ")}</dd></div>
          </dl>
        </article>
      </div>
    </section>
  );
}

export function PublishedResults({report, headingId}: {report: PublicFieldReport; headingId: string}) {
  const aggregate = report.aggregate;
  const bandEntries = Object.entries(aggregate.nearestRegionalDistanceBandCounts)
    .sort(([left], [right]) => {
      const numeric = (value: string) => value === "gt_2500m" ? Number.POSITIVE_INFINITY : Number(value.match(/\d+/)?.[0] ?? 0);
      return numeric(left) - numeric(right);
    });

  return (
    <>
      <section className="reportResults" aria-labelledby={headingId}>
        <div className="reportSectionHeading">
          <h2 id={headingId}>Frozen-model result · batch <code>{report.batchId}</code></h2>
          <p>Recorded {report.batchRecordedAtUtc} and evaluated against frozen baseline <code>{report.baselineReleaseId}</code> before recalibration. Exact coordinates are not present in this public artifact.</p>
        </div>
        <div className="reportResultCards">
          <article><span>Field locations</span><strong>{numberFormatter.format(aggregate.pointCount)}</strong><small>{aggregate.confirmedCaveCount} confirmed · {aggregate.uncertainCaveCount} uncertain</small></article>
          <article><span>Spatial clusters</span><strong>{numberFormatter.format(aggregate.spatialClusterCount)}</strong><small>1 km connected components</small></article>
          <article><span>Median nearest proposal</span><strong>{metres(aggregate.nearestRegionalDistanceMetres.median)}</strong><small>Point-weighted regional result</small></article>
          <article><span>Cluster-balanced median</span><strong>{metres(aggregate.clusterBalancedRegionalDistanceMetres.median)}</strong><small>Dense clusters count once</small></article>
        </div>
        <div className="reportResultGrid">
          <article className="reportResultPanel">
            <h3>Nearest regional proposal</h3>
            <dl>
              <div><dt>Minimum</dt><dd>{metres(aggregate.nearestRegionalDistanceMetres.minimum)}</dd></div>
              <div><dt>Median</dt><dd>{metres(aggregate.nearestRegionalDistanceMetres.median)}</dd></div>
              <div><dt>Mean</dt><dd>{metres(aggregate.nearestRegionalDistanceMetres.mean)}</dd></div>
              <div><dt>Maximum</dt><dd>{metres(aggregate.nearestRegionalDistanceMetres.maximum)}</dd></div>
            </dl>
          </article>
          <article className="reportResultPanel">
            <h3>Distance bands</h3>
            <dl>
              {bandEntries.map(([band, count]) => <div key={band}><dt>{bandLabel(band)}</dt><dd>{numberFormatter.format(count)}</dd></div>)}
            </dl>
          </article>
          <article className="reportResultPanel">
            <h3>Five-metre proof window</h3>
            <dl>
              <div><dt>Inside</dt><dd>{aggregate.highResolutionCoverage.insideProofWindowCount}</dd></div>
              <div><dt>Outside · not evaluated</dt><dd>{aggregate.highResolutionCoverage.outsideProofWindowNotEvaluatedCount}</dd></div>
              <div><dt>Median inside</dt><dd>{aggregate.highResolutionCoverage.nearestDistanceMetresInsideWindow ? metres(aggregate.highResolutionCoverage.nearestDistanceMetresInsideWindow.median) : "Not available"}</dd></div>
            </dl>
          </article>
        </div>
      </section>

      <section className="reportAlgorithms" aria-labelledby={`${headingId}-algorithms`}>
        <div className="reportSectionHeading">
          <h2 id={`${headingId}-algorithms`}>Algorithm comparison</h2>
          <p>Median nearest distance at each frozen rank threshold. Every algorithm is shown; none is chosen after seeing the field results.</p>
        </div>
        <div className="reportTableWrap">
          <table>
            <thead><tr><th scope="col">Frozen regional algorithm</th>{report.metricContract.regionalRankThresholds.map((threshold) => <th scope="col" key={threshold}>{percentile(threshold)}</th>)}</tr></thead>
            <tbody>
              {aggregate.regionalByAlgorithm.map((algorithm) => (
                <tr key={algorithm.modelId}>
                  <th scope="row"><span>{algorithm.title}</span><small>{algorithm.modelId}</small></th>
                  {report.metricContract.regionalRankThresholds.map((threshold) => {
                    const result = algorithm.thresholds.find((entry) => entry.minimumRankPercentile === threshold);
                    return <td key={threshold}>{result ? metres(result.nearestDistanceMetres.median) : "Not evaluated"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {report.perLocationResults.length > 0 && (
        <section className="reportLocations" aria-labelledby={`${headingId}-locations`}>
          <div className="reportSectionHeading">
            <h2 id={`${headingId}-locations`}>Approved location-level metrics</h2>
            <p>Only records approved for coordinate-free, per-location disclosure appear here.</p>
          </div>
          <div className="reportLocationList">
            {report.perLocationResults.map((location) => (
              <details key={location.id}>
                <summary><span>{location.workingName}</span><strong>{metres(location.regionalNearest.distanceMetres)}</strong></summary>
                <dl>
                  <div><dt>Cave status</dt><dd>{location.cavePresence}</dd></div>
                  <div><dt>Artwork status</dt><dd>{location.artworkPresence.replace("_", " ")}</dd></div>
                  <div><dt>Regional rank at nearest proposal</dt><dd>{percentile(location.regionalNearest.rankPercentile)}</dd></div>
                  <div><dt>Five-metre coverage</dt><dd>{location.highResolution.coverageState.replaceAll("_", " ")}</dd></div>
                </dl>
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="reportIntegrity" aria-labelledby={`${headingId}-integrity`}>
        <div className="reportSectionHeading">
          <h2 id={`${headingId}-integrity`}>Input integrity</h2>
          <p>The public result is selected by an external SHA-256 pointer and revalidated on every request.</p>
        </div>
        <dl className="reportLedger">
          <div><dt>Report ID</dt><dd>{report.reportId}</dd></div>
          <div><dt>Frozen baseline release</dt><dd>{report.baselineReleaseId}</dd></div>
          <div><dt>Batch recorded</dt><dd>{report.batchRecordedAtUtc}</dd></div>
          <div><dt>Coordinate batch SHA-256</dt><dd>{report.inputs.coordinateBatchSha256}</dd></div>
          <div><dt>Frozen workspace SHA-256</dt><dd>{report.inputs.workspaceMapSha256}</dd></div>
        </dl>
      </section>
    </>
  );
}

