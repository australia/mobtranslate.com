import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import ResearchBar from '@/components/research/ResearchBar';
import ResearchDocumentBoundary from '@/components/research/ResearchDocumentBoundary';
import { requireResearchAdminPage } from '@/lib/research/access';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Research', template: '%s · Research' },
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

// The guard here only keeps the chrome away from non-admins; layouts are not
// re-rendered on client navigation, so every page and route checks again.
export default async function ResearchLayout({ children }: { children: ReactNode }) {
  await requireResearchAdminPage();
  return (
    <ResearchDocumentBoundary>
      <div className="flex min-h-screen flex-col" style={{ '--research-bar-height': '2.5rem' } as CSSProperties}>
        <ResearchBar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </ResearchDocumentBoundary>
  );
}
