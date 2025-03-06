import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SharedLayout from '../../../../components/SharedLayout';
import { type DictionaryWord } from '@dictionaries';
import { 
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@ui/components/card";

async function getWordData(language: string, word: string) {
  try {
    // For server components, we need to ensure we have a valid absolute URL
    // Using URL constructor to guarantee a valid URL
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 
      (typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin);
    
    const url = new URL(`/api/dictionaries/${language}/words/${encodeURIComponent(word)}`, baseUrl);
    
    const response = await fetch(
      url.toString(),
      { cache: 'no-store' }
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error('Failed to fetch word data');
    }
    
    return response.json();
  } catch (error) {
    console.error('Error fetching word data:', error);
    return null;
  }
}

export default async function WordDetailPage({
  params,
}: {
  params: { language: string; word: string };
}) {
  const { language, word } = params;
  
  const wordResponse = await getWordData(language, decodeURIComponent(word));
  
  if (!wordResponse || !wordResponse.success) {
    notFound();
  }
  
  const { data: wordData, meta, relatedWords } = wordResponse;
  
  return (
    <SharedLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Breadcrumb navigation */}
          <div className="flex items-center space-x-2 text-sm">
            <Link href="/dictionaries" className="text-muted-foreground hover:text-foreground">
              Dictionaries
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link href={`/dictionaries/${language}`} className="text-muted-foreground hover:text-foreground">
              {meta.name}
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium truncate">{wordData.word}</span>
          </div>
          
          {/* Word header */}
          <div>
            <h1 className="text-4xl font-bold tracking-tight">{wordData.word}</h1>
            {wordData.type && (
              <p className="text-xl text-muted-foreground mt-1">{wordData.type}</p>
            )}
          </div>
          
          {/* Word details */}
          <div className="space-y-6">
            {/* Definition */}
            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Definition</h2>
              {wordData.definition ? (
                <p>{wordData.definition}</p>
              ) : wordData.definitions && wordData.definitions.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1">
                  {wordData.definitions.map((definition: string, index: number) => (
                    <li key={index}>{definition}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground italic">No definition available</p>
              )}
            </div>
            
            {/* Examples */}
            {wordData.example && (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold tracking-tight">Example</h2>
                <div className="bg-muted p-4 rounded-md border italic">
                  "{wordData.example}"
                </div>
              </div>
            )}
            
            {/* Translations */}
            {wordData.translations && wordData.translations.length > 0 && (
              <div className="mt-6">
                <h2 className="text-xl font-semibold tracking-tight">Translations</h2>
                <div className="flex flex-wrap gap-2">
                  {wordData.translations.map((translation: string, index: number) => (
                    <span key={index} className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-sm font-medium">
                      {translation}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Synonyms */}
            {wordData.synonyms && wordData.synonyms.length > 0 && (
              <div className="mt-6">
                <h2 className="text-xl font-semibold tracking-tight">Synonyms</h2>
                <div className="flex flex-wrap gap-2">
                  {wordData.synonyms.map((synonym: string, index: number) => (
                    <Link 
                      key={index}
                      href={`/dictionaries/${language}/words/${encodeURIComponent(synonym)}`}
                      className="inline-flex items-center rounded-md bg-primary/10 text-primary hover:bg-primary/20 px-2 py-1 text-sm font-medium"
                    >
                      {synonym}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            
            {/* Cultural context */}
            {wordData.cultural_context && (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold tracking-tight">Cultural Context</h2>
                <div className="bg-muted/50 p-4 rounded-md border">
                  <p>{wordData.cultural_context}</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Related words */}
          {relatedWords && relatedWords.length > 0 && (
            <div className="space-y-4 pt-4 border-t">
              <h2 className="text-xl font-semibold tracking-tight">Related Words</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {relatedWords.map((related: DictionaryWord, index: number) => (
                  <Card key={related.word} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">
                        <Link 
                          href={`/dictionaries/${language}/words/${encodeURIComponent(related.word)}`}
                          className="hover:underline"
                        >
                          {related.word}
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">
                        {related.definition || 
                          (related.definitions && related.definitions[0]) || 
                          'No definition available'}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          
          {/* Back to dictionary link */}
          <div className="pt-6">
            <Link 
              href={`/dictionaries/${language}`}
              className="text-primary hover:underline flex items-center"
            >
              <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to {meta.name} Dictionary
            </Link>
          </div>
        </div>
      </div>
    </SharedLayout>
  );
}
