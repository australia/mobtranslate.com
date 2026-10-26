import type {Metadata} from "next";
import Link from "next/link";
import {requireResearchAdminPage} from "@/lib/research/access";

export const metadata: Metadata = {
  title: "Terms · Laura Discovery Atlas",
  description: "Terms of use for the Laura Discovery Atlas and its Google Maps content.",
};

export default async function TermsPage() {
  await requireResearchAdminPage();
  return (
    <div className="reportShell">
      <a className="skipLink" href="#terms-content">Skip to terms</a>
      <header className="legalHeader">
        <Link href="/admin/research/quinkan">← Atlas</Link>
        <strong>Laura Discovery Atlas</strong>
        <Link href="/admin/research/quinkan/privacy">Privacy</Link>
      </header>
      <main id="terms-content" className="reportMain legalMain">
        <header className="legalIntro">
          <p>Research-use terms · effective 15 August 2026</p>
          <h1>Terms of use</h1>
          <p>Use the atlas as an evidence and planning instrument, with its provenance, uncertainty and governance warnings intact.</p>
        </header>
        <section>
          <h2>Google content</h2>
          <p>Use of Google map, satellite, terrain, 3D, traffic, transit, bicycle and Street View content is subject to the <a href="https://maps.google.com/help/terms_maps/" rel="noopener noreferrer">Google Maps/Google Earth Additional Terms of Service</a> and the <a href="https://policies.google.com/terms" rel="noopener noreferrer">Google Terms of Service</a>. Do not remove, obscure or alter Google or third-party attribution.</p>
        </section>
        <section>
          <h2>Research interpretation</h2>
          <p>Model markers are exploratory survey-priority ranks, not probabilities, discoveries, cultural claims or evidence that a cave or artwork exists. A rank does not confer access, field-visit, excavation, collection or publication permission.</p>
          <p>Native-title boundaries are legal reference records only. They are not a cultural-heritage register, an access-rights determination or a substitute for engagement with Traditional Owners and custodians.</p>
        </section>
        <section>
          <h2>Field use and accuracy</h2>
          <p>Road, track, watercourse, terrain, imagery, traffic and Street View information can be incomplete, outdated or unavailable. Do not rely on the atlas as a sole navigation, emergency, access, water-availability or safety source. Verify current conditions and permissions with the relevant authorities and custodians.</p>
        </section>
        <section>
          <h2>Public overlays and reuse</h2>
          <p>Each non-Google evidence layer retains its own source, licence, acquisition record and interpretation note. Reuse is governed by that source licence and attribution, not by a blanket atlas licence. GPX exports contain the atlas’s public observations and hypotheses; their warnings and governance boundaries continue to apply after export.</p>
          <p>See the <Link href="/admin/research/quinkan/privacy">privacy notice</Link> for browser-location and Google Maps data handling.</p>
        </section>
      </main>
    </div>
  );
}
