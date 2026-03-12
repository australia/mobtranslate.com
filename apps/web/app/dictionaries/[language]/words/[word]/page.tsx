import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SharedLayout from '../../../../components/SharedLayout';
import { Card, CardContent, Badge } from '@mobtranslate/ui';

import { ChevronRight, ArrowLeft, Sparkles } from 'lucide-react';

const Breadcrumbs = ({ items, className }: { items: { href: string; label: string }[]; className?: string }) => (
  <nav className={`flex items-center gap-2 text-sm ${className || ''}`}>
    {items.map((item, index) => (
      <React.Fragment key={item.href}>
        {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
        {index === items.length - 1 ? (
          <span className="text-foreground font-medium">{item.label}</span>
        ) : (
          <Link href={item.href} className="text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
            {item.label}
          </Link>
        )}
      </React.Fragment>
    ))}
  </nav>
);
import { getWordsForLanguage, searchWords } from '@/lib/supabase/queries';
import { WordDetailContent } from './components/WordDetailContent';

export const revalidate = 300; // Revalidate every 5 minutes

async function getWordBySlug(languageCode: string, wordSlug: string) {
  // First decode the word
  const decodedWord = decodeURIComponent(wordSlug);
  
  // Search for the word in the specific language
  const { words, language } = await getWordsForLanguage({
    language: languageCode,
    search: decodedWord,
    limit: 1
  });
  
  // Find exact match
  const exactMatch = words.find(w => 
    w.word.toLowerCase() === decodedWord.toLowerCase() ||
    w.normalized_word?.toLowerCase() === decodedWord.toLowerCase()
  );
  
  if (!exactMatch) {
    return { word: null, language, relatedWords: words.slice(0, 6) };
  }
  
  // Get related words (same root, similar words)
  const relatedWords = await searchWords(exactMatch.stem || exactMatch.word, languageCode);
  
  return {
    word: exactMatch,
    language,
    relatedWords: relatedWords.filter(w => w.id !== exactMatch.id).slice(0, 6)
  };
}

export default async function WordDetailPage({
  params,
}: {
  params: { language: string; word: string };
}) {
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


    return (
      <SharedLayout>
        {/* Header */}
        <div className="py-8 md:py-12">
          <Breadcrumbs items={breadcrumbItems} className="mb-6" />

          <div className="flex items-center gap-3 mb-3">
            <Link
              href={`/dictionaries/${languageCode}`}
              className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            </Link>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight">
              {word.word}
            </h1>
          </div>
          <div className="flex items-center gap-2 ml-12 flex-wrap">
            <span className="text-muted-foreground text-sm">
              {language.name} Dictionary
            </span>
            <span className="text-muted-foreground/40">|</span>
            {word.word_class && (
              <Badge variant="outline" className="border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
                {word.word_class.name}
              </Badge>
            )}
            {word.obsolete && (
              <Badge variant="outline" className="border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">Obsolete</Badge>
            )}
            {word.sensitive_content && (
              <Badge variant="destructive">Sensitive</Badge>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl pb-16 space-y-8">
          <WordDetailContent word={word} />

          {/* Related words */}
          {relatedWords && relatedWords.length > 0 && (
            <div>
              <div className="flex items-center gap-2.5 mb-5">
                <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <h2 className="text-xl font-display font-bold">Related Words</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {relatedWords.map((related) => (
                  <Link
                    key={related.id}
                    href={`/dictionaries/${languageCode}/words/${encodeURIComponent(related.word)}`}
                    className="group block"
                  >
                    <Card className="h-full transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-3 border-l-amber-400/50 dark:border-l-amber-600/50">
                      <CardContent className="p-4">
                        <h3 className="font-display font-semibold text-lg mb-2 text-amber-800 dark:text-amber-300 group-hover:text-amber-600 dark:group-hover:text-amber-200 transition-colors">
                          {related.word}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                          {related.definitions?.[0]?.definition || 'No definition available'}
                        </p>
                        {related.word_class && (
                          <Badge variant="outline" className="mt-2.5 text-xs border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
                            {related.word_class.name}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </SharedLayout>
    );
  } catch (error) {
    console.error('Error loading word:', error);
    notFound();
  }
}

export async function generateMetadata({
  params,
}: {
  params: { language: string; word: string };
}) {
  try {
    const { word, language } = await getWordBySlug(params.language, params.word);
    
    if (!word) {
      return {
        title: 'Word Not Found - MobTranslate',
        description: 'The requested word could not be found in our dictionary.',
      };
    }
    
    const definition = word.definitions?.[0]?.definition || 'No definition available';
    
    return {
      title: `${word.word} - ${language.name} Dictionary - MobTranslate`,
      description: `${word.word}: ${definition}`,
      openGraph: {
        title: `${word.word} - ${language.name} Dictionary`,
        description: definition,
        type: 'website',
      },
    };
  } catch {
    return {
      title: 'Dictionary - MobTranslate',
      description: 'Explore indigenous language dictionaries.',
    };
  }
}