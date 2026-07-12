import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import {
  Map as MapIcon,
  List,
  Waves,
  Grid3x3,
  FileText,
  ArrowRight,
} from 'lucide-react';
import SharedLayout from '../components/SharedLayout';
import AtlasHub from './AtlasHub';
import type { PointCollection } from './AtlasMap';
import {
  buildFamilyColors,
  colorForFamily,
  type AtlasSearchItem,
  type FamilyLegendItem,
} from './atlasConfig';

export const metadata: Metadata = {
  title: 'The Atlas of Australian Languages',
  description:
    'A custodial, historian-grade atlas of every Australian Aboriginal & Torres Strait Islander ' +
    'languoid — 980 languages mapped by family, searchable by name, autonym, region and code, with ' +
    'honest coverage and uncertainty. Built on open (CC-BY) data: Glottolog, AUSTLANG, Grambank, WALS.',
  alternates: { canonical: '/atlas' },
};

export const dynamic = 'force-static';

// ---- build-time data assembly (read-only static artifacts; no request DB) ----

interface RawLang {
  slug: string;
  name: string;
  family: string;
  macroarea: string | null;
  level: string | null;
  lat: number | null;
  lon: number | null;
  coord_provenance: string;
  coord_approximate: boolean;
  tier: string;
  glottocode: string | null;
  iso639_3: string | null;
  austlang: string[];
  endangerment: string;
  has_grammar: boolean;
  lexicon_state: string;
  dated: boolean;
}

function loadData() {
  const dir = path.join(process.cwd(), 'data', 'atlas');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
    languages: RawLang[];
  };
  const coverage = JSON.parse(
    fs.readFileSync(path.join(dir, 'coverage-report.json'), 'utf8'),
  );
  return { languages: index.languages, coverage };
}

