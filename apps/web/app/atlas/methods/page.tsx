import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import SharedLayout from '../../components/SharedLayout';

export const metadata: Metadata = {
  title: 'Methods & sources — Atlas of Australian Languages',
  description:
    'How the Atlas of Australian Languages is built: the canonical set, the data planes joined at build time, the coordinate and autonym uncertainty policies, and every upstream dataset with its licence.',
};

export const dynamic = 'force-static';

function loadManifest() {
  try {
    const p = path.join(process.cwd(), 'data', 'atlas', 'manifest.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export default function MethodsPage() {
  const manifest = loadManifest();
  const sources: any[] = manifest?.source_datasets ?? [];
  const caveats: string[] = manifest?.caveats ?? [];
  const release = manifest?.data_release_version ?? '1.0.0';

  return (
    <SharedLayout>
      <div className="mx-auto max-w-3xl py-6">
        <Link
          href="/atlas"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Back to the atlas
        </Link>

        <header className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Methods &amp; sources
          </p>
          <h1 className="marketing mt-1 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            How this atlas is sourced
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            The atlas is assembled from open scholarly datasets and served as versioned static
            artifacts — never a live database query. The full methodology page (canonical-set
            derivation, join keys, coverage tables and downloadable CSV/GeoJSON/CLDF bundles with a
            citation) arrives in a later phase; the upstream sources and standing caveats are below,
            in the open, now.{' '}
            <span className="whitespace-nowrap font-medium text-foreground">
              Data release {release}.
            </span>
          </p>
        </header>

        {sources.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Upstream datasets
            </h2>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Dataset</th>
                    <th className="px-4 py-2.5 font-semibold">Version</th>
                    <th className="px-4 py-2.5 font-semibold">Licence</th>
                    <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Used for</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s, i) => (
                    <tr
                      key={s.name}
                      className={i % 2 ? 'bg-card' : 'bg-card/40'}
                    >
                      <td className="px-4 py-2.5 font-medium text-foreground">{s.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.version}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded-full bg-secondary/12 px-2 py-0.5 text-[11px] font-medium text-secondary">
                          {s.license}
                        </span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                        {s.role}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {caveats.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Standing caveats
            </h2>
            <ul className="mt-3 space-y-3">
              {caveats.map((c) => (
                <li
                  key={c}
                  className="rounded-xl border border-border bg-muted/30 p-4 text-[13px] leading-relaxed text-muted-foreground"
                >
                  {c}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Attribution &amp; respect</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            With thanks to Glottolog, Grambank, WALS, PHOIBLE, D-PLACE, AIATSIS AUSTLANG, and
            Bouckaert, Bowern &amp; Atkinson, whose open work makes this possible — and, above all, to
            the language communities and custodians whose knowledge this records. Historical
            (19th-century) wordlists are shown as colonial sources, not community-approved lexicons.
            Communities are the final authority on their own languages.
          </p>
        </section>
      </div>
    </SharedLayout>
  );
}
