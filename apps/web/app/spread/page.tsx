import type { Metadata } from 'next';
import SharedLayout from '../components/SharedLayout';
import SpreadClient from './SpreadClient';

export const metadata: Metadata = {
  title: 'How our languages spread — animated — MobTranslate',
  description:
    'An animated wind-map of the Pama-Nyungan language expansion across Australia, ' +
    'from a Gulf-of-Carpentaria origin ~5,578 years BP outward to Cape York and ' +
    'beyond. A model-inferred hypothesis from historical linguistics (Bouckaert, ' +
    'Bowern & Atkinson 2018) — a ~5,000-year LINGUISTIC spread across a continent ' +
    'already populated for ~65,000 years. Trace Kuku Yalanji arriving home.',
};

export const dynamic = 'force-static';

export default function SpreadPage() {
  return (
    <SharedLayout>
      <SpreadClient />
    </SharedLayout>
  );
}
