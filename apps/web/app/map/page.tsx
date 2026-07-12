import type { Metadata } from 'next';
import SharedLayout from '../components/SharedLayout';
import MapExplorer from './MapExplorer';

export const metadata: Metadata = {
  title: 'Map — Australian languages atlas — MobTranslate',
  description:
    'An interactive atlas of Australian Aboriginal & Torres Strait Islander languages. Plot 800+ ' +
    'varieties by family, by a single grammatical feature, or by shared recorded Grambank features — ' +
    'with "not coded" always shown, never hidden. Built on open (CC-BY-4.0) data.',
};

export const dynamic = 'force-static';

export default function MapPage() {
  return (
    <SharedLayout>
      <MapExplorer />
    </SharedLayout>
  );
}
