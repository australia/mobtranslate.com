import type { CountryEntry } from '@/lib/country/schema';

const COPY: Record<CountryEntry['review']['status'], { title: string; body: string } | null> = {
  unreviewed: {
    title: 'Not yet reviewed by Yalanji people',
    body: 'Researched from the Kuku Yalanji dictionary and published records, with every source listed. Bama knowledge holders may know it differently. Corrections from Traditional Owners take priority over anything written here.',
  },
  corrected: {
    title: 'Corrected by community review',
    body: 'Parts of this entry have been corrected by Yalanji reviewers.',
  },
  'community-reviewed': null,
  hidden: null,
};

export function ReviewNotice({ status, compact = false }: { status: CountryEntry['review']['status']; compact?: boolean }) {
  const copy = COPY[status];
  if (!copy) return null;
  return (
    <aside
      className={`rounded-lg border border-warning/30 bg-warning/10 ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}`}
      role="note"
    >
      <p className="font-semibold text-foreground">{copy.title}</p>
      {!compact && <p className="mt-1 text-muted-foreground">{copy.body}</p>}
    </aside>
  );
}
