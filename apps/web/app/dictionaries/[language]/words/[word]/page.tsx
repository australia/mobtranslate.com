import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SharedLayout from '../../../../components/SharedLayout';
import { Badge } from '@mobtranslate/ui';

import { ChevronRight, ArrowLeft, Sparkles } from 'lucide-react';
import { SpeakButton } from '@/components/audio/SpeakButton';

const Breadcrumbs = ({ items, className }: { items: { href: string; label: string }[]; className?: string }) => (
  <nav className={`flex items-center gap-2 text-sm ${className || ''}`}>
    {items.map((item, index) => (
      <React.Fragment key={item.href}>
        {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
        {index === items.length - 1 ? (
          <span className="text-foreground font-medium">{item.label}</span>
        ) : (
          <Link href={item.href} className="text-muted-foreground hover:text-[var(--lang-accent)] transition-colors">
            {item.label}
          </Link>
        )}
      </React.Fragment>
    ))}
  </nav>
);
import { getWordsForLanguage, searchWords, getWordSynonyms } from '@/lib/db/queries';
import { WordDetailContent } from './components/WordDetailContent';

export const revalidate = 300; // Revalidate every 5 minutes

async function getWordBySlug(languageCode: string, wordSlug: string) {
  // First decode the word
  const decodedWord = decodeURIComponent(wordSlug);
  
  // Search for the word in the specific language
  const { words, language } = await getWordsForLanguage({
    language: languageCode,
    search: decodedWord,
    limit: 50
  });
  
  // Historical Mi'gmaq imports contain duplicate headwords. Prefer the row
  // with the most attached dictionary content; keep the other rows intact.
  const orthographicKey = (value: string) => value
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const requestedOrthography = orthographicKey(decodedWord);
  const caseExactMatches = words.filter(w => orthographicKey(w.word) === requestedOrthography);
  const exactMatches = caseExactMatches.length > 0
    ? caseExactMatches
    : words.filter(w =>
        orthographicKey(w.word).toLocaleLowerCase('en-CA') === requestedOrthography.toLocaleLowerCase('en-CA') ||
        (w.normalized_word
          ? orthographicKey(w.normalized_word).toLocaleLowerCase('en-CA') === requestedOrthography.toLocaleLowerCase('en-CA')
          : false)
      );
  exactMatches.sort((left, right) => {
    const childRows = (candidate: typeof left) =>
      (candidate.definitions?.length ?? 0) +
      (candidate.definitions?.reduce((sum, definition) => sum + (definition.translations?.length ?? 0), 0) ?? 0) +
      (candidate.usage_examples?.length ?? 0);
    const enrichment = (candidate: typeof left) =>
      [candidate.phonemic, candidate.gloss, candidate.semantic_domain, candidate.verb_class,
        candidate.dialect, candidate.entry_source, candidate.notes].filter(Boolean).length;
    return (
      childRows(right) - childRows(left) ||
      enrichment(right) - enrichment(left) ||
      String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')) ||
      left.id.localeCompare(right.id)
    );
  });
  const exactMatch = exactMatches[0];
  
  if (!exactMatch) {
    return { word: null, language, relatedWords: words.slice(0, 6) };
  }

  // Attach synonyms (detail-page only — not fetched on list views).
  exactMatch.synonyms = await getWordSynonyms(exactMatch.id);

  // Get related words (same root, similar words)
  const relatedWords = await searchWords(exactMatch.stem || exactMatch.word, languageCode);
  
  return {
    word: exactMatch,
    language,
    relatedWords: relatedWords.filter(w => w.id !== exactMatch.id).slice(0, 6)
  };
}

export default async function WordDetailPage(
  props: {
    params: Promise<{ language: string; word: string }>;
  }
) {
  const params = await props.params;
  const { language: languageCode, word: wordSlug } = params;

  try {
    const { word, language, relatedWords } = await getWordBySlug(languageCode, wordSlug);
    
    if (!word) {
      notFound();
    }
    
    const breadcrumbItems = [
      { href: '/', label: 'Home' },
      { href: '/dictionaries', label: 'Dictionaries' },
      { href: `/dictionaries/${languageCode}`, label: language.name },
      { href: `/dictionaries/${languageCode}/words/${encodeURIComponent(word.word)}`, label: word.word }
    ];

    // Schema.org DefinedTerm — rich results for a dictionary entry.
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'DefinedTerm',
      name: word.word,
      inLanguage: language.code,
      description: word.definitions?.[0]?.definition || undefined,
      url: `https://mobtranslate.com/dictionaries/${languageCode}/words/${encodeURIComponent(word.word)}`,
      inDefinedTermSet: {
        '@type': 'DefinedTermSet',
        name: `${language.name} Dictionary`,
        url: `https://mobtranslate.com/dictionaries/${languageCode}`,
      },
    };

    return (
      <SharedLayout>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <div data-language={language.code}>
          {/* Header — the entry headword is the focus (DESIGN §5.3) */}
          <div className="py-8 md:py-12 max-w-4xl">
            <div className="flex items-center justify-between gap-4 mb-6">
              <Breadcrumbs items={breadcrumbItems} />
              <Link
                href={`/dictionaries/${languageCode}`}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--lang-accent)] transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" /> {language.name}
              </Link>
            </div>

            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--lang-accent)] mb-2">
              {language.name}
            </p>
            <div className="flex items-center gap-3 mb-3">
              <h1 className="headword text-4xl md:text-5xl lg:text-6xl font-semibold tracking-[-0.015em] leading-none" lang={language.code}>
                {word.word}
              </h1>
              <SpeakButton
                text={word.word}
                englishText={word.gloss || word.definitions?.[0]?.definition}
                lang={language.code}
                size="lg"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {word.word_class && <Badge variant="secondary">{word.word_class.name}</Badge>}
              {word.obsolete && <Badge variant="outline">Obsolete</Badge>}
              {word.sensitive_content && <Badge variant="destructive">Sensitive</Badge>}
            </div>
          </div>

          {/* Content */}
          <div className="max-w-4xl pb-16 space-y-10">
            <WordDetailContent word={word} languageCode={language.code} />

            {/* Related words */}
            {relatedWords && relatedWords.length > 0 && (
              <div className="border-t border-border pt-8">
                <div className="flex items-center gap-2.5 mb-5">
                  <Sparkles className="w-5 h-5 text-[var(--lang-accent)]" aria-hidden="true" />
                  <h2 className="text-xl font-display font-semibold">Related words</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {relatedWords.map((related) => (
                    <Link
                      key={related.id}
                      href={`/dictionaries/${languageCode}/words/${encodeURIComponent(related.word)}`}
                      className="group block rounded-xl border border-border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--lang-accent)]"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <h3 className="font-display font-semibold text-lg transition-colors group-hover:text-[var(--lang-accent)]" lang={language.code}>
                          {related.word}
                        </h3>
                        <SpeakButton
                          text={related.word}
                          englishText={related.gloss || related.definitions?.[0]?.definition}
                          lang={language.code}
                          size="sm"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {related.definitions?.[0]?.definition || 'No definition available'}
                      </p>
                      {related.word_class && (
                        <Badge variant="outline" className="mt-2.5 text-xs">
                          {related.word_class.name}
                        </Badge>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </SharedLayout>
    );
  } catch (error) {
    console.error('Error loading word:', error);
    notFound();
  }
}

export async function generateMetadata(
  props: {
    params: Promise<{ language: string; word: string }>;
  }
) {
  const params = await props.params;
  try {
    const { word, language } = await getWordBySlug(params.language, params.word);
    
    if (!word) {
      return {
        title: 'Word Not Found - MobTranslate',
        description: 'The requested word could not be found in our dictionary.',
      };
    }
    
    const definition = word.definitions?.[0]?.definition || 'No definition available';
    const canonical = `/dictionaries/${params.language}/words/${encodeURIComponent(word.word)}`;
    const description = `${word.word} in ${language.name}: ${definition}`;
    return {
      title: `${word.word} — ${language.name} word`,
      description,
      alternates: { canonical },
      openGraph: {
        title: `${word.word} — ${language.name} | Mob Translate`,
        description,
        url: canonical,
        type: 'article',
      },
    };
  } catch {
    return {
      title: 'Dictionary - MobTranslate',
      description: 'Explore indigenous language dictionaries.',
    };
  }
}
