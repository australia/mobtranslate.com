import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import MigmaqTranslatorClient from './MigmaqTranslatorClient';

export const metadata: Metadata = {
  title: "English to Mi'gmaq research translator",
  description: "A guarded, noncommercial English-to-Mi'gmaq research preview. Model output is not speaker-reviewed.",
  alternates: { canonical: '/labs/migmaq' },
  robots: { index: false, follow: false },
};

export default function MigmaqTranslatorPage() {
  return (
    <SharedLayout>
      <MigmaqTranslatorClient />
    </SharedLayout>
  );
}
