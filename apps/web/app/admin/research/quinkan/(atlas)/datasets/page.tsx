import type {Metadata} from "next";
import Link from "next/link";
import {loadCompendiumDatasets, formatBytes, type CompendiumDataset} from "@/lib/research/quinkan/compendium";
import {CompendiumHeader, StatusChip, compendiumDate} from "@/components/research/quinkan/compendium-shared";
import {numberFormatter} from "@/components/research/quinkan/field-report-sections";
import {requireResearchAdminPage} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Datasets · Laura Discovery Atlas",
  description: "Every dataset in the census: what was downloaded with receipts, what is deferred with a known route, and what is gated or governed — each with its own page.",
};

const laneOrder = (lane: string): string => lane.toLowerCase();

export default async function DatasetsPage() {
  await requireResearchAdminPage();
  const file = await loadCompendiumDatasets();
  const lanes = new Map<string, CompendiumDataset[]>();
  for (const dataset of file.datasets) {
    const list = lanes.get(dataset.lane) ?? [];
    list.push(dataset);
    lanes.set(dataset.lane, list);
  }
  const laneNames = [...lanes.keys()].sort((a, b) => laneOrder(a).localeCompare(laneOrder(b)));
  const downloadedBytes = file.datasets.reduce((sum, dataset) => sum + (dataset.status === "downloaded" ? dataset.bytes ?? 0 : 0), 0);
  const statusEntries = Object.entries(file.statusCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="reportShell">
      <a className="skipLink" href="#datasets-content">Skip to datasets</a>
      <CompendiumHeader active="datasets" state={`${numberFormatter.format(file.datasets.length)} datasets tracked`} />

      <main id="datasets-content" className="reportMain">
        <section className="reportIntro" aria-labelledby="datasets-title">
          <div>
            <p className="reportState">Census of {numberFormatter.format(file.datasets.length)} datasets · {formatBytes(downloadedBytes)} downloaded with receipts</p>
            <h1 id="datasets-title">Datasets</h1>
            <p className="reportLead">
              Everything the prediction system draws on, from the dataset census. Every downloaded file carries a
              SHA-256 receipt; everything not yet downloaded records the exact door that is blocking it, so nothing is
              silently dropped. Click any dataset for its own page.
            </p>
          </div>
          <aside className="reportReady" aria-label="Census state">
            <span>Tracker</span>
            <strong>Updated {compendiumDate(file.generatedAtUtc)}</strong>
            <p>System of record: {file.source}. Status counts and receipts regenerate straight from the tracker.</p>
          </aside>
        </section>

        <section aria-labelledby="status-summary-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="status-summary-title">Status at a glance</h2>
            <p>Terminal statuses only — a dataset is downloaded, deferred with a known route, gated on the operator, governed, or blocked with its door documented.</p>
          </div>
          <ul className="compStatusSummary" role="list">
            {statusEntries.map(([status, count]) => (
              <li key={status}><StatusChip status={status} /><strong>{numberFormatter.format(count)}</strong></li>
            ))}
          </ul>
        </section>

        {laneNames.map((lane) => {
          const rows = lanes.get(lane) ?? [];
          const headingId = `lane-${lane.replaceAll(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
          return (
            <section key={lane} aria-labelledby={headingId} className="reportListSection compSection">
              <div className="reportSectionHeading">
                <h2 id={headingId}>{lane}</h2>
                <p>{numberFormatter.format(rows.length)} dataset{rows.length === 1 ? "" : "s"}</p>
              </div>
              <div className="compTableWrap">
                <table className="compTable">
                  <thead>
                    <tr><th scope="col">Dataset</th><th scope="col">Status</th><th scope="col">Size</th><th scope="col">Licence</th><th scope="col">Covariates</th><th scope="col">Updated</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((dataset) => (
                      <tr key={dataset.id}>
                        <td>
                          <Link className="compRowLink" href={`/admin/research/quinkan/dataset/${encodeURIComponent(dataset.id)}`}>{dataset.name}</Link>
                          <small className="compRowMeta">
                            <code>{dataset.id}</code>
                            {dataset.url ? <> · <a href={dataset.url} rel="noopener noreferrer">source ↗</a></> : null}
                          </small>
                        </td>
                        <td><StatusChip status={dataset.status} /></td>
                        <td className="compNum">{formatBytes(dataset.bytes)}</td>
                        <td>{dataset.licence ?? "—"}</td>
                        <td className="compNum">{dataset.derivedCovariates.length > 0 ? numberFormatter.format(dataset.derivedCovariates.length) : "—"}</td>
                        <td>{compendiumDate(dataset.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {file.deadEnds.length > 0 ? (
          <section aria-labelledby="dead-ends-title" className="reportListSection compSection">
            <div className="reportSectionHeading">
              <h2 id="dead-ends-title">Ruled out</h2>
              <p>Confirmed dead ends — recorded so no future session wastes time rediscovering them.</p>
            </div>
            <ul className="compDeadEnds" role="list">
              {file.deadEnds.map((deadEnd) => (
                <li key={deadEnd.name}><strong>{deadEnd.name}</strong> <span>({deadEnd.lane})</span> — {deadEnd.reason}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="reportCaution" aria-labelledby="datasets-boundary-title">
          <h2 id="datasets-boundary-title">Governance boundary</h2>
          <p>
            Governed sources (cultural-heritage registers, frontier-conflict locations) are catalogued but never
            republished: their rows record custodianship and access conditions only. No dataset on this page contains
            site coordinates.
          </p>
        </section>
      </main>
    </div>
  );
}