export default function AtlasPage() {
  const { languages, coverage } = loadData();

  const located = languages.filter((l) => l.lat != null && l.lon != null);

  // family colouring is driven by the LOCATED set (that is what the map shows)
  const famCounts: Record<string, number> = {};
  for (const l of located) famCounts[l.family] = (famCounts[l.family] ?? 0) + 1;
  const { colorOf, legend } = buildFamilyColors(famCounts);

  const points: PointCollection = {
    type: 'FeatureCollection',
    features: located.map((l) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [l.lon as number, l.lat as number] },
      properties: {
        slug: l.slug,
        name: l.name,
        family: l.family,
        tier: l.tier,
        approx: l.coord_approximate === true,
        provenance: l.coord_provenance,
        __c: colorForFamily(l.family, colorOf),
        __sel: false,
      },
    })),
  };

  const search: AtlasSearchItem[] = languages.map((l) => ({
    slug: l.slug,
    name: l.name,
    family: l.family,
    macroarea: l.macroarea,
    tier: l.tier,
    glottocode: l.glottocode,
    iso639_3: l.iso639_3,
    austlang: l.austlang ?? [],
    located: l.lat != null && l.lon != null,
    approx: l.coord_approximate === true,
    has_grammar: l.has_grammar,
    lexicon_state: l.lexicon_state,
    dated: l.dated,
    endangerment: l.endangerment,
  }));

  const legendForClient: FamilyLegendItem[] = legend;
  const unlocated = languages.length - located.length;

  // honest coverage figures, straight from the P0 coverage report
  const cov = coverage.coverage_summary ?? coverage;
  const total = cov.genuine_languoids ?? languages.length;
  const nLocated = cov.coordinates?.any ?? located.length;
  const lexLive = cov.lexicon?.live ?? 0;
  const lexOpen = cov.lexicon?.open_resource ?? 0;
  const grammar = cov.grammar_profiled ?? 0;
  const dated = cov.deep_time_dated ?? 0;
  const classified = cov.classification?.with_family_chain ?? 0;

  const stats: { value: string; label: string; sub?: string }[] = [
    { value: total.toLocaleString(), label: 'languages profiled', sub: 'every genuine languoid' },
    { value: nLocated.toLocaleString(), label: 'mapped', sub: `${unlocated} location unknown` },
    { value: (lexLive + lexOpen).toLocaleString(), label: 'with lexical data', sub: `${lexLive} live dictionaries` },
    { value: grammar.toLocaleString(), label: 'grammatically profiled', sub: 'Grambank / WALS' },
    { value: dated.toLocaleString(), label: 'with a dated position', sub: 'deep-time tree' },
    { value: classified.toLocaleString(), label: 'with full classification', sub: 'family chain' },
  ];

  const views = [
    {
      href: '/atlas/directory',
      icon: List,
      title: 'Directory',
      desc: 'Filter and sort every language — including the unlocated and lexically-empty. No language left off.',
      status: 'Coming soon',
    },
    {
      href: '/atlas/spread',
      icon: Waves,
      title: 'Deep-time spread',
      desc: 'The animated Pama-Nyungan expansion, and every scholarly thesis of why the languages moved — held side by side.',
      status: 'Live',
    },
    {
      href: '/atlas/grammar',
      icon: Grid3x3,
      title: 'Grammar & similarity',
      desc: 'Colour the map by any Grambank or WALS feature; compare grammatical profiles between languages.',
      status: 'Coming soon',
    },
    {
      href: '/atlas/methods',
      icon: FileText,
      title: 'Methods & sources',
      desc: 'How the atlas is joined, every upstream dataset and licence, and the uncertainty policy.',
      status: 'Coming soon',
    },
  ];

  return (
    <SharedLayout>
      <div className="mx-auto max-w-[1400px]">
        {/* Hero heading */}
        <header className="mb-6 flex items-start gap-3">
          <span
            className="mt-1 hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex"
            aria-hidden="true"
          >
            <MapIcon size={22} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              The Atlas of Australian Languages
            </p>
            <h1 className="marketing mt-1 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              Every language, on one map — held honestly.
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              A living, citable atlas of{' '}
              <span className="font-medium text-foreground">{total.toLocaleString()}</span> Aboriginal
              and Torres Strait Islander languages and dialects — their Country, family and deep-time
              position, drawn from open scholarly data. Where something isn&rsquo;t known, we say so
              rather than fill the gap.{' '}
              <Link href="/atlas/methods" className="font-medium text-primary underline underline-offset-2">
                How this is sourced
              </Link>
              .
            </p>
          </div>
        </header>

        {/* Search + map + legend + selection (client island) */}
        <AtlasHub
          points={points}
          search={search}
          legend={legendForClient}
          colorOf={colorOf}
          unlocatedCount={unlocated}
        />

        {/* Coverage strip — honest fractions, not a SaaS stat-counter */}
        <section className="mt-8" aria-labelledby="coverage-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="coverage-heading" className="text-sm font-semibold uppercase tracking-wider text-foreground">
              What is known, and how much
            </h2>
            <Link
              href="/atlas/methods"
              className="text-xs font-medium text-primary hover:underline"
            >
              Coverage &amp; sources →
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
            {stats.map((s) => (
              <div key={s.label} className="bg-card p-4">
                <div className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                  {s.value}
                </div>
                <div className="mt-0.5 text-[13px] font-medium leading-tight text-foreground/90">
                  {s.label}
                </div>
                {s.sub && (
                  <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{s.sub}</div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
            Counts are shown as they are, out of {total.toLocaleString()} — never rounded up to imply
            completeness. A blank is always an explicit &ldquo;unknown&rdquo;, never a fabricated value.
          </p>
        </section>

        {/* Entry tiles to the other views */}
        <section className="mt-8" aria-labelledby="views-heading">
          <h2 id="views-heading" className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Explore the atlas
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {views.map((v) => {
              const Icon = v.icon;
              const isLive = v.status === 'Live';
              return (
                <Link
                  key={v.href}
                  href={v.href}
                  className="group relative flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:-translate-y-0.5"
                >
                  <span className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon size={19} />
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        isLive
                          ? 'bg-secondary/15 text-secondary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {v.status}
                    </span>
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-foreground">{v.title}</h3>
                  <p className="mt-1 flex-1 text-[13px] leading-snug text-muted-foreground">{v.desc}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary">
                    {isLive ? 'Open' : 'Preview'}
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Custodial footer note */}
        <section className="mt-8 rounded-2xl border border-border bg-muted/30 p-5">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">A note of respect.</span>{' '}
            These languages belong to the First Peoples of this continent, who have spoken them on
            Country for tens of thousands of years and speak many of them today. This atlas gathers
            open scholarly records to help find, cite and care for that knowledge; it is not a
            substitute for community authority. Names, autonyms and locations drawn from catalogues
            are shown with their uncertainty, and communities are the final word on their own
            languages. We pay our respects to Elders past and present.
          </p>
        </section>
      </div>
    </SharedLayout>
  );
}
