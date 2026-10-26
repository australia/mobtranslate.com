import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {fieldReportContract} from "@/lib/research/quinkan/field-report-contract";
import {loadFieldReportAnalysis} from "@/lib/research/quinkan/field-report-analysis";
import {loadPublishedFieldReports} from "@/lib/research/quinkan/public-field-report";
import {loadConfiguredWorkspaceRelease} from "@/lib/research/quinkan/workspace-release";
import {metres, numberFormatter} from "@/components/research/quinkan/field-report-sections";
import {requireResearchAdminPage} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Field reports · Laura Discovery Atlas",
  description: "Daily preregistered comparisons of newly collected cave GPS locations with the prediction surface frozen before each batch existed.",
};

function reportDate(utc: string): string {
  return new Date(utc).toLocaleDateString("en-AU", {day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane"});
}

export default async function ReportsIndexPage() {
  await requireResearchAdminPage();
  const [release, publishedReports] = await Promise.all([
    loadConfiguredWorkspaceRelease().catch(() => notFound()),
    loadPublishedFieldReports(),
  ]);
  const analyses = new Map(
    await Promise.all(publishedReports.map(async (report) => [report.batchId, await loadFieldReportAnalysis(report.batchId)] as const)),
  );
  const workspace = release.workspace;
  const regional = workspace.proposalCollections.find((collection) => collection.id === "regional");

  return (
    <div className="reportShell">
      <a className="skipLink" href="#reports-content">Skip to reports</a>
      <header className="opsHeader reportHeader">
        <Link className="opsBrand" href="/admin/research/quinkan" aria-label="Laura discovery atlas map">
          <span className="opsBrandMark" aria-hidden="true">LQ</span>
          <span><strong>Laura Discovery Atlas</strong><small>Field evaluation workspace</small></span>
        </Link>
        <div className="reportHeaderState"><i aria-hidden="true" /> {publishedReports.length > 0 ? "Reports live" : "Awaiting first batch"}</div>
        <nav className="opsHeaderActions" aria-label="Atlas pages">
          <Link href="/admin/research/quinkan">Map</Link>
          <Link href="/admin/research/quinkan/datasets">Datasets</Link>
          <Link href="/admin/research/quinkan/algorithms">Algorithms</Link>
          <Link href="/admin/research/quinkan/calibration-report">Calibration</Link>
          <Link href="/admin/research/quinkan/evidence">Evidence</Link>
          <Link href="/admin/research/quinkan/methodology">Methodology</Link>
        </nav>
      </header>

      <main id="reports-content" className="reportMain">
        <section className="reportIntro" aria-labelledby="reports-title">
          <div>
            <p className="reportState">
              {publishedReports.length > 0
                ? `${numberFormatter.format(publishedReports.length)} ${publishedReports.length === 1 ? "report" : "reports"} published`
                : "Awaiting today’s GPS batch"}
            </p>
            <h1 id="reports-title">Field reports</h1>
            <p className="reportLead">
              One report per GPS batch. Each batch is compared with the prediction surface that was frozen before that
              batch existed, and the result is published before any retraining — so every report measures the old model,
              never a model that already saw the answers.
            </p>
          </div>
          <aside className="reportReady" aria-label="Current evaluation state">
            <span>Next batch</span>
            <strong>Evaluation contract frozen</strong>
            <p>New coordinates are scored against release {fieldReportContract.baselineReleaseId} the moment they arrive, then the model retrains as a separate version.</p>
          </aside>
        </section>

        <section aria-labelledby="report-list-title" className="reportListSection">
          <div className="reportSectionHeading">
            <h2 id="report-list-title">Published reports</h2>
            <p>Newest first. Every report keeps its misses and its chance-baseline analysis.</p>
          </div>
          {publishedReports.length === 0 ? (
            <p className="reportEmpty">No reports yet. The first batch of field coordinates will publish here automatically.</p>
          ) : (
            <div className="reportCards">
              {publishedReports.map((report) => {
                const analysis = analyses.get(report.batchId) ?? null;
                return (
                  <Link key={report.reportId} className="reportCard" href={`/admin/research/quinkan/report/${encodeURIComponent(report.batchId)}`}>
                    <div className="reportCardMain">
                      <span className="reportCardDate">{reportDate(report.batchRecordedAtUtc)}</span>
                      <h3>{analysis ? analysis.headline : `Batch ${report.batchId}`}</h3>
                      <p>
                        {numberFormatter.format(report.aggregate.pointCount)} location{report.aggregate.pointCount === 1 ? "" : "s"} ·{" "}
                        {numberFormatter.format(report.aggregate.spatialClusterCount)} cluster{report.aggregate.spatialClusterCount === 1 ? "" : "s"} ·
                        median {metres(report.aggregate.nearestRegionalDistanceMetres.median)} from the nearest frozen prediction
                      </p>
                      <small>Batch <code>{report.batchId}</code> · baseline {report.baselineReleaseId}</small>
                    </div>
                    <span className="reportCardArrow" aria-hidden="true">→</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="reportBaseline" aria-labelledby="workspace-title">
          <div className="reportSectionHeading">
            <h2 id="workspace-title">Current operational workspace</h2>
            <p>The live surface every future batch will be measured against.</p>
          </div>
          <dl className="reportLedger">
            <div><dt>Operational release</dt><dd>{workspace.releaseId}</dd></div>
            <div><dt>Regional surface</dt><dd>{numberFormatter.format(regional?.evaluatedCells ?? 0)} evaluated 90 m cells</dd></div>
            <div><dt>Published hypotheses</dt><dd>{numberFormatter.format(regional?.publishedMarkers ?? 0)}</dd></div>
            <div><dt>Published reports</dt><dd>{numberFormatter.format(publishedReports.length)}</dd></div>
          </dl>
        </section>

        <section className="reportSequence" aria-labelledby="sequence-title">
          <div className="reportSectionHeading">
            <h2 id="sequence-title">How every report is produced</h2>
            <p>This locked order prevents evaluation leakage.</p>
          </div>
          <ol>
            {fieldReportContract.sequence.map((step, index) => (
              <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>
            ))}
          </ol>
        </section>

        <section className="reportCaution" aria-labelledby="boundary-title">
          <h2 id="boundary-title">Evidence boundary</h2>
          <p>
            Reports assess proximity to environmental survey-priority outputs. They do not establish cultural significance,
            artwork presence, permission to enter a place, or calibrated discovery probability. Exact GPS coordinates appear
            in a public report only with an explicit disclosure decision.
          </p>
        </section>
      </main>
    </div>
  );
}
