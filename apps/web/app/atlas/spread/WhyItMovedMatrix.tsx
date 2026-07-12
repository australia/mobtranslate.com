'use client';

import { useMemo } from 'react';
import {
  ArrowUp,
  Check,
  X,
  Scale,
  BookOpen,
  Users,
  Quote,
  Link2,
  MapPin,
} from 'lucide-react';
import thesesData from '../../../data/atlas/theses.json';
import { THESIS_MAP } from './thesisMap';

/* ---------------------------------------------------------------- types (loose) */
interface Citation {
  ref: string;
  doi?: string;
  year?: number;
  open_access?: boolean;
}
interface HardFact {
  fact: string;
  source: string;
}
interface Consensus {
  level: string;
  note: string;
}
interface ThesisCardData {
  id: string;
  title: string;
  one_line: string;
  mechanism: string;
  proponents: string[];
  hard_facts: HardFact[];
  evidence_for: string[];
  evidence_against: string[];
  consensus: Consensus;
  contestation: string;
  citations: Citation[];
  map_expression: string;
}
interface Synthesis {
  intro: string;
  how_they_relate: { pair: [string, string]; relation: string }[];
  conflicts: string[];
  shared_hard_facts: HardFact[];
  reading_order: string[];
  caveats: string[];
}

const data = thesesData as unknown as {
  cards: ThesisCardData[];
  synthesis: Synthesis;
};

/* ---------------------------------------------------------------- consensus meter */
// A calm, honest indicator of how much weight the field puts on a claim —
// deliberately NOT a hype gauge. 5 segments, a plain label, and a one-line note.
const CONSENSUS: Record<
  string,
  { label: string; filled: number; color: string; blurb: string }
> = {
  mainstream: {
    label: 'Mainstream',
    filled: 4,
    color: '#3c7b5a',
    blurb: 'Broadly accepted by the field',
  },
  contested: {
    label: 'Contested',
    filled: 3,
    color: '#c69223',
    blurb: 'Real, actively disputed',
  },
  minority: {
    label: 'Minority — serious dissent',
    filled: 2,
    color: '#b06a86',
    blurb: 'A respected position the field mostly does not follow',
  },
  open: {
    label: 'Open question',
    filled: 2,
    color: '#6b7683',
    blurb: 'Genuinely unresolved',
  },
  fringe: {
    label: 'Fringe',
    filled: 1,
    color: '#6b7683',
    blurb: 'Outside the scholarly mainstream',
  },
};

function ConsensusMeter({ consensus }: { consensus: Consensus }) {
  const meta = CONSENSUS[consensus.level] ?? CONSENSUS.open;
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Where the field stands
        </span>
        <span className="text-[12px] font-semibold text-foreground">{meta.label}</span>
      </div>
      <div
        className="mt-2 flex gap-1"
        role="img"
        aria-label={`Consensus: ${meta.label} — ${meta.blurb}`}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < meta.filled ? '' : 'bg-border'}`}
            style={i < meta.filled ? { backgroundColor: meta.color } : undefined}
          />
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{consensus.note}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */
const DOI_RE = /(10\.\d{4,9}\/[^\s;,)"']+)/;
function doiOf(text: string): string | null {
  const m = text.match(DOI_RE);
  return m ? m[1].replace(/[.,]$/, '') : null;
}

/** Short chip label: drop trailing parentheticals / author suffixes. */
function shortTitle(t: string): string {
  return t
    .replace(/\s*\((?:the dissent|Bouckaert[^)]*)\)\s*$/i, '')
    .replace(/\s+—.*$/, '')
    .trim();
}

/* ---------------------------------------------------------------- fact chip */
function FactList({ facts }: { facts: HardFact[] }) {
  return (
    <ul className="space-y-2">
      {facts.map((f, i) => {
        const doi = doiOf(f.source);
        return (
          <li
            key={i}
            className="rounded-lg border border-border bg-card/60 p-3 text-[13px] leading-relaxed"
          >
            <span className="text-foreground">{f.fact}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
              <span className="opacity-90">{f.source}</span>
              {doi && (
                <a
                  href={`https://doi.org/${doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                >
                  <Link2 size={11} aria-hidden />
                  doi:{doi}
                </a>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------- one thesis card */
