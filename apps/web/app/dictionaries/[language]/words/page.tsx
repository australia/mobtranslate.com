'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SharedLayout from '../../../components/SharedLayout';
import getDictionary, { type Dictionary, type DictionaryWord } from '@dictionaries';

export default function WordsPage() {
  const params = useParams();
  const language = params?.language as string || '';
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDictionary() {
      try {
        // Fetch dictionary data using the provided function
        const dictionaryData = await getDictionary(language);
        setDictionary(dictionaryData);
      } catch (err) {
        console.error('Error loading dictionary:', err);
        setError('Failed to load dictionary data.');
      } finally {
        setLoading(false);
      }
    }
    
    loadDictionary();
  }, [language]);

  // Group words by first letter for an alphabetical listing
  const wordsByLetter: Record<string, DictionaryWord[]> = {};
  
  if (dictionary?.words) {
    dictionary.words.forEach(word => {
      const firstLetter = word.word.charAt(0).toUpperCase();
      if (!wordsByLetter[firstLetter]) {
        wordsByLetter[firstLetter] = [];
      }
      wordsByLetter[firstLetter].push(word);
    });
  }

  if (loading) {
    return (
      <SharedLayout>
        <div className="max-w-4xl mx-auto py-12 text-center">
          <p className="text-lg">Loading words...</p>
        </div>
      </SharedLayout>
    );
  }

  if (error || !dictionary) {
    return (
      <SharedLayout>
        <div className="max-w-4xl mx-auto py-12 text-center">
          <p className="text-lg text-red-500">{error || 'Dictionary not found'}</p>
          <Link href="/dictionaries" className="text-primary hover:underline mt-4 inline-block">
            Return to Dictionary List
          </Link>
        </div>
      </SharedLayout>
    );
  }

  // Sort the letter groups
  const sortedLetters = Object.keys(wordsByLetter).sort();

  return (
    <SharedLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <Link 
            href={`/dictionaries/${language}`} 
            className="text-primary hover:underline flex items-center mb-4"
          >
            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to {dictionary.meta.name} Dictionary
          </Link>
          <h1 className="text-3xl font-bold mb-2">All {dictionary.meta.name} Words</h1>
          <p className="text-muted-foreground">
            Browse all words in our {dictionary.meta.name} dictionary. Each word has its own dedicated page
            with detailed information.
          </p>
        </div>

        {/* Alphabet quick navigation */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex space-x-1 min-w-max">
            {sortedLetters.map(letter => (
              <a 
                key={letter} 
                href={`#section-${letter}`}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              >
                {letter}
              </a>
            ))}
          </div>
        </div>

        {/* Word listings by letter */}
        <div className="space-y-8">
          {sortedLetters.map(letter => (
            <section key={letter} id={`section-${letter}`}>
              <h2 className="text-2xl font-bold mb-4 pb-2 border-b">{letter}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {wordsByLetter[letter].map(word => (
                  <Link 
                    key={word.word}
                    href={`/dictionaries/${language}/words/${encodeURIComponent(word.word)}`}
                    className="p-4 bg-card hover:bg-muted/50 rounded-lg border transition-colors"
                  >
                    <div className="font-semibold mb-1">{word.word}</div>
                    <div className="text-sm text-muted-foreground">
                      {word.type} • {word.definition}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 bg-muted p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">About This Dictionary</h2>
          <p className="mb-3">
            This page lists all words in our {dictionary.meta.name} dictionary to make them more discoverable
            through search engines and to provide a comprehensive view of the language.
          </p>
          <p>
            Click on any word to view its dedicated page with detailed information including pronunciation,
            cultural context, and example usage.
          </p>
        </div>
      </div>
    </SharedLayout>
  );
}
