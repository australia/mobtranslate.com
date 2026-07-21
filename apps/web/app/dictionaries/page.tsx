import React from 'react';
import SharedLayout from '../components/SharedLayout';
import { getDictionaryLanguages } from '@/lib/db/queries';
import DictionariesBrowser from './DictionariesBrowser';

export const revalidate = 3600;

export default async function DictionariesPage() {
  const languages = await getDictionaryLanguages();

  const totalLanguages = languages.length;
  const totalWords = languages.reduce((sum, l) => sum + l.wordCount, 0);

  return (
    <SharedLayout>
      {/* Header */}
      <div className="marketing pt-10 pb-8 md:pt-14 md:pb-10 max-w-2xl">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-[-0.02em] mb-3">
          Dictionaries
        </h1>
        <p className="text-muted-foreground text-base md:text-lg leading-relaxed text-pretty">
          Source-attributed dictionaries for Australian and other Indigenous languages. Publication
          here does not imply official status or community certification. More collections are on the way.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {totalLanguages.toLocaleString()}
          </span>{' '}
          dictionaries ·{' '}
          <span className="font-medium text-foreground tabular-nums">
            {totalWords.toLocaleString()}
          </span>{' '}
          entries and counting
        </p>
      </div>

      <div className="marketing">
        <DictionariesBrowser languages={languages} />
      </div>

      {/* About — editorial, two columns, no icon-card chrome */}
      <section className="marketing border-t border-border py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 max-w-4xl">
          <div>
            <h3 className="text-xl font-display font-semibold mb-3">Provenance first</h3>
            <p className="text-muted-foreground leading-relaxed">
              Collections retain their named sources, terms, and available review state so a learner
              can distinguish an attributed record from an unverified machine output.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-display font-semibold mb-3">Contributions and review</h3>
            <p className="text-muted-foreground leading-relaxed">
              Speakers, language custodians, linguists, and learners can propose corrections and new
              evidence. A contribution is credited; review or approval is recorded only when it occurs.
            </p>
          </div>
        </div>
      </section>
    </SharedLayout>
  );
}

export async function generateMetadata() {
  return {
    title: 'Indigenous Language Dictionaries - MobTranslate',
    description: 'Browse our collection of Indigenous language dictionaries from around the world. Explore and learn traditional languages online.',
    openGraph: {
      title: 'Indigenous Language Dictionaries',
      description: 'Explore dictionaries for Indigenous languages including Kuku Yalanji, Mi\'gmaq, and Anindilyakwa.',
      type: 'website',
    },
  };
}
