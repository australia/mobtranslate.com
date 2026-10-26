import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {findAlgorithm, holdoutStats, loadCompendiumAlgorithms, modelStats} from "@/lib/research/quinkan/compendium";
import {CompendiumHeader, probabilityLabel} from "@/components/research/quinkan/compendium-shared";
import {numberFormatter} from "@/components/research/quinkan/field-report-sections";
import {requireResearchAdminPage} from "@/lib/research/access";

export const dynamic = "force-dynamic";

type PageProps = {params: Promise<{id: string}>};

export async function generateMetadata({params}: PageProps): Promise<Metadata> {
  const {id} = await params;
  return {
    title: `Algorithm ${decodeURIComponent(id)} · Laura Discovery Atlas`,
    description: "Feature registry, weight structure, held-out performance and artifacts for one prediction algorithm.",
  };
}

const topFractionLabels: Record<string, string> = {
  "0.01": "Top 1%",
  "0.025": "Top 2.5%",
  "0.05": "Top 5%",
  "0.1": "Top 10%",
};

export default async function AlgorithmPage({params}: PageProps) {
  await requireResearchAdminPage();
  const {id} = await params;
  const file = await loadCompendiumAlgorithms();
  const algorithm = findAlgorithm(file, decodeURIComponent(id));
  if (!algorithm) notFound();
  const holdout = holdoutStats(algorithm);
  const model = modelStats(algorithm);
  const holdoutNote = "error" in algorithm.holdout ? algorithm.holdout.error : null;

  return (
    <div className="reportShell">
      <a className="skipLink" href="#algorithm-content">Skip to algorithm</a>
      <CompendiumHeader active="algorithms" state={algorithm.id} />

      <main id="algorithm-content" className="reportMain">
        <nav className="compBreadcrumb" aria-label="Breadcrumb">
          <Link href="/admin/research/quinkan/algorithms">← All algorithms</Link>
        </nav>

        <section className="reportIntro" aria-labelledby="algorithm-title">
          <div>
            <p className="reportState">{algorithm.role}</p>
            <h1 id="algorithm-title">{algorithm.title}</h1>
            <p className="reportLead">{algorithm.description}</p>
          </div>
          <aside className="reportReady" aria-label="Model identity">
            <span>Model</span>
            <strong><code>{algorithm.modelId}</code></strong>
            <p>{algorithm.registry}</p>
          </aside>
        </section>

        <section aria-labelledby="algorithm-method-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="algorithm-method-title">How it scores a cell</h2>
            <p>The shared method every variant runs; only the admitted covariates differ.</p>
          </div>
          <ol className="compMethodSteps">
            <li><span>01</span><p>For every admitted covariate, take the cluster-balanced median over the attested caves as that covariate’s target, so no single dense cluster dominates.</p></li>
            <li><span>02</span><p>Score each 90 m cell by its distance to each target, converted to an empirical percentile over all evaluated cells.</p></li>
            <li><span>03</span><p>Weight covariates by the inverse of their correlation load, so ten near-duplicate hydrology columns share the influence of one.</p></li>
            <li><span>04</span><p>Average the weighted percentiles into one priority score; publication uses percentile bands, never raw scores.</p></li>
          </ol>
        </section>

        <section aria-labelledby="algorithm-holdout-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="algorithm-holdout-title">Held-out performance</h2>
            <p>
              {holdout
                ? `Strict leave-one-spatial-cluster-out over ${numberFormatter.format(holdout.positiveRecords)} attested cave records${holdout.clusters ? ` in ${numberFormatter.format(holdout.clusters)} clusters` : ""}: the model never sees the cluster it is asked to find.`
                : holdoutNote ?? "No holdout audit is available for this artifact."}
            </p>
          </div>
          {holdout ? (
            <>
              <dl className="reportLedger">
                <div><dt>Median held-out rank</dt><dd>{(holdout.strictMedianRankPercentile * 100).toFixed(1)}th percentile</dd></div>
                <div><dt>Mean held-out rank</dt><dd>{(holdout.strictMeanRankPercentile * 100).toFixed(1)}th percentile</dd></div>
              </dl>
              <div className="compTableWrap">
                <table className="compTable">
                  <thead>
                    <tr><th scope="col">Band</th><th scope="col">Held-out caves in band</th><th scope="col">Expected by chance</th><th scope="col">Chance probability</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(holdout.thresholdHits)
                      .sort((a, b) => Number(a[0]) - Number(b[0]))
                      .map(([fraction, hits]) => (
                        <tr key={fraction}>
                          <td>{topFractionLabels[fraction] ?? `Top ${(Number(fraction) * 100).toFixed(1)}%`}</td>
                          <td className="compNum">{hits.heldOutHits}/{holdout.positiveRecords}</td>
                          <td className="compNum">{hits.expectedUnderChance === null ? "—" : hits.expectedUnderChance.toFixed(1)}</td>
                          <td className="compNum">{probabilityLabel(hits.chanceProbability)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>

        {model ? (
          <section aria-labelledby="algorithm-weights-title" className="reportListSection compSection">
            <div className="reportSectionHeading">
              <h2 id="algorithm-weights-title">Weight structure</h2>
              <p>
                {numberFormatter.format(model.featureCount)} covariates; the largest single weight is{" "}
                {(model.maxWeight * 100).toFixed(1)}% of the total, so no single feature can carry the ranking. The ten
                heaviest:
              </p>
            </div>
            <div className="compTableWrap">
              <table className="compTable">
                <thead><tr><th scope="col">Covariate</th><th scope="col">Weight</th></tr></thead>
                <tbody>
                  {model.topWeights.map((weight) => (
                    <tr key={weight.column}>
                      <td><code>{weight.column}</code></td>
                      <td className="compNum">{(weight.weight * 100).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="compCrossLink">
              Covariates trace back to their sources on the <Link href="/admin/research/quinkan/datasets">dataset pages</Link>.
            </p>
          </section>
        ) : null}

        <section aria-labelledby="algorithm-artifacts-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="algorithm-artifacts-title">Artifacts</h2>
            <p>Research-repository paths (restricted tree; rankings hold coordinates, so they are never published raw).</p>
          </div>
          <dl className="reportLedger">
            <div><dt>Model config</dt><dd>{algorithm.artifacts.modelConfig}</dd></div>
            <div><dt>Ranking</dt><dd>{algorithm.artifacts.rankingCsv}</dd></div>
            <div><dt>Holdout audit</dt><dd>{algorithm.artifacts.clusterHoldoutAudit}</dd></div>
          </dl>
        </section>
      </main>
    </div>
  );
}
