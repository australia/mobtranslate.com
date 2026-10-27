import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import AtlasSpreadPage from './AtlasSpreadPage';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Deep-time spread & why it moved — Atlas of Australian Languages',
  description:
    'An animated model of the Pama-Nyungan expansion across Australia, with every scholarly theory of why it moved, the evidence for and against, and full citations.',
  path: '/atlas/spread',
});

export const dynamic = 'force-static';

export default function Page() {
  return (
    <SharedLayout>
      <AtlasSpreadPage />
    </SharedLayout>
  );
}