function ThesisCard({
  card,
  n,
  active,
  onSelect,
}: {
  card: ThesisCardData;
  n: number;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const lens = THESIS_MAP[card.id];
  const mapNote = lens?.banner ?? lens?.overlayNote ?? lens?.chip ?? '';
  const isFreeze = lens?.mode === 'freeze';

  return (
    <article
      id={`thesis-${card.id}`}
      aria-current={active ? 'true' : undefined}
      className={`scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm transition-colors sm:p-6 ${
        active ? 'border-primary ring-1 ring-primary/40' : 'border-border'
      }`}
    >
      {/* header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 lg:max-w-[62%]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Thesis {n} of {data.cards.length}
          </p>
          <h3 className="marketing mt-1 text-xl font-bold leading-tight text-foreground">
            {card.title}
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            {card.one_line}
          </p>
        </div>
        <div className="lg:w-[34%] lg:shrink-0">
          <ConsensusMeter consensus={card.consensus} />
        </div>
      </div>

      {/* mechanism */}
      <div className="mt-5">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          The mechanism
        </h4>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/90">
          {card.mechanism}
        </p>
      </div>

      {/* hard facts — prominent, each with its source/DOI */}
      <div className="mt-5">
        <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
          <BookOpen size={13} className="text-primary" aria-hidden />
          Hard facts
        </h4>
        <div className="mt-2">
          <FactList facts={card.hard_facts} />
        </div>
      </div>

      {/* evidence FOR / AGAINST — side by side, against never omitted */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-secondary/30 bg-secondary/5 p-4">
          <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
            <Check size={14} className="text-secondary" aria-hidden />
            Evidence for
          </h4>
          <ul className="mt-2.5 space-y-2">
            {card.evidence_for.map((e, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-foreground/90">
                <Check
                  size={13}
                  className="mt-1 shrink-0 text-secondary"
                  aria-hidden
                />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
            <X size={14} className="text-primary" aria-hidden />
            Evidence against
          </h4>
          <ul className="mt-2.5 space-y-2">
            {card.evidence_against.map((e, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-foreground/90">
                <X size={13} className="mt-1 shrink-0 text-primary" aria-hidden />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* contestation */}
      <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
        <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <Scale size={14} className="text-muted-foreground" aria-hidden />
          What&rsquo;s disputed — and by whom
        </h4>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {card.contestation}
        </p>
      </div>

      {/* proponents */}
      <div className="mt-5">
        <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Users size={13} aria-hidden />
          Proponents
        </h4>
        <ul className="mt-2 space-y-1.5">
          {card.proponents.map((p, i) => (
            <li key={i} className="text-[12.5px] leading-snug text-foreground/85">
              {p}
            </li>
          ))}
        </ul>
      </div>

      {/* citations + map behaviour (reference detail, tucked) */}
      <details className="group mt-4 rounded-xl border border-border bg-card/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-[12px] font-semibold text-foreground">
          <span className="flex items-center gap-1.5">
            <Quote size={13} className="text-primary" aria-hidden />
            Citations &amp; how this looks on the map
          </span>
          <span className="text-muted-foreground transition-transform group-open:rotate-90" aria-hidden>
            ›
          </span>
        </summary>
        <div className="border-t border-border px-4 py-3">
          <ul className="space-y-2">
            {card.citations.map((c, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-muted-foreground">
                {c.ref}
                <span className="ml-1 inline-flex flex-wrap items-center gap-1.5 align-middle">
                  {c.doi && (
                    <a
                      href={`https://doi.org/${c.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-primary hover:underline"
                    >
                      doi:{c.doi}
                    </a>
                  )}
                  {c.open_access ? (
                    <span className="rounded-full bg-secondary/15 px-1.5 py-0.5 text-[10px] font-semibold text-secondary">
                      open access
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      paywalled
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {mapNote && (
            <div className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">
              <MapPin size={13} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-semibold text-foreground">
                  On the deep-time map:{' '}
                </span>
                {isFreeze
                  ? 'selecting this lens DISABLES the dated animation (it does not add an arrow). '
                  : ''}
                {mapNote}
              </span>
            </div>
          )}
        </div>
      </details>

      {/* reframe-the-map action */}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-[12px] leading-snug text-muted-foreground">
          {active
            ? 'This lens is framing the map above.'
            : isFreeze
            ? 'See it on the map — this lens switches the animation off.'
            : 'See how this thesis reframes the deep-time map above.'}
        </p>
        <button
          type="button"
          onClick={() => onSelect(card.id)}
          aria-pressed={active}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
            active
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-card text-foreground hover:border-primary/40 hover:text-primary'
          }`}
        >
          <ArrowUp size={14} aria-hidden />
          {active ? 'Framing the map' : 'Reframe the map'}
        </button>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- the matrix */
export default function WhyItMovedMatrix({
  activeThesisId,
  onSelect,
}: {
  activeThesisId: string | null;
  onSelect: (id: string) => void;
}) {
  const { cards, synthesis } = data;

  // display order = the synthesis reading order, falling back to card order
  const ordered = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    const order = synthesis.reading_order
      .map((s) => s.split(/\s+—\s+/)[0].trim())
      .filter((id) => byId.has(id));
    const seen = new Set<string>();
    const out: ThesisCardData[] = [];
    for (const id of order) {
      if (!seen.has(id)) {
        out.push(byId.get(id)!);
        seen.add(id);
      }
    }
    for (const c of cards) if (!seen.has(c.id)) out.push(c);
    return out;
  }, [cards, synthesis.reading_order]);

  const titleById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of cards) m[c.id] = c.id === 'dixon-family-tree-rejection'
      ? 'Dixon’s dissent'
      : shortTitle(c.title);
    return m;
  }, [cards]);

  const introParas = synthesis.intro.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  return (
    <section aria-labelledby="why-heading" className="mx-auto max-w-4xl">
      {/* section header + synthesis intro */}
      <header className="mt-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          The scholarly heart
        </p>
        <h2
          id="why-heading"
          className="marketing mt-1 text-2xl font-bold leading-tight text-foreground sm:text-3xl"
        >
          Why did the languages move?
        </h2>
        <div className="mt-4 space-y-3">
          {introParas.map((p, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? 'text-[15px] leading-relaxed text-foreground'
                  : 'text-[14px] leading-relaxed text-muted-foreground'
              }
            >
              {p}
            </p>
          ))}
        </div>
      </header>

      {/* how to read this — the contradiction-preserving contract */}
      <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-5">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground">
          How to read this
        </h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          These eight theses are held side by side as <em>equal</em> cards — none is
          &ldquo;the answer.&rdquo; They work on different layers (a dated tree, a mechanism,
          a climate trigger, a material-culture package, a later social overlay, a genetic
          constraint, and a root-and-branch denial that any tree exists). Some can be true
          together; some genuinely cannot. Every card carries a mandatory{' '}
          <span className="font-medium text-foreground">evidence-against</span> column and a
          calm consensus meter — no false balance, no false certainty. Dixon&rsquo;s rejection
          of Pama-Nyungan as a genetic family is preserved as a{' '}
          <span className="font-medium text-foreground">first-class card</span>, not a footnote.{' '}
          <abbr title="Before Present (before 1950)">BP</abbr> = years before present;{' '}
          <abbr title="Highest Posterior Density — the Bayesian credible interval">95% HPD</abbr>{' '}
          is the credible range on an estimated age;{' '}
          <abbr title="the probability the model assigns to a given branch of the tree">
            posterior support
          </abbr>{' '}
          is how confident the model is in a branch.
        </p>
      </div>

      {/* the eight cards */}
      <div className="mt-6 space-y-6">
        {ordered.map((card, i) => (
          <ThesisCard
            key={card.id}
            card={card}
            n={i + 1}
            active={activeThesisId === card.id}
            onSelect={onSelect}
          />
        ))}
      </div>

      {/* ---------- synthesis: how they relate ---------- */}
      <div className="mt-10">
        <h3 className="marketing text-xl font-bold text-foreground">How the theses relate</h3>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Not eight rival answers to one question — complementary, competing, nested and
          independent claims, mapped honestly.
        </p>
        <ul className="mt-4 space-y-2.5">
          {synthesis.how_they_relate.map((r, i) => {
            const kind = r.relation.split(/[:(]/)[0].trim().toLowerCase();
            const competing = /compet/.test(kind);
            return (
              <li
                key={i}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[12px] font-medium text-foreground">
                    {titleById[r.pair[0]] ?? r.pair[0]}
                  </span>
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      competing ? 'text-primary' : 'text-secondary'
                    }`}
                  >
                    ↔
                  </span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[12px] font-medium text-foreground">
                    {titleById[r.pair[1]] ?? r.pair[1]}
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {r.relation}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ---------- sharpest conflicts ---------- */}
      <div className="mt-10">
        <h3 className="marketing text-xl font-bold text-foreground">The sharpest conflicts</h3>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Where two respected readings genuinely point in opposite directions.
        </p>
        <ol className="mt-4 space-y-3">
          {synthesis.conflicts.map((c, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[12px] font-bold text-primary">
                {i + 1}
              </span>
              <p className="text-[13px] leading-relaxed text-foreground/90">{c}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* ---------- shared common ground ---------- */}
      <div className="mt-10">
        <h3 className="marketing text-xl font-bold text-foreground">
          Common ground — what almost all sides accept
        </h3>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          The contradictions above sit on a bedrock of facts nearly every scholar shares.
        </p>
        <div className="mt-4">
          <FactList facts={synthesis.shared_hard_facts} />
        </div>
      </div>

      {/* ---------- honesty ledger (verification gaps + caveats) ---------- */}
      <details className="group mt-8 rounded-2xl border border-border bg-muted/30">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 text-[13px] font-semibold text-foreground">
          <span>Honesty ledger — standing caveats &amp; verification gaps</span>
          <span className="text-muted-foreground transition-transform group-open:rotate-90" aria-hidden>
            ›
          </span>
        </summary>
        <ul className="space-y-2.5 border-t border-border p-5 pt-4">
          {synthesis.caveats.map((c, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
