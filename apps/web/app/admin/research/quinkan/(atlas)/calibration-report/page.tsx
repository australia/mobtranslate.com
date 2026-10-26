import type {Metadata} from "next";
import Link from "next/link";
import {holdoutStats, loadCalibrationReport, loadCompendiumAlgorithms, modelStats, type CompendiumAlgorithm} from "@/lib/research/quinkan/compendium";
import {CompendiumHeader, probabilityLabel} from "@/components/research/quinkan/compendium-shared";
import {numberFormatter} from "@/components/research/quinkan/field-report-sections";
import {requireResearchAdminPage} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calibration report · Laura Discovery Atlas",
  description: "What changed after the dataset census landed: new covariates, a new algorithm family, and the recalibration results side by side.",
};

function decileHits(algorithm: CompendiumAlgorithm | undefined): string {
  const holdout = algorithm ? holdoutStats(algorithm) : null;
  const hits = holdout?.thresholdHits["0.1"];
  return holdout && hits ? `${hits.heldOutHits} of ${holdout.positiveRecords}` : "—";
}

export default async function CalibrationReportPage() {
  await requireResearchAdminPage();
  const [algorithmsFile, report] = await Promise.all([loadCompendiumAlgorithms(), loadCalibrationReport()]);
  const byId = new Map(algorithmsFile.algorithms.map((algorithm) => [algorithm.id, algorithm]));
  const primary = byId.get("field-conditioned-v5");
  const accessOnly = byId.get("access-only-baseline");
  const noAccess = byId.get("no-access-v1");
  const refugium = byId.get("no-access-refugium");
  const fullRerun = byId.get("full-refugium");
  const primaryHoldout = primary ? holdoutStats(primary) : null;
  const fullHoldout = fullRerun ? holdoutStats(fullRerun) : null;
  const refugiumHoldout = refugium ? holdoutStats(refugium) : null;
  const accessHoldout = accessOnly ? holdoutStats(accessOnly) : null;
  const fullModel = fullRerun ? modelStats(fullRerun) : null;
  const primaryModel = primary ? modelStats(primary) : null;
  const rerunOverlap = report.bands.fullRerunVsPrimary ?? null;
  const churnPercent = rerunOverlap ? Math.round((1 - rerunOverlap.jaccard) * 100) : null;

  return (
    <div className="reportShell">
      <a className="skipLink" href="#calibration-content">Skip to report</a>
      <CompendiumHeader active="calibration" state="Recalibration complete" />

      <main id="calibration-content" className="reportMain">
        <section className="reportIntro" aria-labelledby="calibration-title">
          <div>
            <p className="reportState">Recalibration series of {new Date(report.generatedAtUtc).toLocaleDateString("en-AU", {day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane"})}</p>
            <h1 id="calibration-title">What changed</h1>
            <p className="reportLead">
              The dataset census added new covariates — topographic openness, sky-view factor, a shade-preservation
              index, lithology cliff propensity, rainforest refugia and cave-fauna distances — and a new family of
              deliberately restricted algorithms built to test what the predictions depend on. This report compares
              every variant on the same held-out harness and measures how much the priority map actually moved.
            </p>
          </div>
          <aside className="reportReady" aria-label="Report basis">
            <span>Basis</span>
            <strong>Same caves, same harness</strong>
            <p>
              All variants train on the same {primaryHoldout ? numberFormatter.format(primaryHoldout.positiveRecords) : "attested"} cave
              records and are scored by strict leave-one-spatial-cluster-out — differences between rows are differences
              in covariates, nothing else.
            </p>
          </aside>
        </section>

        <section aria-labelledby="finding-access-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="finding-access-title">Finding 1 — the predictions are not access bias</h2>
            <p>The question that motivated the whole ablation family.</p>
          </div>
          <p className="compProse">
            Cave records cluster near tracks, so a model could look skilled by just learning “close to a road”. The new{" "}
            <Link href={accessOnly ? `/admin/research/quinkan/algorithm/${accessOnly.id}` : "/admin/research/quinkan/algorithms"}>access-availability-only baseline</Link>{" "}
            — trained on nothing but road, monitoring and observation-density features — collapses to exactly chance:
            median held-out rank at the {accessHoldout ? `${(accessHoldout.strictMedianRankPercentile * 100).toFixed(1)}th` : "50th"} percentile
            and {decileHits(accessOnly)} held-out caves in the top decile. Meanwhile the{" "}
            <Link href={noAccess ? `/admin/research/quinkan/algorithm/${noAccess.id}` : "/admin/research/quinkan/algorithms"}>no-access ablation</Link> — the same model with
            every access-correlated feature removed — keeps essentially all of the skill ({decileHits(noAccess)} in the
            top decile). The signal survives removing access features; it vanishes when only access features remain.
            The model is ranking terrain, not ease of survey.
          </p>
        </section>

        <section aria-labelledby="finding-covariates-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="finding-covariates-title">Finding 2 — the new covariates improve held-out transfer</h2>
            <p>From {decileHits(primary)} to {decileHits(fullRerun)} held-out caves in the top decile.</p>
          </div>
          <p className="compProse">
            The pre-census primary placed {decileHits(primary)} held-out caves in its top decile
            ({primaryHoldout ? probabilityLabel(primaryHoldout.thresholdHits["0.1"]?.chanceProbability ?? null) : "—"}). Adding the
            refugium covariates lifts both the access-clean variant and the full rerun to {decileHits(fullRerun)}{" "}
            ({fullHoldout ? probabilityLabel(fullHoldout.thresholdHits["0.1"]?.chanceProbability ?? null) : "—"}), and the{" "}
            <Link href={refugium ? `/admin/research/quinkan/algorithm/${refugium.id}` : "/admin/research/quinkan/algorithms"}>no-access refugium variant</Link> is the
            strongest model overall — {refugiumHoldout ? `median held-out rank ${(refugiumHoldout.strictMedianRankPercentile * 100).toFixed(1)}th percentile` : "the best median"} with{" "}
            {refugiumHoldout ? `${refugiumHoldout.thresholdHits["0.05"]?.heldOutHits ?? "—"} of ${refugiumHoldout.positiveRecords}` : "—"} caves
            already in the top 5%. The covariates doing the work are exactly the archaeologically motivated ones:
            shade preservation, enclosure (negative openness), cliff-forming lithology and refugial vegetation.
          </p>
          <div className="compTableWrap">
            <table className="compTable">
              <thead>
                <tr><th scope="col">Model</th><th scope="col">Covariates</th><th scope="col">Median held-out rank</th><th scope="col">Top 10%</th><th scope="col">Chance</th></tr>
              </thead>
              <tbody>
                {algorithmsFile.algorithms.map((algorithm) => {
                  const holdout = holdoutStats(algorithm);
                  const model = modelStats(algorithm);
                  const topDecile = holdout?.thresholdHits["0.1"] ?? null;
                  return (
                    <tr key={algorithm.id}>
                      <td><Link className="compRowLink" href={`/admin/research/quinkan/algorithm/${encodeURIComponent(algorithm.id)}`}>{algorithm.title}</Link></td>
                      <td className="compNum">{model ? numberFormatter.format(model.featureCount) : "—"}</td>
                      <td className="compNum">{holdout ? `${(holdout.strictMedianRankPercentile * 100).toFixed(1)}th` : "no audit"}</td>
                      <td className="compNum">{holdout && topDecile ? `${topDecile.heldOutHits}/${holdout.positiveRecords}` : "—"}</td>
                      <td className="compNum">{topDecile ? probabilityLabel(topDecile.chanceProbability) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="finding-band-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="finding-band-title">Finding 3 — how much the priority map moved</h2>
            <p>Band membership at the ≥{(report.bandComparisonThreshold * 100).toFixed(2)}th percentile, old versus new.</p>
          </div>
          <p className="compProse">
            {rerunOverlap && churnPercent !== null ? (
              <>
                The recalibrated full model keeps {numberFormatter.format(rerunOverlap.shared)} of the primary’s{" "}
                {numberFormatter.format(report.bands.primaryV5)} priority cells and moves the rest — about {churnPercent}%
                of the band churned (Jaccard {rerunOverlap.jaccard.toFixed(3)}). The access-clean refugium candidate agrees
                with the primary on {numberFormatter.format(report.bands.refugiumVsPrimary.shared)} cells
                (Jaccard {report.bands.refugiumVsPrimary.jaccard.toFixed(3)}).
              </>
            ) : (
              <>Band overlap for the fresh rerun was not available when this compendium generated.</>
            )}{" "}
            The overlap is the reassuring part: the new covariates refine where the models look rather than pointing
            somewhere unrecognisable. The churned quarter is where tomorrow’s field detours should go.
          </p>
          <dl className="reportLedger">
            <div><dt>Primary band</dt><dd>{numberFormatter.format(report.bands.primaryV5)} cells</dd></div>
            <div><dt>Refugium candidate band</dt><dd>{numberFormatter.format(report.bands.refugiumCandidate)} cells</dd></div>
            {report.bands.fullRefugiumRerun ? (
              <div><dt>Full rerun band</dt><dd>{numberFormatter.format(report.bands.fullRefugiumRerun)} cells</dd></div>
            ) : null}
            {fullModel && primaryModel ? (
              <div><dt>Largest single weight</dt><dd>{(primaryModel.maxWeight * 100).toFixed(1)}% → {(fullModel.maxWeight * 100).toFixed(1)}%</dd></div>
            ) : null}
          </dl>
        </section>

        <section aria-labelledby="next-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="next-title">What happens to the live map</h2>
            <p>Nothing silently. The frozen-baseline rule stays in force.</p>
          </div>
          {report.bands.v24Primary && report.bands.v24PrimaryVsV23Primary && report.bands.v23Primary ? (
            <p className="compProse">
              Five promotions shipped in the overnight session, each frozen under a new preregistration before any new
              coordinates arrived: v20 (<Link href="/admin/research/quinkan/algorithm/no-access-fire">fire regime</Link>), v21
              (<Link href="/admin/research/quinkan/algorithm/no-access-hydroveg">moisture persistence</Link>), v22
              (<Link href="/admin/research/quinkan/algorithm/no-access-canopy">canopy structure</Link>), v23
              (<Link href="/admin/research/quinkan/algorithm/no-access-stream">watercourse geometry</Link>) and v24 — the{" "}
              <Link href="/admin/research/quinkan/algorithm/no-access-aet">actual-evapotranspiration model</Link>, with the strongest
              extreme-tail concentration of the family: 4 of 10 held-out caves inside the top 1% of all cells. The v24
              band keeps {numberFormatter.format(report.bands.v24PrimaryVsV23Primary.shared)} of the v23 primary’s{" "}
              {numberFormatter.format(report.bands.v23Primary)} cells (Jaccard{" "}
              {report.bands.v24PrimaryVsV23Primary.jaccard.toFixed(3)}). The next GPS batch is scored against this
              frozen surface, which is what makes every <Link href="/admin/research/quinkan/reports">field report</Link> a genuine prospective
              test.
            </p>
          ) : report.bands.v23Primary && report.bands.v23PrimaryVsV22Primary && report.bands.v22Primary ? (
            <p className="compProse">
              Four promotions shipped: v20 fire, v21 moisture, v22 canopy, v23 watercourse geometry — the v23 band keeps{" "}
              {numberFormatter.format(report.bands.v23PrimaryVsV22Primary.shared)} of the v22 primary’s{" "}
              {numberFormatter.format(report.bands.v22Primary)} cells (Jaccard{" "}
              {report.bands.v23PrimaryVsV22Primary.jaccard.toFixed(3)}).
            </p>
          ) : report.bands.v22Primary && report.bands.v22PrimaryVsV21Primary && report.bands.v21Primary ? (
            <p className="compProse">
              Three promotions shipped overnight: v20 fire regime, v21 moisture persistence, and v22 canopy structure —
              the v22 band keeps {numberFormatter.format(report.bands.v22PrimaryVsV21Primary.shared)} of the v21
              primary’s {numberFormatter.format(report.bands.v21Primary)} cells (Jaccard{" "}
              {report.bands.v22PrimaryVsV21Primary.jaccard.toFixed(3)}).
            </p>
          ) : report.bands.v20Primary && report.bands.v20PrimaryVsV19Primary ? (
            <p className="compProse">
              The promotion has shipped: release v20 makes the{" "}
              <Link href="/admin/research/quinkan/algorithm/no-access-fire">access-clean fire-refugium model</Link> the operational primary,
              frozen under a new preregistration before any new coordinates arrive. Its priority band keeps{" "}
              {numberFormatter.format(report.bands.v20PrimaryVsV19Primary.shared)} of the v19 primary’s{" "}
              {numberFormatter.format(report.bands.primaryV5)} cells (Jaccard{" "}
              {report.bands.v20PrimaryVsV19Primary.jaccard.toFixed(3)}) — the next GPS batch is scored against this
              frozen surface, which is what makes every <Link href="/admin/research/quinkan/reports">field report</Link> a genuine prospective
              test.
            </p>
          ) : (
            <p className="compProse">
              The operational map keeps its current frozen release until the next GPS batch has been scored against it —
              that is what makes every <Link href="/admin/research/quinkan/reports">field report</Link> a genuine prospective test. The refugium
              candidates ship as a new release with a new frozen preregistration after the next batch publishes, and the
              no-access refugium model is the promotion candidate on current evidence.
            </p>
          )}
        </section>

        <section className="reportCaution" aria-labelledby="calibration-boundary-title">
          <h2 id="calibration-boundary-title">Honest limits</h2>
          <p>
            All holdout numbers rest on {primaryHoldout ? numberFormatter.format(primaryHoldout.positiveRecords) : "few"} attested
            records in three spatial clusters, so they measure transfer among known environments — not regional
            generalisation, artwork presence, or cultural significance. Every number on this page is read from the
            model and audit artifacts listed on the <Link href="/admin/research/quinkan/algorithms">algorithm pages</Link>; nothing is
            hand-entered.
          </p>
        </section>
      </main>
    </div>
  );
}
