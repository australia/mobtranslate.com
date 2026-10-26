import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {findDataset, formatBytes, loadCompendiumDatasets} from "@/lib/research/quinkan/compendium";
import {CompendiumHeader, StatusChip, compendiumDate} from "@/components/research/quinkan/compendium-shared";
import {requireResearchAdminPage} from "@/lib/research/access";

export const dynamic = "force-dynamic";

type PageProps = {params: Promise<{id: string}>};

export async function generateMetadata({params}: PageProps): Promise<Metadata> {
  const {id} = await params;
  return {
    title: `Dataset ${decodeURIComponent(id)} · Laura Discovery Atlas`,
    description: "Provenance, access route, licence, receipts and derived covariates for one dataset in the census.",
  };
}

export default async function DatasetPage({params}: PageProps) {
  await requireResearchAdminPage();
  const {id} = await params;
  const file = await loadCompendiumDatasets();
  const dataset = findDataset(file, decodeURIComponent(id));
  if (!dataset) notFound();
  const covariates = file.covariates.filter((covariate) => covariate.datasetId === dataset.id);

  return (
    <div className="reportShell">
      <a className="skipLink" href="#dataset-content">Skip to dataset</a>
      <CompendiumHeader active="datasets" state={dataset.id} />

      <main id="dataset-content" className="reportMain">
        <nav className="compBreadcrumb" aria-label="Breadcrumb">
          <Link href="/admin/research/quinkan/datasets">← All datasets</Link>
        </nav>

        <section className="reportIntro" aria-labelledby="dataset-title">
          <div>
            <p className="reportState">{dataset.lane} · <code>{dataset.id}</code></p>
            <h1 id="dataset-title">{dataset.name}</h1>
            <p className="reportLead">{dataset.notes.length > 0 ? dataset.notes.split(" | ")[0] : "Catalogued in the dataset census."}</p>
          </div>
          <aside className="reportReady" aria-label="Dataset status">
            <span>Status</span>
            <strong><StatusChip status={dataset.status} /></strong>
            {dataset.statusReason ? <p>{dataset.statusReason}</p> : <p>Recorded in the census tracker with this terminal status.</p>}
          </aside>
        </section>

        <section aria-labelledby="dataset-ledger-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="dataset-ledger-title">Provenance</h2>
            <p>Everything the tracker records about this dataset. Receipts are SHA-256 manifests kept next to the bytes.</p>
          </div>
          <dl className="reportLedger">
            <div><dt>Tier</dt><dd>{dataset.tier ?? "—"}</dd></div>
            <div><dt>Licence</dt><dd>{dataset.licence ?? "—"}</dd></div>
            <div><dt>Downloaded size</dt><dd>{formatBytes(dataset.bytes)}</dd></div>
            <div><dt>Last updated</dt><dd>{compendiumDate(dataset.updatedAt)}</dd></div>
            <div><dt>Access route</dt><dd>{dataset.accessRoute ?? "—"}</dd></div>
            <div><dt>Receipt</dt><dd>{dataset.receiptPath ?? "—"}</dd></div>
          </dl>
          {dataset.url ? (
            <p className="compSourceLink"><a href={dataset.url} rel="noopener noreferrer">Open the source ↗</a></p>
          ) : null}
        </section>

        {dataset.notes.includes(" | ") ? (
          <section aria-labelledby="dataset-notes-title" className="reportListSection compSection">
            <div className="reportSectionHeading">
              <h2 id="dataset-notes-title">Working notes</h2>
              <p>Appended by each campaign session that touched this dataset.</p>
            </div>
            <ul className="compNotes" role="list">
              {dataset.notes.split(" | ").filter((note) => note.trim().length > 0).map((note, index) => (
                <li key={index}>{note.trim()}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="dataset-covariates-title" className="reportListSection compSection">
          <div className="reportSectionHeading">
            <h2 id="dataset-covariates-title">Derived covariates</h2>
            <p>
              {covariates.length > 0
                ? "Model features built from this dataset. Every covariate joins the feature registry before any algorithm may use it."
                : "No model covariates have been derived from this dataset yet."}
            </p>
          </div>
          {covariates.length > 0 ? (
            <div className="compTableWrap">
              <table className="compTable">
                <thead><tr><th scope="col">Covariate column</th><th scope="col">Status</th><th scope="col">Feature registry</th></tr></thead>
                <tbody>
                  {covariates.map((covariate) => (
                    <tr key={covariate.column}>
                      <td><code>{covariate.column}</code></td>
                      <td><StatusChip status={covariate.status} /></td>
                      <td>{covariate.registry ?? "pending"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="compCrossLink">
            See how covariates are used: <Link href="/admin/research/quinkan/algorithms">the algorithm compendium</Link> ·{" "}
            <Link href="/admin/research/quinkan/calibration-report">what changed when they landed</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
