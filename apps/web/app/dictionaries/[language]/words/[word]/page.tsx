'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SharedLayout from '../../../../components/SharedLayout';

// This would be fetched from an API or database based on the language and word parameters
type WordData = {
  word: string;
  language: string;
  languageDisplay: string;
  translation: string;
  partOfSpeech: string;
  definition: string;
  example?: string;
  pronunciation?: string;
  culturalNotes?: string;
  etymology?: string;
  relatedWords?: string[];
};

export default function WordPage() {
  const params = useParams();
  const { language = '', word = '' } = params as { language: string, word: string };
  
  // Sample data - in a production app, this would be fetched from an API
  // based on the language and word parameters
  const wordData: WordData = {
    word: decodeURIComponent(word as string),
    language: language as string,
    languageDisplay: language === 'kuku_yalanji' ? 'Kuku Yalanji' : decodeURIComponent(language as string),
    translation: 'Example translation',
    partOfSpeech: 'noun',
    definition: 'An example definition for this word in the Aboriginal language.',
    example: 'Example sentence using this word in context.',
    pronunciation: '/pronunciation-guide/',
    culturalNotes: 'Cultural context and significance of this word.',
    etymology: 'Origin and history of this word.',
    relatedWords: ['related1', 'related2', 'related3']
  };

  // In production, we would handle loading and error states
  if (!wordData) {
    return (
      <SharedLayout>
        <div className="max-w-4xl mx-auto py-12 text-center">
          <h1 className="text-2xl font-bold mb-4">Word not found</h1>
          <p className="mb-8">Sorry, we couldn't find that word in our dictionary.</p>
          <Link 
            href={`/dictionaries/${language}`} 
            className="text-primary hover:underline"
          >
            Return to dictionary
          </Link>
        </div>
      </SharedLayout>
    );
  }

  return (
    <SharedLayout>
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb Navigation */}
        <nav className="text-sm mb-8">
          <ol className="flex items-center space-x-2">
            <li>
              <Link href="/dictionaries" className="text-muted-foreground hover:text-primary">
                Dictionaries
              </Link>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-muted-foreground">/</span>
              <Link 
                href={`/dictionaries/${wordData.language}`} 
                className="text-muted-foreground hover:text-primary"
              >
                {wordData.languageDisplay}
              </Link>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">{wordData.word}</span>
            </li>
          </ol>
        </nav>

        <article className="bg-card rounded-lg shadow-sm border p-8">
          <header className="mb-8 pb-6 border-b">
            <h1 className="text-4xl font-bold mb-3">{wordData.word}</h1>
            <div className="flex flex-wrap gap-3 mb-4">
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm">
                {wordData.languageDisplay}
              </span>
              <span className="bg-muted px-3 py-1 rounded-full text-sm">
                {wordData.partOfSpeech}
              </span>
            </div>
            {wordData.pronunciation && (
              <p className="text-muted-foreground italic">
                Pronunciation: {wordData.pronunciation}
              </p>
            )}
          </header>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Definition</h2>
            <p className="mb-4">{wordData.definition}</p>
            <p className="text-xl font-semibold">Translation: <span className="font-normal">{wordData.translation}</span></p>
          </section>

          {wordData.example && (
            <section className="mb-8 p-4 bg-muted rounded-lg">
              <h2 className="text-xl font-semibold mb-2">Example</h2>
              <blockquote className="italic">{wordData.example}</blockquote>
            </section>
          )}

          {wordData.culturalNotes && (
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Cultural Context</h2>
              <p>{wordData.culturalNotes}</p>
            </section>
          )}

          {wordData.etymology && (
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Etymology</h2>
              <p>{wordData.etymology}</p>
            </section>
          )}

          {wordData.relatedWords && wordData.relatedWords.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Related Words</h2>
              <div className="flex flex-wrap gap-2">
                {wordData.relatedWords.map((relatedWord, index) => (
                  <Link 
                    key={index}
                    href={`/dictionaries/${wordData.language}/words/${relatedWord}`}
                    className="bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-md text-sm transition-colors"
                  >
                    {relatedWord}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>

        <div className="mt-8 text-center">
          <Link 
            href={`/dictionaries/${wordData.language}`}
            className="inline-flex items-center bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            Back to {wordData.languageDisplay} Dictionary
          </Link>
        </div>
      </div>
    </SharedLayout>
  );
}
