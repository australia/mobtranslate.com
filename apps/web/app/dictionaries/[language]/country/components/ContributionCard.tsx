import Link from 'next/link';
import { KIND_LABELS, type Contribution } from '@/lib/country/contributions';

export function targetHref(language: string, target: string): string | null {
  const [kind, slug] = target.split(':');
  if (kind === 'entry') return `/dictionaries/${language}/country/${slug}`;
  if (kind === 'place') return `/dictionaries/${language}/country/places/${slug}`;
  return null;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// One community contribution, rendered the same way on a page, on the index
// and on the contributions list. Text is shown as typed (escaped), never as
// Markdown, so nothing a contributor writes can change the page around it.
export function ContributionCard({
  contribution,
  showTarget = false,
  targetTitle,
  onRemove,
}: {
  contribution: Contribution;
  showTarget?: boolean;
  targetTitle?: string;
  onRemove?: () => void;
}) {
  const href = targetHref(contribution.language, contribution.target);
  return (
    <article className="rounded-lg border border-border bg-card px-4 py-3">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="rounded bg-[var(--lang-accent-soft)] px-1.5 py-0.5 text-xs font-medium text-foreground">
          {KIND_LABELS[contribution.kind]}
        </span>
        <span className="font-semibold text-foreground">{contribution.name}</span>
        <time dateTime={contribution.createdAt} className="text-muted-foreground">
          {formatDate(contribution.createdAt)}
        </time>
        {showTarget && href && (
          <Link href={href} className="text-[var(--lang-accent)] hover:underline">
            {targetTitle ?? contribution.target.split(':')[1]}
          </Link>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto text-xs text-muted-foreground underline hover:text-foreground">
            Remove
          </button>
        )}
      </header>
      {contribution.title && <h3 className="mt-2 text-lg font-semibold">{contribution.title}</h3>}
      {contribution.words && (
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Kuku Yalanji: </span>
          <em className="font-medium text-[var(--lang-accent)]">{contribution.words}</em>
        </p>
      )}
      {contribution.photoUrl && (
        <a href={contribution.photoUrl} className="mt-3 block">
          {/* eslint-disable-next-line @next/next/no-img-element -- user upload served by our route */}
          <img
            src={contribution.photoUrl}
            alt={contribution.body || `Photo added by ${contribution.name}`}
            width={contribution.photoWidth ?? undefined}
            height={contribution.photoHeight ?? undefined}
            loading="lazy"
            className="h-auto max-h-[32rem] w-auto max-w-full rounded-md bg-muted object-contain"
          />
        </a>
      )}
      {contribution.body && <p className="mt-2 whitespace-pre-wrap leading-7">{contribution.body}</p>}
      {(contribution.where || contribution.when) && (
        <p className="mt-2 text-xs text-muted-foreground">
          {[contribution.where, contribution.when].filter(Boolean).join(' · ')}
        </p>
      )}
    </article>
  );
}
