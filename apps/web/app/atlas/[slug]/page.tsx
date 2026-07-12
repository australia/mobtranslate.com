import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, MapPinOff, ExternalLink, Info } from 'lucide-react';
import SharedLayout from '../../components/SharedLayout';
import { glottologUrl, austlangUrl, TIER_LABEL } from '../atlasConfig';

// Minimal, graceful profile (the full unified profile ships in P2). We DO NOT
// pre-render 980 static pages here — this route renders on demand at runtime so
// every language resolves without a 404, without a slow 1,000-page cold build.
export const dynamicParams = true;
export function generateStaticParams() {
  return [] as { slug: string }[];
}

function detailPath(slug: string) {
  return path.join(process.cwd(), 'data', 'atlas', 'languages', `${slug}.json`);
}

function loadDetail(slug: string): any | null {
  try {
    if (!/^[a-z0-9_-]+$/i.test(slug)) return null;
    const p = detailPath(slug);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const d = loadDetail(slug);
  if (!d) return { title: 'Language not found — Atlas of Australian Languages' };
  return {
    title: `${d.canonical_name} — Atlas of Australian Languages`,
    description: `${d.canonical_name}: ${d.family === 'unclassified' ? 'unclassified' : d.family} language profile — classification, Country, grammar and lexical coverage, with honest uncertainty.`,
  };
}

const LEX_LABEL: Record<string, string> = {
  live: 'Live dictionary — words browsable now',
  open_resource: 'Open resource available',
  pointer_only: 'Catalogue pointer only (not open)',
  none: 'No digital lexical data located yet',
};

function Row({
  label,
  children,
  honest,
}: {
  label: string;
  children: React.ReactNode;
  honest?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-48 shrink-0 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`text-[15px] ${honest ? 'text-muted-foreground' : 'text-foreground'}`}>
        {children}
      </dd>
    </div>
  );
}

