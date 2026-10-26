import type {Metadata} from "next";
import Link from "next/link";
import {connection} from "next/server";
import {requirePrivatePage} from "@/lib/research/quinkan-private/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quinkan private field workspace",
  description: "Authenticated, authorization-bound research workspace.",
  robots: {index: false, follow: false, nocache: true},
};

export default async function Page() {
  await connection();
  const {operatorLabel, release} = await requirePrivatePage("private_workspace:read");
  return (
    <main className="workspace-shell">
      <div className="private-session-bar">
        <div>
          <strong>Private / authorised session</strong>
          <span>{operatorLabel}</span>
        </div>
        <div><span>Restricted workspace · no exports</span></div>
      </div>
      <div className="workspace-content">
      <header>
        <p className="classification-line">Governed field research instrument</p>
        <h1>Quinkan field research workspace</h1>
        <p>Verified operator: {operatorLabel}. Restricted evidence is displayed only inside this authenticated runtime.</p>
      </header>

      <section aria-labelledby="cathedral-heading">
        <h2 id="cathedral-heading">The Cathedral place hypotheses</h2>
        <p>Review all sixteen desk hypotheses, the overview, source limits, and the supporting and opposing case for each place.</p>
        <Link className="workspace-link" href="/admin/research/quinkan/private/cathedral">Open restricted report</Link>
      </section>

      <section aria-labelledby="release-heading">
        <h2 id="release-heading">Immutable release state</h2>
        <dl>
          <dt>Release ID</dt>
          <dd><code>{release.manifest.release_id}</code></dd>
          <dt>Source inventory SHA-256</dt>
          <dd><code>{release.manifest.source_inventory_sha256}</code></dd>
          <dt>Classification</dt>
          <dd>{release.manifest.classification}</dd>
          <dt>Disclosure scope</dt>
          <dd>Exact restricted environmental geometry for authenticated approved subjects</dd>
          <dt>Exact geometry visible now</dt>
          <dd>No — the authenticated layer endpoint is admitted, but the map view awaits visual approval.</dd>
          <dt>Evidence status</dt>
          <dd>Environmental evidence; not observed cultural evidence</dd>
        </dl>
      </section>

      <section aria-labelledby="limits-heading">
        <h2 id="limits-heading">Source, uncertainty, and limits</h2>
        <p>
          The admitted layer is the audited Queensland subterranean groundwater-dependent ecosystem
          source clipped to the governed research boundary. It may support environmental comparison;
          it does not establish where Aboriginal artwork, a newly discovered cave, or a cultural place exists.
        </p>
        <ul>
          {release.admission.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      </section>

      <footer>
        <p>A proposal or environmental layer is not a discovery and is not permission to enter Country.</p>
        <p>Exports are disabled. Authorized display cannot prevent screenshots or browser inspection.</p>
      </footer>
      </div>
    </main>
  );
}
