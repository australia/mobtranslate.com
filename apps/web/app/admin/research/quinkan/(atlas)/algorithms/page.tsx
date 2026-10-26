import type {Metadata} from "next";
import Link from "next/link";
import {holdoutStats, loadCompendiumAlgorithms, modelStats} from "@/lib/research/quinkan/compendium";
import {CompendiumHeader, probabilityLabel} from "@/components/research/quinkan/compendium-shared";
import {numberFormatter} from "@/components/research/quinkan/field-report-sections";
import {requireResearchAdminPage} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Algorithms · Laura Discovery Atlas",
  description: "Every prediction algorithm in detail: what it uses, what it deliberately excludes, and how it performs when whole spatial clusters are held out.",
};

function percentileLabel(value: number): string {
  return `${(value * 100).toFixed(1)}th`;
}

export default async function AlgorithmsPage() {
  await requireResearchAdminPage();
  const file = await loadCompendiumAlgorithms();

  return (
    <div className="reportShell">
      <a className="skipLink" href="#algorithms-content">Skip to algorithms</a>
      <CompendiumHeader active="algorithms" state={`${numberFormatter.format(file.algorithms.length)} algorithms`} />

      <main id="algorithms-content" className="reportMain">
        <section className="reportIntro" aria-labelledby="algorithms-title">
          <div>
            <p className="reportState">{numberFormatter.format(file.algorithms.length)} models · one shared evaluation harness</p>
            <h1 id="algorithms-title">Algorithms</h1>
            <p className="reportLead">
              Every model is the same core method — positive-only environmental similarity with redundancy-weighted
              percentile ranks — differing only in which covariates it is allowed to see. That design turns the model
              family into an experiment: comparing them isolates what the predictions actually depend on. Click any
              algorithm for its full detail page.
            </p>
          </div>
          <aside className="reportReady" aria-label="Evaluation harness">
            <span>Shared harness</span>
            <strong>Leave-one-cluster-out</strong>
            <p>{file.evaluation}</p>
          </aside>
        </section>

        <section aria-labelledby="holdout-table-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="holdout-table-title">Held-out transfer, side by side</h2>
            <p>
              Each attested cave cluster is removed in turn; the model refits without it and must rank the removed
              caves. “Top 10%” counts held-out caves landing in the top decile of all {""}
              ranked cells; p is the exact binomial chance of at least that many hits under uniform ranks.
            </p>
          </div>
          <div className="compTableWrap">
            <table className="compTable">
              <thead>
                <tr><th scope="col">Algorithm</th><th scope="col">Features</th><th scope="col">Median held-out rank</th><th scope="col">Top 10%</th><th scope="col">Chance</th></tr>
              </thead>
              <tbody>
                {file.algorithms.map((algorithm) => {
                  const holdout = holdoutStats(algorithm);
                  const model = modelStats(algorithm);
                  const topDecile = holdout?.thresholdHits["0.1"] ?? null;
                  return (
                    <tr key={algorithm.id}>
                      <td>
                        <Link className="compRowLink" href={`/admin/research/quinkan/algorithm/${encodeURIComponent(algorithm.id)}`}>{algorithm.title}</Link>
                        <small className="compRowMeta">{algorithm.role}</small>
                      </td>
                      <td className="compNum">{model ? numberFormatter.format(model.featureCount) : "—"}</td>
                      <td className="compNum">{holdout ? percentileLabel(holdout.strictMedianRankPercentile) : "—"}</td>
                      <td className="compNum">{holdout && topDecile ? `${topDecile.heldOutHits}/${holdout.positiveRecords}` : "—"}</td>
                      <td className="compNum">{topDecile ? probabilityLabel(topDecile.chanceProbability) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="compCrossLink">
            The falsification logic: if ranking caves were just ranking “easy to reach”, the access-only baseline would
            match the others. It sits at exactly chance instead. <Link href="/admin/research/quinkan/calibration-report">Read the calibration report →</Link>
          </p>
        </section>

        <section aria-labelledby="method-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="method-title">Where these numbers come from</h2>
            <p>{file.method}</p>
          </div>
          <dl className="reportLedger">
            <div><dt>Compendium generated</dt><dd>{file.generatedAtUtc}</dd></div>
            <div><dt>Evaluation design</dt><dd>strict-spatial-cluster-held-out</dd></div>
          </dl>
        </section>

        <section className="reportCaution" aria-labelledby="algorithms-boundary-title">
          <h2 id="algorithms-boundary-title">Evidence boundary</h2>
          <p>
            These are environmental survey-priority models over 90 m cells. They do not establish cultural significance,
            artwork presence, or permission to enter a place, and with only three known spatial clusters the held-out
            results measure transfer among known environments, not regional generalisation.
          </p>
        </section>
      </main>
    </div>
  );
}