export default async function LanguageProfile({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const d = loadDetail(slug);
  if (!d) notFound();

  const coords = d.coordinates ?? {};
  const family = d.family === 'unclassified' ? 'Unclassified' : d.family;
  const auto = d.autonym_candidate;

  return (
    <SharedLayout>
      <div className="mx-auto max-w-3xl">
        <Link
          href="/atlas"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Back to the atlas
        </Link>

        {/* Preview banner — this is the P1 minimal profile */}
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <Info size={16} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
          <p className="text-[13px] leading-snug text-foreground/80">
            This is a preview profile. The full unified page — grammar feature tables, live lexicon,
            deep-time tree position, similar languages and per-datum sources — arrives in a later
            phase of the atlas.
          </p>
        </div>

        <header className="mt-6">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary"
          >
            {family}
          </span>
          <h1 className="marketing mt-1 text-4xl font-bold leading-tight text-foreground" lang="mis">
            {d.canonical_name}
          </h1>
          {auto?.value && (
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              Autonym candidate:{' '}
              <span className="font-medium text-foreground" lang="mis">
                {auto.value}
              </span>{' '}
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {auto.status}
              </span>
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
              {TIER_LABEL[d.tier] ?? d.tier}
            </span>
            {d.endangerment?.label && d.endangerment.label !== 'unknown' && (
              <span className="rounded-full border border-border bg-card px-2.5 py-1 capitalize text-foreground">
                {d.endangerment.label}
              </span>
            )}
            {coords.lat != null ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                <MapPin size={12} className="text-primary" />
                {coords.approximate ? 'Location approximate' : 'Located'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-amber-700 dark:text-amber-400">
                <MapPinOff size={12} />
                Location unknown
              </span>
            )}
          </div>
        </header>

        <dl className="mt-6 rounded-2xl border border-border bg-card px-5 py-2 shadow-sm">
          <Row label="Family">
            {family}
            {d.classification_chain && (
              <span className="mt-1 block text-[13px] text-muted-foreground">
                {d.classification_chain.map((c: any) => c.name).join(' › ')}
              </span>
            )}
          </Row>

          <Row
            label="Country & location"
            honest={coords.lat == null || coords.approximate}
          >
            {coords.lat != null ? (
              <>
                {coords.lat.toFixed(3)}, {coords.lon.toFixed(3)}
                <span className="ml-2 text-[13px] text-muted-foreground">
                  ({coords.provenance}
                  {coords.approximate ? ', approximate' : ''})
                </span>
              </>
            ) : (
              'No reliable coordinates — we do not plot an invented point.'
            )}
          </Row>

          <Row label="Grammar profile" honest={!d.grammar?.profiled}>
            {d.grammar?.profiled
              ? `${d.grammar.feature_count} features coded (${[
                  d.grammar.has_grambank && 'Grambank',
                  d.grammar.has_wals && 'WALS',
                  d.grammar.has_db_typology && 'DB typology',
                ]
                  .filter(Boolean)
                  .join(', ')})`
              : 'Not yet grammatically profiled.'}
          </Row>

          <Row
            label="Lexical data"
            honest={d.lexicon?.state === 'none' || d.lexicon?.state === 'pointer_only'}
          >
            {LEX_LABEL[d.lexicon?.state] ?? 'Unknown'}
            {typeof d.lexicon?.word_count === 'number' && d.lexicon.word_count > 0 && (
              <span className="text-muted-foreground"> · {d.lexicon.word_count} entries</span>
            )}
            {d.lexicon?.resource?.url && (
              <a
                href={d.lexicon.resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
              >
                {d.lexicon.resource.title}
                <ExternalLink size={11} />
              </a>
            )}
          </Row>

          <Row label="Deep-time position" honest={!d.deep_time?.dated}>
            {d.deep_time?.dated ? (
              <>
                Divergence ~{Math.round(d.deep_time.divergence_age_bp)} yr BP
                {Array.isArray(d.deep_time.divergence_hpd_bp) && (
                  <span className="text-muted-foreground">
                    {' '}
                    (95% HPD {Math.round(d.deep_time.divergence_hpd_bp[0])}–
                    {Math.round(d.deep_time.divergence_hpd_bp[1])})
                  </span>
                )}
                <span className="mt-1 block text-[12px] text-muted-foreground">
                  Dates the language lineage, not a population arrival.
                </span>
              </>
            ) : (
              'Not in the dated deep-time tree.'
            )}
          </Row>

          <Row label="Codes" honest={!d.ids?.glottocode && !d.ids?.iso639_3}>
            <div className="flex flex-wrap gap-1.5">
              {d.ids?.glottocode ? (
                <a
                  href={glottologUrl(d.ids.glottocode)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 font-mono text-[12px] text-muted-foreground hover:text-foreground"
                >
                  {d.ids.glottocode}
                  <ExternalLink size={10} />
                </a>
              ) : null}
              {d.ids?.iso639_3 && (
                <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 font-mono text-[12px] text-muted-foreground">
                  ISO {d.ids.iso639_3}
                </span>
              )}
              {(d.ids?.austlang ?? []).slice(0, 6).map((a: string) => (
                <a
                  key={a}
                  href={austlangUrl(a)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 font-mono text-[12px] text-muted-foreground hover:text-foreground"
                >
                  {a}
                  <ExternalLink size={10} />
                </a>
              ))}
              {!d.ids?.glottocode && !d.ids?.iso639_3 && (d.ids?.austlang ?? []).length === 0 && (
                <span className="text-muted-foreground">No standard codes assigned.</span>
              )}
            </div>
          </Row>
        </dl>

        <p className="mt-4 text-[12px] leading-snug text-muted-foreground">
          Sources: classification &amp; coordinates from Glottolog 5.3 (CC-BY-4.0); language codes
          and approximate locations from AIATSIS AUSTLANG (CC-BY-4.0); grammar from Grambank / WALS;
          deep-time from Bouckaert, Bowern &amp; Atkinson 2018. Autonyms are unverified candidates
          from alt-name lists and are never asserted as confirmed.
        </p>
      </div>
    </SharedLayout>
  );
}
