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
          Official community-built dictionaries for Australian and Indigenous languages, curated with
          speakers and linguists — each with its source shown. More collections are on the way.
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
            <h3 className="text-xl font-display font-semibold mb-3">Built with community</h3>
            <p className="text-muted-foreground leading-relaxed">
              Each dictionary is built with community input, making it easy to explore and learn
              Indigenous languages online, with the language treated as the subject, not the artifact.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-display font-semibold mb-3">Owned by the community</h3>
            <p className="text-muted-foreground leading-relaxed">
              Dictionaries are created in collaboration with Indigenous communities and linguists.
              We welcome contributors who want to help these resources grow.
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
