import type {Metadata} from "next";
import Link from "next/link";
import {requireResearchAdminPage} from "@/lib/research/access";

export const metadata: Metadata = {
  title: "Privacy · Laura Discovery Atlas",
  description: "Privacy notice for the Laura Discovery Atlas, including its Google Maps JavaScript integration.",
};

export default async function PrivacyPage() {
  await requireResearchAdminPage();
  return (
    <div className="reportShell">
      <a className="skipLink" href="#privacy-content">Skip to privacy notice</a>
      <header className="legalHeader">
        <Link href="/admin/research/quinkan">← Atlas</Link>
        <strong>Laura Discovery Atlas</strong>
        <Link href="/admin/research/quinkan/terms">Terms</Link>
      </header>
      <main id="privacy-content" className="reportMain legalMain">
        <header className="legalIntro">
          <p>Operational notice · effective 15 August 2026</p>
          <h1>Privacy</h1>
          <p>The atlas is a research interface. This notice explains the browser and network data involved when you use its public maps.</p>
        </header>
        <section>
          <h2>Google Maps</h2>
          <p>When the Google map engine is selected, your browser requests map, imagery, 3D and Street View content directly from Google. Google can receive ordinary request information such as your IP address, browser and referring site, plus the map area and features you request. Google handles that information under the <a href="https://policies.google.com/privacy" rel="noopener noreferrer">Google Privacy Policy</a>.</p>
          <p>The atlas currently uses Maps JavaScript API capabilities only. It does not call Google Places, Routes, Geocoding, Elevation, Static Maps or Map Tiles APIs.</p>
        </section>
        <section>
          <h2>Location and map interactions</h2>
          <p>The atlas asks for browser location only after you choose “My location.” A location fix is used to centre the map and draw an accuracy circle. The atlas does not send or save that fix to its own server, although viewing that area on Google Maps necessarily requests Google map content for the area.</p>
          <p>Clicked coordinates, copied coordinates, distance and area measurements, and GPX assembly are processed in your browser. The atlas does not save them to its server. Street View opens only when you choose it or use Google’s on-map control.</p>
        </section>
        <section>
          <h2>Local preferences and service records</h2>
          <p>The open-atlas engine can store your last selected basemap in browser local storage. Clearing site data removes that preference. The application does not install advertising or behavioural-analytics code. Hosting and access-control systems may retain ordinary security and request logs under their operators’ retention policies.</p>
        </section>
        <section>
          <h2>Research data and contact</h2>
          <p>The public interface serves only its admitted public release and approved public reference layers. Restricted cultural-site and candidate geometry belongs to a physically separate authenticated workspace and is not sent to Google by this public integration.</p>
          <p>To raise a privacy or withdrawal concern, use the project contact route provided by the atlas operator. See also the <Link href="/admin/research/quinkan/terms">atlas terms</Link>.</p>
        </section>
      </main>
    </div>
  );
}
