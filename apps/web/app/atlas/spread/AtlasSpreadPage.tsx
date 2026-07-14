'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Info } from 'lucide-react';
import SpreadClient from '../../spread/SpreadClient';
import thesesData from '../../../data/theses.json';
import WhyItMovedMatrix from './WhyItMovedMatrix';
import { resolveThesisLens, THESIS_MAP, LENS_HINT } from './thesisMap';

interface CardLite {
  id: string;
  title: string;
}
const cards = (thesesData as unknown as { cards: CardLite[]; synthesis: { reading_order: string[] } });

// Short, calm chip labels for the lens bar.
const CHIP_LABEL: Record<string, string> = {
  'bayesian-gulf-expansion': 'Gulf expansion (Bouckaert)',
  'archaeogenetics-people-stayed': 'Genetics: people stayed',
  'demic-vs-shift-punctuated': 'Demic vs language shift',
  'spread-without-farming': 'Spread without farming',
  'small-tool-backed-artefact-dingo': 'Small-tool / dingo package',
  'enso-climate-driver': 'ENSO climate trigger',
  'mcconvell-kinship-loanword-wave': 'Kinship / loanword waves',
  'analogy-morphological-change': 'Analogy (how forms changed)',
  'dixon-family-tree-rejection': 'Dixon’s dissent',
};

export default function AtlasSpreadPage() {
  const [activeThesisId, setActiveThesisId] = useState<string>('bayesian-gulf-expansion');
  const heroRef = useRef<HTMLDivElement | null>(null);

  const lens = useMemo(() => resolveThesisLens(activeThesisId), [activeThesisId]);

  // chips in the synthesis reading order (falls back to card order)
  const chipOrder = useMemo(() => {
    const ids = new Set(cards.cards.map((c) => c.id));
    const order = cards.synthesis.reading_order
      .map((s) => s.split(/\s+—\s+/)[0].trim())
      .filter((id) => ids.has(id));
    for (const c of cards.cards) if (!order.includes(c.id)) order.push(c.id);
    return order;
  }, []);

  const select = useCallback((id: string) => {
    setActiveThesisId(id);
    const el = heroRef.current;
    if (el) {
      const reduce =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }, []);

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* breadcrumb + heading */}
      <div className="mb-4">
        <Link
          href="/atlas"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          The Atlas of Australian Languages
        </Link>
      </div>
      <header className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Deep-time spread &amp; why it moved
        </p>
        <h1 className="marketing mt-1 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
          How the languages spread — and every thesis of why.
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          An animated model of the Pama-Nyungan expansion across a continent that was{' '}
          <span className="font-medium text-foreground">already populated for ~65,000 years</span>,
          fused with a contradiction-preserving matrix of the scholarly theses of{' '}
          <em>why</em> the languages moved — held side by side, with the evidence for and against
          each, and never collapsed to one winner.{' '}
          <Link href="/atlas/methods" className="font-medium text-primary underline underline-offset-2">
            The full dataset &amp; licences
          </Link>
          .
        </p>
      </header>

      {/* ---- animated hero (reused engine, reframed by the active thesis) ---- */}
      <div ref={heroRef} className="scroll-mt-20">
        <SpreadClient thesis={lens} />
      </div>

      {/* ---- lens bar: pick a thesis, reframe the map honestly ---- */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <Info size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <p className="text-[12.5px] leading-snug text-muted-foreground">{LENS_HINT}</p>
        </div>
        <div
          className="mt-3 flex flex-wrap gap-1.5"
          role="group"
          aria-label="Reframe the map by thesis"
        >
          {chipOrder.map((id) => {
            const active = activeThesisId === id;
            const isFreeze = THESIS_MAP[id]?.mode === 'freeze';
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveThesisId(id)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/40 text-foreground hover:border-primary/40 hover:text-primary'
                }`}
              >
                {CHIP_LABEL[id] ?? id}
                {isFreeze && (
                  <span
                    className={`ml-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                      active ? 'text-primary-foreground/80' : 'text-primary'
                    }`}
                  >
                    · freezes
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* scroll cue into the matrix */}
      <div className="mt-6 flex justify-center">
        <a
          href="#why-heading"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          Why did the languages move? — read the theses
          <ChevronDown size={15} aria-hidden />
        </a>
      </div>

      {/* ---- the matrix ---- */}
      <div className="mt-8">
        <WhyItMovedMatrix activeThesisId={activeThesisId} onSelect={select} />
      </div>

      {/* custodial footer */}
      <section className="mt-10 rounded-2xl border border-border bg-muted/30 p-5">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">A standing caveat.</span> These models
          date the movement of a <em>language lineage</em> reconstructed from vocabulary — not the
          arrival of people. Aboriginal and Torres Strait Islander presence on this continent is on
          the order of 50,000–65,000 years; the Pama-Nyungan expansion is a far more recent
          mid-Holocene event that moved through communities already long resident. Non-Pama-Nyungan
          northern families are shown as static, undated context and are never animated as dated
          migration. Deep-time origins are probabilistic and contested; we show the uncertainty
          rather than hide it.{' '}
          <Link href="/atlas/methods" className="font-medium text-primary underline underline-offset-2">
            Methods &amp; sources
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
