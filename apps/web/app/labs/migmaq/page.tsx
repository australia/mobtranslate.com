import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import MigmaqTranslatorClient from './MigmaqTranslatorClient';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: "English to Mi'gmaq research translator",
  description:
    "A guarded, noncommercial English-to-Mi'gmaq research preview. Model output is not speaker-reviewed.",
  path: '/labs/migmaq',
  noindex: true,
});

export default function MigmaqTranslatorPage() {
  return (
    <SharedLayout>
      <MigmaqTranslatorClient />
    </SharedLayout>
  );
}
