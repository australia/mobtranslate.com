import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  MapPin,
  MapPinOff,
  ExternalLink,
  BookOpen,
  Clock,
  Network,
  Languages as LanguagesIcon,
  ChevronRight,
} from 'lucide-react';
import SharedLayout from '../../components/SharedLayout';
import {
  glottologUrl,
  austlangUrl,
  TIER_LABEL,
  COORD_PROVENANCE_LABEL,
  PN_COLOR,
  UNCLASSIFIED_COLOR,
  OTHER_FAMILY_COLOR,
  NONPN_PALETTE,
} from '../atlasConfig';
import ProfileMiniMap from './ProfileMiniMap';
import FeatureTable, { type AtlasFeature } from './FeatureTable';

// On-demand ISR: we do NOT cold-build ~980 static pages. Each languoid renders
// on first request and caches for a week; a nightly warm crawler (P6) keeps
// historians off cold misses. generateStaticParams returns [] by design.
export const dynamicParams = true;
export const revalidate = 604800; // 7 days
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

// Deterministic family → locator-dot colour (mirrors the hub palette spirit
// without needing the full located-set counts).
function familyColor(family: string | null | undefined): string {
  if (!family || family === 'unclassified') return UNCLASSIFIED_COLOR;
  if (family === 'Pama-Nyungan') return PN_COLOR;
  let h = 0;
  for (let i = 0; i < family.length; i++) h = (h * 31 + family.charCodeAt(i)) >>> 0;
  return NONPN_PALETTE[h % NONPN_PALETTE.length] ?? OTHER_FAMILY_COLOR;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const d = loadDetail(slug);
  if (!d) return { title: 'Language not found — Atlas of Australian Languages' };
  const fam = d.family === 'unclassified' ? 'unclassified' : d.family;
  return {
    title: `${d.canonical_name} — Atlas of Australian Languages`,
    description: `${d.canonical_name}: ${fam} language profile — full classification, Country, grammar feature table, lexical coverage, deep-time position and related languages, with per-datum sources and honest uncertainty.`,
    alternates: { canonical: `/atlas/${slug}` },
  };
}

// keyed on the actual AES labels present in the data (spaces, not underscores)
const ENDANGERMENT_TONE: Record<string, string> = {
  'not endangered':
    'border-eucalyptus-500/40 text-eucalyptus-800 dark:text-eucalyptus-300 bg-eucalyptus-500/10',
  shifting: 'border-amber-500/40 text-amber-800 dark:text-amber-300 bg-amber-500/10',
  threatened: 'border-amber-600/40 text-amber-800 dark:text-amber-300 bg-amber-500/10',
  moribund: 'border-ochre-700/40 text-ochre-800 dark:text-ochre-300 bg-ochre-600/10',
  'nearly extinct': 'border-red-600/40 text-red-700 dark:text-red-300 bg-red-500/10',
  extinct: 'border-red-700/40 text-red-700 dark:text-red-300 bg-red-600/10',
};

// -------------------------------------------------- small server-side helpers

