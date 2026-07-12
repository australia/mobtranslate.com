import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import AtlasSpreadPage from './AtlasSpreadPage';

export const metadata: Metadata = {
  title: 'Deep-time spread & why it moved — Atlas of Australian Languages',
  description:
    'An animated model of the Pama-Nyungan language expansion across Australia (Bouckaert, Bowern & ' +
    'Atkinson 2018), fused with a contradiction-preserving matrix of every scholarly thesis of WHY ' +
    'the languages moved — Gulf-of-Carpentaria origin, mid-Holocene climate/ENSO, spread without ' +
    'farming, the small-tool/dingo package, kinship-loanword waves, demic-vs-language-shift, ' +
    'archaeogenetics, and Dixon’s dissent — each with evidence for AND against, hard dated facts, ' +
    'a consensus meter, and full citations. A language lineage spreading is not people arriving.',
  alternates: { canonical: '/atlas/spread' },
};

export const dynamic = 'force-static';

export default function Page() {
  return (
    <SharedLayout>
      <AtlasSpreadPage />
    </SharedLayout>
  );
}
