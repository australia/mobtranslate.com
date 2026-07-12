'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, MapPinOff, ArrowRight, X, ExternalLink } from 'lucide-react';
import AtlasMap, { type PointCollection } from './AtlasMap';
import CommandPalette from './CommandPalette';
import {
  type AtlasSearchItem,
  type FamilyLegendItem,
  TIER_LABEL,
  COORD_PROVENANCE_LABEL,
  glottologUrl,
  austlangUrl,
} from './atlasConfig';

interface AtlasHubProps {
  points: PointCollection;
  search: AtlasSearchItem[];
  legend: FamilyLegendItem[];
  colorOf: Record<string, string>;
  unlocatedCount: number;
}

const LEX_LABEL: Record<string, string> = {
  live: 'Live dictionary',
  open_resource: 'Open resource',
  pointer_only: 'Catalogue pointer only',
  none: 'No digital lexical data yet',
};

function familyLabel(f: string) {
  return f === 'unclassified' ? 'Unclassified' : f;
}

export default function AtlasHub({
  points,
  search,
  legend,
  colorOf,
  unlocatedCount,
}: AtlasHubProps) {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const byslug = useMemo(() => {
    const m = new Map<string, AtlasSearchItem>();
    for (const it of search) m.set(it.slug, it);
    return m;
  }, [search]);

  const selected = selectedSlug ? byslug.get(selectedSlug) ?? null : null;

  const openProfile = useCallback(
    (slug: string) => {
      router.push(`/atlas/${slug}`);
    },
    [router],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Search — the command palette sits above the map, full width */}
      <div className="relative z-40">
        <CommandPalette
          items={search}
          colorOf={colorOf}
          onOpen={openProfile}
          onActive={(slug) => {
            if (slug) setSelectedSlug(slug);
          }}
        />
      </div>

      {/* Map + rail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_18rem]">
        {/* Map card */}
        <div className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-2xl border border-border bg-muted/40 shadow-sm">
          <AtlasMap
            points={points}
            selectedSlug={selectedSlug}
            onSelect={setSelectedSlug}
          />

          {/* selected-language panel (floats over the map, bottom-left) */}
          {selected && (
            <div className="absolute bottom-3 left-3 z-20 w-[min(20rem,calc(100%-1.5rem))] animate-scale-in rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setSelectedSlug(null)}
                className="absolute right-2.5 top-2.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close language panel"
              >
                <X size={15} />
              </button>
              <div className="flex items-start gap-2.5">
                <span
                  className="mt-1.5 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: colorOf[selected.family] ?? '#7a7268' }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <h3 className="pr-5 text-lg font-semibold leading-tight text-foreground" lang="mis">
                    {selected.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{familyLabel(selected.family)}</p>
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Tier</dt>
                  <dd className="text-foreground">{TIER_LABEL[selected.tier] ?? selected.tier}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Location</dt>
                  <dd className="flex items-center gap-1 text-foreground">
                    {selected.located ? (
                      <>
                        <MapPin size={12} className="text-primary" />
                        {selected.approx ? 'Approximate' : 'Mapped'}
                      </>
                    ) : (
                      <>
                        <MapPinOff size={12} className="text-amber-600 dark:text-amber-400" />
                        Unknown
                      </>
                    )}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Lexical data</dt>
                  <dd className="text-foreground">{LEX_LABEL[selected.lexicon_state] ?? selected.lexicon_state}</dd>
                </div>
              </dl>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {selected.glottocode && (
                  <a
                    href={glottologUrl(selected.glottocode)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:text-foreground"
                  >
                    {selected.glottocode}
                    <ExternalLink size={10} />
                  </a>
                )}
                {selected.iso639_3 && (
                  <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                    {selected.iso639_3}
                  </span>
                )}
                {selected.austlang[0] && (
                  <a
                    href={austlangUrl(selected.austlang[0])}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:text-foreground"
                  >
                    {selected.austlang[0]}
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>

              <Link
                href={`/atlas/${selected.slug}`}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Open full profile
                <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </div>

        {/* Legend rail */}
        <aside className="flex flex-col gap-3" aria-label="Map legend">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Language families</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Pama-Nyungan covers most of the continent; the ~27 non-Pama-Nyungan
              families cluster in the north.
            </p>
            <ul className="mt-3 space-y-1.5">
              {legend.map((row) => (
                <li key={row.family} className="flex items-center gap-2 text-[13px]">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: row.color }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-foreground">{row.label}</span>
                  <span className="tabular-nums text-[11px] text-muted-foreground">{row.count}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[12px] text-muted-foreground">
              <span
                className="h-3 w-3 shrink-0 rounded-full border-[1.5px] border-muted-foreground/70 bg-transparent"
                aria-hidden="true"
              />
              <span>
                <span className="font-medium text-foreground">Hollow ring</span> = location
                approximate or derived
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <div className="flex items-start gap-2">
              <MapPinOff size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-[12px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">{unlocatedCount} languages</span> have
                no reliable coordinates and are not plotted — we never invent a point. They stay fully
                searchable and appear in the{' '}
                <Link href="/atlas/directory" className="font-medium text-primary underline">
                  directory
                </Link>
                .
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
