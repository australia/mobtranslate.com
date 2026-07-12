'use client';

import { useEffect, useRef, useState } from 'react';
import { Map as MapIcon, Columns3, Network } from 'lucide-react';
import FeatureExplorer from './FeatureExplorer';
import CompareLanguages from './CompareLanguages';
import Neighbours from './Neighbours';
import type { GrammarPointCollection } from './GrammarMap';
import type { GrammarCatalog } from './grammarTypes';
import type { StateChar } from './grammarColors';

type Tab = 'map' | 'compare' | 'neighbours';

interface GrammarLensProps {
  catalog: GrammarCatalog;
  points: GrammarPointCollection;
  matrixUrl: string;
}

const TABS: { id: Tab; label: string; icon: typeof MapIcon }[] = [
  { id: 'map', label: 'Colour the map', icon: MapIcon },
  { id: 'compare', label: 'Compare languages', icon: Columns3 },
  { id: 'neighbours', label: 'Closest by agreement', icon: Network },
];

export default function GrammarLens({ catalog, points, matrixUrl }: GrammarLensProps) {
  const [tab, setTab] = useState<Tab>('map');
  const [values, setValues] = useState<Record<string, Record<string, [string, StateChar]>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(matrixUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((m) => {
        if (!cancelled) {
          setValues(m.values ?? {});
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [matrixUrl]);

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = (i + dir + TABS.length) % TABS.length;
      setTab(TABS[next].id);
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <div>
      {/* tablist */}
      <div
        role="tablist"
        aria-label="Grammar lens views"
        className="mb-4 flex flex-wrap gap-1.5 rounded-xl border border-border bg-muted/40 p-1"
      >
        {TABS.map((t, i) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:flex-none ${
                active
                  ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-[13px] text-foreground/85">
          The grammar dataset couldn&rsquo;t be loaded, so the map colouring and comparison are
          unavailable right now. Every language&rsquo;s full grammar profile is still on its{' '}
          <a href="/atlas/directory" className="font-medium text-primary underline">
            profile page
          </a>
          .
        </div>
      )}

      <div role="tabpanel" id="panel-map" aria-labelledby="tab-map" hidden={tab !== 'map'}>
        {tab === 'map' && (
          <FeatureExplorer catalog={catalog} points={points} values={values} loading={loading} />
        )}
      </div>
      <div role="tabpanel" id="panel-compare" aria-labelledby="tab-compare" hidden={tab !== 'compare'}>
        {tab === 'compare' && (
          <CompareLanguages catalog={catalog} values={values} loading={loading} />
        )}
      </div>
      <div role="tabpanel" id="panel-neighbours" aria-labelledby="tab-neighbours" hidden={tab !== 'neighbours'}>
        {tab === 'neighbours' && <Neighbours catalog={catalog} />}
      </div>
    </div>
  );
}