function Section({
  id,
  icon,
  title,
  children,
  meta,
}: {
  id: string;
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-8">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold uppercase tracking-[0.12em] text-foreground">
          {icon}
          {title}
        </h2>
        {meta && <span className="text-[12px] text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function HonestPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/25 px-4 py-5 text-[14px] leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

function SourceLine({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 py-2 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-[13px] text-foreground/85">{value}</dd>
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
  const located = coords.lat != null && coords.lon != null;
  const family = d.family === 'unclassified' ? 'Unclassified' : d.family;
  const famColor = familyColor(d.family);
  const auto = d.autonym_candidate;
  const chain: { glottocode: string; name: string }[] = d.classification_chain ?? [];
  const grammar = d.grammar ?? {};
  const features: AtlasFeature[] = grammar.features ?? [];
  const fsum = grammar.features_summary;
  const lex = d.lexicon ?? {};
  const dt = d.deep_time ?? {};
  const related: any[] = d.related ?? [];
  const simRelated = related.filter((r) => r.basis === 'grammar-similarity');
  const sibRelated = related.filter((r) => r.basis === 'same-subgroup');
  const endTone = d.endangerment?.label
    ? ENDANGERMENT_TONE[d.endangerment.label] ?? 'border-border bg-card text-foreground'
    : '';

  return (
    <SharedLayout>
      <div className="mx-auto max-w-4xl">
        <Link
          href="/atlas"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:rounded"
        >
          <ArrowLeft size={15} />
          Back to the atlas
        </Link>

        {/* ------------------------------------------------------------ HERO */}
        <header className="mt-6">
          <Link
            href="/atlas"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary hover:underline"
          >
            {family}
          </Link>
          <h1
            className="marketing mt-1.5 text-4xl font-bold leading-tight text-foreground sm:text-5xl"
            lang="mis"
          >
            {d.canonical_name}
          </h1>

          {auto?.value ? (
            <p className="mt-2 text-[15px] text-muted-foreground">
              Autonym candidate:{' '}
              <span className="font-medium text-foreground" lang="mis">
                {auto.value}
              </span>{' '}
              <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                {auto.status}
              </span>
              {auto.all_candidates_count > 1 && (
                <span className="ml-1 text-[12px] text-muted-foreground">
                  · {auto.all_candidates_count} name candidates recorded
                </span>
              )}
            </p>
          ) : (
            <p className="mt-2 text-[14px] text-muted-foreground">
              No autonym candidate recorded — we do not assert a name we cannot source.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
              {TIER_LABEL[d.tier] ?? d.tier}
            </span>
            {d.endangerment?.label && d.endangerment.label !== 'unknown' ? (
              <span className={`rounded-full border px-2.5 py-1 font-medium capitalize ${endTone}`}>
                {d.endangerment.label.replace(/_/g, ' ')}
                {d.endangerment.aes_level != null && (
                  <span className="ml-1 opacity-70">· AES {d.endangerment.aes_level}</span>
                )}
              </span>
            ) : (
              <span className="rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                Endangerment unknown
              </span>
            )}
            {located ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                <MapPin size={12} className="text-primary" />
                {coords.approximate ? 'Location approximate' : 'Located'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-800 dark:text-amber-300">
                <MapPinOff size={12} />
                Location not reliably known
              </span>
            )}
            {dt.dated && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                <Clock size={12} className="text-primary" />
                In the dated tree
              </span>
            )}
          </div>
        </header>

        <div className="mt-10 space-y-8">
          {/* ------------------------------------------------ CLASSIFICATION */}
          <Section
            id="classification"
            icon={<Network size={15} className="text-primary" />}
            title="Classification"
            meta={d.classification_state === 'classified' ? 'Glottolog family tree' : 'unclassified'}
          >
            {chain.length ? (
              <nav aria-label="Classification path">
                <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[14px]">
                  {chain.map((node, i) => (
                    <li key={node.glottocode ?? i} className="flex items-center gap-1">
                      {node.glottocode ? (
                        <a
                          href={glottologUrl(node.glottocode)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-primary/10 hover:text-primary"
                        >
                          {node.name}
                        </a>
                      ) : (
                        <span className="px-1.5 py-0.5 text-foreground">{node.name}</span>
                      )}
                      <ChevronRight size={13} className="text-muted-foreground" aria-hidden />
                    </li>
                  ))}
                  <li className="rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary" lang="mis">
                    {d.canonical_name}
                  </li>
                </ol>
              </nav>
            ) : (
              <HonestPanel>
                This languoid is not placed in a family tree in the open Glottolog export — its
                classification is <span className="font-medium text-foreground">unclassified</span> in
                our sources. That is an honest gap, not a claim of isolation.
              </HonestPanel>
            )}
          </Section>

          {/* ------------------------------------------------------ LOCATION */}
          <Section
            id="location"
            icon={<MapPin size={15} className="text-primary" />}
            title="Country & location"
            meta={COORD_PROVENANCE_LABEL[coords.provenance] ?? undefined}
          >
            {located ? (
              <div className="grid gap-4 sm:grid-cols-[1fr_1.15fr]">
                <div className="flex flex-col justify-center gap-2">
                  <p className="font-mono text-[15px] text-foreground">
                    {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Provenance: <span className="text-foreground">{coords.provenance}</span>
                  </p>
                  {coords.approximate && (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] leading-snug text-amber-800 dark:text-amber-300">
                      {coords.provenance === 'derived_centroid'
                        ? `Approximate — derived as the mean of sibling-leaf coordinates${
                            coords.derived_via ? ` (${coords.derived_via})` : ''
                          }. A drawing convenience, not a claim about where the language is spoken.`
                        : 'Approximate point (AUSTLANG). Indicative of Country, not a precise boundary.'}
                    </p>
                  )}
                  <p className="text-[11.5px] text-muted-foreground">
                    A point locates a language for reference; it never represents the full extent of a
                    people&rsquo;s Country.
                  </p>
                </div>
                <div className="h-60 overflow-hidden rounded-xl border border-border sm:h-full sm:min-h-[15rem]">
                  <ProfileMiniMap
                    lat={coords.lat}
                    lon={coords.lon}
                    color={famColor}
                    approximate={!!coords.approximate}
                    name={d.canonical_name}
                  />
                </div>
              </div>
            ) : (
              <HonestPanel>
                <span className="font-medium text-foreground">Location not reliably known.</span> No
                Glottolog point, AUSTLANG approximate location, or usable subgroup centroid is
                available for this languoid, so we deliberately plot no point rather than invent one.
                It remains fully catalogued here and in the directory.
              </HonestPanel>
            )}
          </Section>

          {/* ------------------------------------------------------- GRAMMAR */}
          <Section
            id="grammar"
            icon={<Network size={15} className="text-primary rotate-90" />}
            title="Grammar profile"
            meta={
              fsum
                ? `${fsum.coded} coded · ${fsum.unknown} unknown`
                : grammar.profiled
                  ? 'summary only'
                  : 'not profiled'
            }
          >
            {features.length > 0 ? (
              <div>
                <div className="mb-4 rounded-xl border border-border bg-muted/25 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
                  <p className="text-foreground">
                    {[
                      grammar.grambank_feature_count > 0 &&
                        `${grammar.grambank_feature_count} Grambank`,
                      grammar.wals_feature_count > 0 && `${grammar.wals_feature_count} WALS`,
                    ]
                      .filter(Boolean)
                      .join(' + ')}
                    {fsum && (
                      <>
                        {' '}— {fsum.total} coded features in total across{' '}
                        {Object.entries(fsum.by_source)
                          .map(([s, n]) => `${n} ${s}`)
                          .join(', ')}
                        .
                      </>
                    )}
                  </p>
                  <p className="mt-1.5">
                    Grambank&rsquo;s 195 variables are a <em>cross-linguistic baseline</em> — a fixed
                    questionnaire asked of every language — not &ldquo;the grammar&rdquo; of{' '}
                    <span lang="mis">{d.canonical_name}</span>. Read each cell as an answer to a
                    standard typological question.{' '}
                    <Link href="/atlas/grammar" className="font-medium text-primary hover:underline">
                      Compare languages in the grammar lens →
                    </Link>
                  </p>
                </div>
                <FeatureTable features={features} />
              </div>
            ) : grammar.profiled ? (
              <HonestPanel>
                Grammatically profiled in the registry (
                {[
                  grammar.has_grambank && 'Grambank',
                  grammar.has_wals && 'WALS',
                ]
                  .filter(Boolean)
                  .join(' + ') || 'typology'}
                ), but the per-feature coded values are not in our browsable typology plane yet, so no
                cell-by-cell table is shown. Coverage:{' '}
                {grammar.feature_count ?? 0} features reported.
              </HonestPanel>
            ) : (
              <HonestPanel>
                <span className="font-medium text-foreground">Not yet grammatically profiled.</span>{' '}
                No Grambank, WALS or Australianist-extension features are coded for this languoid.
                Grammatical description exists for only ~203 of ~980 Australian languoids; this is one
                of the many still awaiting a typological profile.
              </HonestPanel>
            )}
          </Section>

          {/* ------------------------------------------------------- LEXICON */}
          <Section
            id="lexicon"
            icon={<BookOpen size={15} className="text-primary" />}
            title="Dictionary & lexicon"
          >
            {lex.state === 'live' ? (
              <div className="rounded-xl border border-eucalyptus-500/30 bg-eucalyptus-500/10 px-4 py-4">
                <p className="text-[14px] text-foreground">
                  <span className="font-semibold">Live dictionary.</span>{' '}
                  {typeof lex.word_count === 'number' && lex.word_count > 0
                    ? `${lex.word_count.toLocaleString()} entries are browsable now.`
                    : 'A curated dictionary is available.'}
                </p>
                {lex.db_code && (
                  <Link
                    href={`/dictionaries/${lex.db_code}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary hover:underline"
                  >
                    Browse the dictionary
                    <ChevronRight size={15} />
                  </Link>
                )}
              </div>
            ) : lex.state === 'open_resource' ? (
              <div className="rounded-xl border border-border bg-card px-4 py-4">
                <p className="text-[14px] text-foreground">
                  <span className="font-semibold">Open lexical resource available</span>
                  {typeof lex.word_count === 'number' && lex.word_count > 0
                    ? ` — ${lex.word_count.toLocaleString()} entries, open licence, not yet ingested here.`
                    : ' — open licence, not yet ingested here.'}
                </p>
                {lex.resource?.url && (
                  <a
                    href={lex.resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary hover:underline"
                  >
                    {lex.resource.title ?? 'Open the resource'}
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ) : lex.state === 'pointer_only' ? (
              <HonestPanel>
                <span className="font-medium text-foreground">Catalogue pointer only.</span> A
                lexical resource is recorded but is rights-managed or not openly downloadable, so it is
                not browsable here.
                {lex.pointer?.url && (
                  <>
                    {' '}
                    <a
                      href={lex.pointer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {lex.pointer.title ?? 'View the catalogue entry'} <ExternalLink size={12} className="inline" />
                    </a>
                  </>
                )}
                {Array.isArray(lex.historical_sources) && lex.historical_sources.length > 0 && (
                  <span className="mt-2 block text-[12.5px]">
                    Historical wordlist(s):{' '}
                    {lex.historical_sources
                      .map((h: any) => `${h.source}${h.word_count ? ` (${h.word_count} words)` : ''}`)
                      .join('; ')}{' '}
                    — 19th-c. colonial OCR, not a modern community lexicon.
                  </span>
                )}
              </HonestPanel>
            ) : (
              <HonestPanel>
                <span className="font-medium text-foreground">No digital lexical data located yet.</span>{' '}
                No dictionary, wordlist or open resource has been found for this languoid. A visible
                gap — not a broken page.
              </HonestPanel>
            )}
          </Section>

          {/* ----------------------------------------------------- DEEP TIME */}
          <Section
            id="deep-time"
            icon={<Clock size={15} className="text-primary" />}
            title="Deep-time position"
            meta={dt.dated ? 'Bouckaert 2018 tree' : 'not dated'}
          >
            {dt.dated ? (
              <div className="rounded-xl border border-border bg-card px-4 py-4">
                <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                  {dt.divergence_age_bp != null && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Divergence from nearest relative
                      </div>
                      <div className="text-2xl font-semibold text-foreground">
                        ~{Math.round(dt.divergence_age_bp).toLocaleString()}{' '}
                        <span className="text-base font-normal text-muted-foreground">yr BP</span>
                      </div>
                      {Array.isArray(dt.divergence_hpd_bp) && (
                        <div className="text-[12px] text-muted-foreground">
                          95% HPD {Math.round(dt.divergence_hpd_bp[0]).toLocaleString()}–
                          {Math.round(dt.divergence_hpd_bp[1]).toLocaleString()} BP
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-3 border-t border-border/60 pt-3 text-[13px] leading-relaxed text-muted-foreground">
                  {dt.note ??
                    'Dates the LANGUAGE lineage (Bouckaert 2018 BEAST tree), NOT a population arrival.'}
                </p>
                <Link
                  href="/atlas/spread"
                  className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary hover:underline"
                >
                  Trace this lineage in the deep-time spread
                  <ChevronRight size={15} />
                </Link>
              </div>
            ) : (
              <HonestPanel>
                <span className="font-medium text-foreground">Not in the dated phylogeny.</span> Only
                the ~224 Pama-Nyungan leaves in Bouckaert, Bowern &amp; Atkinson (2018) carry a
                calibrated age. Many languages — especially the older non-Pama-Nyungan families of the
                north — are genuine context but have no time-calibrated node, and are never shown as
                dated.
              </HonestPanel>
            )}
          </Section>

          {/* ------------------------------------------------------- RELATED */}
          {(simRelated.length > 0 || sibRelated.length > 0) && (
            <Section
              id="related"
              icon={<LanguagesIcon size={15} className="text-primary" />}
              title="Related languages"
            >
              {simRelated.length > 0 && (
                <div className="mb-5">
                  <h3 className="mb-2 text-[13px] font-medium text-foreground">
                    By recorded grammatical agreement
                  </h3>
                  <p className="mb-3 text-[12.5px] text-muted-foreground">
                    Nearest neighbours by Grambank recorded-agreement. Each score is agreement over the{' '}
                    <em>jointly-coded</em> features only (n), never an overall-similarity claim.
                  </p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {simRelated.map((r) => (
                      <li key={r.slug}>
                        <Link
                          href={`/atlas/${r.slug}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground" lang="mis">
                              {r.name}
                            </span>
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              {r.family === 'unclassified' ? 'Unclassified' : r.family}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[13px] font-semibold tabular-nums text-primary">
                              {Math.round((r.score ?? 0) * 100)}%
                            </span>
                            <span className="block text-[10.5px] text-muted-foreground">
                              n={r.n_joint}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {sibRelated.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[13px] font-medium text-foreground">
                    Classification siblings
                    {sibRelated[0]?.subgroup && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        · same subgroup ({sibRelated[0].subgroup})
                      </span>
                    )}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {sibRelated.map((r) => (
                      <Link
                        key={r.slug}
                        href={`/atlas/${r.slug}`}
                        className="rounded-full border border-border bg-card px-3 py-1 text-[13px] text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        lang="mis"
                      >
                        {r.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* --------------------------------------------------- CODES + SRC */}
          <Section id="sources" title="Codes & sources">
            <div className="mb-5">
              <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                Identifiers
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {d.ids?.glottocode ? (
                  <a
                    href={glottologUrl(d.ids.glottocode)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 font-mono text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    Glottolog {d.ids.glottocode}
                    <ExternalLink size={10} />
                  </a>
                ) : null}
                {d.ids?.iso639_3 && (
                  <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 font-mono text-[12px] text-muted-foreground">
                    ISO 639-3 {d.ids.iso639_3}
                  </span>
                )}
                {(d.ids?.austlang ?? []).map((a: string) => (
                  <a
                    key={a}
                    href={austlangUrl(a)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 font-mono text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    AUSTLANG {a}
                    <ExternalLink size={10} />
                  </a>
                ))}
                {!d.ids?.glottocode &&
                  !d.ids?.iso639_3 &&
                  (d.ids?.austlang ?? []).length === 0 && (
                    <span className="text-[13px] text-muted-foreground">
                      No standard codes assigned.
                    </span>
                  )}
              </div>
            </div>

            <h3 className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Per-facet provenance
            </h3>
            <dl>
              <SourceLine label="Classification" value={d.sources?.classification} />
              <SourceLine label="Coordinates" value={d.sources?.coordinates} />
              <SourceLine label="Endangerment" value={d.sources?.endangerment} />
              <SourceLine label="Grammar" value={d.sources?.grammar} />
              <SourceLine label="Lexicon" value={d.sources?.lexicon} />
              <SourceLine label="Deep-time" value={d.sources?.deep_time} />
              <SourceLine label="Identifiers" value={d.sources?.ids} />
            </dl>

            <p className="mt-4 rounded-lg border border-border bg-muted/25 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
              Data-completeness for this profile:{' '}
              {Object.entries(d.data_completeness ?? {})
                .filter(([, v]) => v)
                .map(([k]) => k.replace(/_/g, ' '))
                .join(', ') || 'name only'}
              . Autonyms are unverified candidates drawn from alt-name lists; coordinates carry a
              provenance flag; a spreading language lineage is not a moving population. Coverage tier:{' '}
              <span className="font-medium text-foreground">{TIER_LABEL[d.tier] ?? d.tier}</span>.
            </p>
          </Section>
        </div>
      </div>
    </SharedLayout>
  );
}
