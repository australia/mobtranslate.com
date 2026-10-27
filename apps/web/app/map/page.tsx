import type { Metadata } from 'next';
import SharedLayout from '../components/SharedLayout';
import MapExplorer from './MapExplorer';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Map of Australian languages',
  description:
    'An interactive map of 800+ Aboriginal and Torres Strait Islander language varieties, by family, by one grammatical feature, or by shared features.',
  path: '/map',
});

export const dynamic = 'force-static';

export default function MapPage() {
  return (
    <SharedLayout>
      <MapExplorer />
    </SharedLayout>
  );
}
