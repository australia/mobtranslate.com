import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { ArrowLeft, List } from 'lucide-react';
import SharedLayout from '../../components/SharedLayout';
import DirectoryTable, {
  type DirRow,
  type FacetMeta,
} from './DirectoryTable';
import { buildFamilyColors, colorForFamily } from '../atlasConfig';

export const metadata: Metadata = {
  title: 'Directory — Atlas of Australian Languages',
  description:
    'A searchable, filterable, sortable directory of every one of the 980 genuine Australian ' +
    'languoids — including the 171 without coordinates and the lexically-empty. No language left ' +
    'off the map. Filter by family, region, coverage, endangerment and tier; every row deep-links ' +
    'to its canonical profile.',
  alternates: { canonical: '/atlas/directory' },
};

export const dynamic = 'force-static';

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
  const index = JSON.parse(
    fs.readFileSync(path.join(dir, 'index.json'), 'utf8'),
  ) as { languages: RawLang[]; count?: number };
  return index;
}

// A row's "coverage score" — how much is KNOWN about it (honest richness, not a
// quality judgement). Used only for the optional "most complete first" sort.
function coverageScore(l: RawLang): number {
  let s = 0;
  if (l.lat != null && l.lon != null) s += 1;
  if (l.has_grammar) s += 1;
  if (l.lexicon_state === 'live') s += 2;
  else if (l.lexicon_state === 'open_resource') s += 1;
  if (l.dated) s += 1;
  if (l.glottocode) s += 1;
  if (l.endangerment && l.endangerment !== 'unknown') s += 1;
  return s;
}

export default function DirectoryPage() {
  const { languages } = loadData();

  // Family colours over the WHOLE set (directory shows unlocated families too),
  // so every row's dot resolves — including families that never appear on the map.
  const famCounts: Record<string, number> = {};
  for (const l of languages) famCounts[l.family] = (famCounts[l.family] ?? 0) + 1;
  const { colorOf } = buildFamilyColors(famCounts);

  const rows: DirRow[] = languages.map((l) => {
    const located = l.lat != null && l.lon != null;
    const haystack = [
      l.name,
      l.family,
      l.glottocode ?? '',
      l.iso639_3 ?? '',
      (l.austlang ?? []).join(' '),
      l.slug,
    ]
      .join(' ')
      .toLowerCase();
    return {
      slug: l.slug,
      name: l.name,
      family: l.family,
      macroarea: l.macroarea ?? 'Australia',
      level: l.level,
      tier: l.tier,
      glottocode: l.glottocode,
      iso639_3: l.iso639_3,
      austlang: l.austlang ?? [],
      located,
      approx: l.coord_approximate === true,
      has_grammar: l.has_grammar,
      lexicon_state: l.lexicon_state,
      dated: l.dated,
      endangerment: l.endangerment,
      color: colorForFamily(l.family, colorOf),
      score: coverageScore(l),
      _s: haystack,
    };
  });

  // ----- facet metadata for the filter controls (all honest counts) -----
  const familyCounts = Object.entries(famCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([family, count]) => ({ family, count }));

  const tierCounts: Record<string, number> = {};
  const macroCounts: Record<string, number> = {};
  const endangermentCounts: Record<string, number> = {};
  let nLocated = 0;
  let nGrammar = 0;
  let nLexical = 0;
  let nDated = 0;
  for (const r of rows) {
    tierCounts[r.tier] = (tierCounts[r.tier] ?? 0) + 1;
    macroCounts[r.macroarea] = (macroCounts[r.macroarea] ?? 0) + 1;
    endangermentCounts[r.endangerment] =
      (endangermentCounts[r.endangerment] ?? 0) + 1;
    if (r.located) nLocated += 1;
    if (r.has_grammar) nGrammar += 1;
    if (r.lexicon_state === 'live' || r.lexicon_state === 'open_resource')
      nLexical += 1;
    if (r.dated) nDated += 1;
  }

  const facets: FacetMeta = {
    total: rows.length,
    families: familyCounts,
    tiers: tierCounts,
    macroareas: macroCounts,
    endangerment: endangermentCounts,
    coverage: {
      located: nLocated,
      unlocated: rows.length - nLocated,
      grammar: nGrammar,
      lexical: nLexical,
      dated: nDated,
    },
  };

  return (
    <SharedLayout>
      <div className="mx-auto max-w-[1400px]">
        <Link
          href="/atlas"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Back to the atlas
        </Link>

        {/* Header */}
        <header className="mt-4 flex items-start gap-3">
          <span
            className="mt-1 hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex"
            aria-hidden="true"
          >
            <List size={22} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Directory
            </p>
            <h1 className="marketing mt-1 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              Every language, filterable and sortable
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              The complete table of all{' '}
              <span className="font-medium text-foreground">
                {facets.total.toLocaleString()}
              </span>{' '}
              genuine languoids — the located and the{' '}
              <span className="font-medium text-foreground">
                {facets.coverage.unlocated}
              </span>{' '}
              without coordinates, the richly documented and the barely attested — each a
              first-class row that deep-links to its profile. Nothing is hidden to look more
              complete than it is.
            </p>
          </div>
        </header>

        <div className="mt-6">
          <DirectoryTable rows={rows} facets={facets} />
        </div>
      </div>
    </SharedLayout>
  );
}
