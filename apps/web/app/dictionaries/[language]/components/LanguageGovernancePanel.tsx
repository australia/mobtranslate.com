import {
  BookMarked,
  ChevronDown,
  ExternalLink,
  FileKey2,
  Hourglass,
  Shield,
  UsersRound,
} from 'lucide-react';
import type {
  GovernanceFinding,
  GovernanceStatus,
  LanguageGovernance,
} from '@/lib/language-governance';

const STATUS_META: Record<GovernanceStatus, { label: string; className: string }> = {
  documented: {
    label: 'Documented',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  },
  partial: {
    label: 'Partial',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
  },
  open: {
    label: 'Open',
    className: 'bg-muted text-muted-foreground',
  },
};

function StatusPill({ status }: { status: GovernanceStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function Finding({
  icon: Icon,
  title,
  finding,
}: {
  icon: typeof BookMarked;
  title: string;
  finding: GovernanceFinding;
}) {
  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lang-accent-soft)] text-[var(--lang-accent)]">
          <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
            <StatusPill status={finding.status} />
          </div>
          <p className="mt-2 font-semibold leading-snug text-foreground">{finding.label}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{finding.detail}</p>
        </div>
      </div>
    </div>
  );
}

function ReferenceLinks({
  languageName,
  governance,
}: {
  languageName: string;
  governance: LanguageGovernance;
}) {
  return (
    <div className="flex items-start gap-3">
      <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lang-accent)]" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-foreground">Evidence and context</p>
        {governance.references.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {governance.references.map((reference) => (
              <a
                key={reference.url}
                href={reference.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--lang-accent)] underline-offset-4 hover:underline"
              >
                {reference.label}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            No public reference has been attached yet. This remains visible as an open curation task.
          </p>
        )}
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          These links document source, rights, or language context for {languageName}; linking does not imply endorsement of Mob Translate.
        </p>
      </div>
    </div>
  );
}

export function LanguageGovernancePanel({
  languageName,
  governance,
}: {
  languageName: string;
  governance: LanguageGovernance;
}) {
  return (
    <section id="collection-status" aria-label="Collection status" className="mt-8">
      {/* On phones, keep the trust conclusion in the reading flow without
          pushing the primary dictionary search below a full audit card. */}
      <details className="group overflow-hidden rounded-2xl border border-border bg-background/90 shadow-sm sm:hidden">
        <summary className="flex min-h-[7.5rem] cursor-pointer list-none items-start gap-3.5 p-5 marker:content-none">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--lang-accent)] text-white shadow-sm">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--lang-accent)]">
              About this collection
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold leading-tight">
              {governance.collectionLabel}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {governance.sourceEvidence.label} · {governance.publicationBasis.label} · Stewardship {STATUS_META[governance.communityRelationship.status].label.toLowerCase()}
            </p>
          </div>
          <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-[var(--lang-accent)] transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="border-t border-border">
          <p className="px-5 py-4 text-sm leading-relaxed text-muted-foreground">{governance.summary}</p>
          <div className="divide-y divide-border border-y border-border">
            <Finding icon={BookMarked} title="Source evidence" finding={governance.sourceEvidence} />
            <Finding icon={FileKey2} title="Publication basis" finding={governance.publicationBasis} />
            <Finding icon={UsersRound} title="Stewardship" finding={governance.communityRelationship} />
          </div>
          <div className="px-5 py-5">
            <ReferenceLinks languageName={languageName} governance={governance} />
          </div>
        </div>
      </details>

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-background/85 shadow-sm backdrop-blur-sm sm:block">
        <div className="flex items-start justify-between gap-4 px-6 py-6">
          <div className="flex max-w-3xl items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--lang-accent)] text-white shadow-sm">
              <Shield className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lang-accent)]">
                About this collection
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{governance.collectionLabel}</h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{governance.summary}</p>
            </div>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">
            Checked <time dateTime={governance.lastAudited}>30 Jul 2026</time>
          </p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border border-y border-border">
          <Finding icon={BookMarked} title="Source evidence" finding={governance.sourceEvidence} />
          <Finding icon={FileKey2} title="Publication basis" finding={governance.publicationBasis} />
          <Finding icon={UsersRound} title="Stewardship" finding={governance.communityRelationship} />
        </div>

        <div className="px-6 py-5">
          <ReferenceLinks languageName={languageName} governance={governance} />
        </div>
      </div>
    </section>
  );
}
