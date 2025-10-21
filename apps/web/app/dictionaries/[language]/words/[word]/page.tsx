import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SharedLayout from '../../../../components/SharedLayout';
import { PageHeader } from '@/app/components/ui/page-header';
import { Section } from '@/app/components/ui/section';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { getWordsForLanguage, searchWords } from '@/lib/supabase/queries';
import type { Word } from '@/lib/supabase/types';
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

    return (
      <SharedLayout>
        <PageHeader 
          title={word.word}
          description={`${word.word_type || word.word_class?.name || 'Word'} - ${language.name} Dictionary`}
        >
          <div className="flex items-center gap-2 mt-4">
            {word.word_class && (
              <Badge variant="secondary">
                {word.word_class.name}
              </Badge>
            )}
            {word.obsolete && (
              <Badge variant="outline">Obsolete</Badge>
            )}
            {word.sensitive_content && (
              <Badge variant="destructive">Sensitive</Badge>
            )}
          </div>
        </PageHeader>

        <Section contained={false}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <WordDetailContent word={word} />
            
            {/* Related words */}
            {relatedWords && relatedWords.length > 0 && (
              <Section title="Related Words">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {relatedWords.map((related) => (
                    <Link 
                      key={related.id}
                      href={`/dictionaries/${languageCode}/words/${encodeURIComponent(related.word)}`}
                      className="block"
                    >
                      <Card hover className="h-full">
                        <CardContent className="p-4">
                          <h3 className="font-medium font-crimson text-lg mb-2 text-primary">
                            {related.word}
                          </h3>
                          <p className="text-sm text-muted-foreground font-source-sans">
                            {related.definitions?.[0]?.definition || 'No definition available'}
                          </p>
                          {related.word_class && (
                            <Badge variant="outline" className="mt-2 text-xs">
                              {related.word_class.name}
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </Section>
            )}
            
            <div className="pt-6 border-t">
              <Button asChild variant="outline">
                <Link href={`/dictionaries/${languageCode}`}>
                  <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to {language.name} Dictionary
                </Link>
              </Button>
            </div>
          </div>
        </Section>
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