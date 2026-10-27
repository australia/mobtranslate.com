import type { Metadata } from 'next';
import SharedLayout from '../components/SharedLayout';
import SpreadClient from './SpreadClient';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'How our languages spread',
  description:
    'An animated map of the Pama-Nyungan language spread from the Gulf of Carpentaria about 5,600 years ago, a linguistic spread across a continent people had lived in for 65,000 years.',
  path: '/spread',
});

export const dynamic = 'force-static';

export default function SpreadPage() {
  return (
    <SharedLayout>
      <SpreadClient />
    </SharedLayout>
  );
}
