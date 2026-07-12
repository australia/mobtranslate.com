import type { Metadata } from 'next';
import AtlasStub from '../AtlasStub';

export const metadata: Metadata = {
  title: 'Directory — Atlas of Australian Languages',
  description:
    'A searchable, filterable directory of every Australian languoid — including the unlocated and the lexically-empty. No language left off the map.',
};

export const dynamic = 'force-static';

export default function DirectoryPage() {
  return (
    <AtlasStub
      eyebrow="Directory"
      title="Every language, filterable and sortable"
      intro="The full table of all 980 genuine languoids — plus a clearly separated appendix for the 49 non-language nodes — with facets for family, region, endangerment, lexical data, grammar coverage and whether a language is located or dated. This is the 'no language left off' guarantee, including the 171 without coordinates."
      bullets={[
        'Facet by family, macroarea, endangerment, has-dictionary, has-grammar, has-coordinates and dated-position.',
        'Every row deep-links to its canonical profile.',
        'Unlocated and zero-lexicon languages are present and honestly flagged, never hidden.',
      ]}
      liveAlt={{ href: '/atlas', label: 'Search every language from the atlas hub' }}
    />
  );
}
