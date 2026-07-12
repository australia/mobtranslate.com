import type { Metadata } from 'next';
import AtlasStub from '../AtlasStub';

export const metadata: Metadata = {
  title: 'Grammar & similarity — Atlas of Australian Languages',
  description:
    'Colour the map by any Grambank or WALS grammatical feature, view recorded-agreement clusters, and compare two languages feature by feature.',
};

export const dynamic = 'force-static';

export default function GrammarPage() {
  return (
    <AtlasStub
      eyebrow="Grammar & similarity"
      title="The typology lens"
      intro="Choose a Grambank, WALS or extension feature and colour the whole map by it; browse the recorded-agreement clusters and nearest-neighbour similarity; compare two languages' grammatical profiles side by side — always with an honest 'not profiled' greyout for the languages that have no coded grammar."
      bullets={[
        'Feature-colour the map across the 203 grammatically-profiled languages.',
        'k=8 recorded-agreement clusters and nearest-neighbour view.',
        'Two-language feature comparison, with coverage shown as a fraction of the whole.',
      ]}
      liveAlt={{ href: '/atlas', label: 'Explore the family map now' }}
    />
  );
}
