'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SharedLayout from '../../../components/SharedLayout';

// Types for dictionary data (same as in the language page)
interface DictionaryWord {
  word: string;
  type: string;
  definitions: string[];
  example?: string;
  notes?: string;
}

interface Dictionary {
  name: string;
  description: string;
  words: DictionaryWord[];
}

// This would come from a proper API/data source in production
const dictionaries: Record<string, Dictionary> = {
  kuku_yalanji: {
    name: 'Kuku Yalanji',
    description: 'Language traditionally spoken by the Kuku Yalanji people of the rainforest regions of Far North Queensland, Australia.',
    words: [
      {
        word: 'bama',
        type: 'noun',
        definitions: ['people', 'Aboriginal person'],
        example: 'Bama wawu-wawu dungay.',
        notes: 'Refers to Aboriginal people specifically'
      },
      {
        word: 'jalbu',
        type: 'noun',
        definitions: ['woman'],
        example: 'Jalbu yirrka-n-yirrka-n.'
      },
      {
        word: 'dingkar',
        type: 'noun',
        definitions: ['man']
      },
      {
        word: 'ngayu',
        type: 'pronoun',
        definitions: ['I', 'me'],
        example: 'Ngayu dungay.'
      },
      {
        word: 'yundu',
        type: 'pronoun',
        definitions: ['you']
      },
      {
        word: 'nyulu',
        type: 'pronoun',
        definitions: ['he/she/it']
      },
      {
        word: 'bayan',
        type: 'noun',
        definitions: ['house', 'home', 'camp'],
        example: 'Ngayu bayanba dungay.',
        notes: 'Can refer to any dwelling place'
      },
      {
        word: 'wulbuman',
        type: 'noun',
        definitions: ['old woman']
      },
      {
        word: 'wulman',
        type: 'noun',
        definitions: ['old man']
      },
      {
        word: 'mayi',
        type: 'noun',
        definitions: ['food'],
        example: 'Mayi ngulkurr.',
        notes: 'General term for food'
      }
    ]
  }
  // Additional dictionaries would be added here
};

export default function AllWordsPage() {
  const params = useParams();
  const language = params?.language as string || '';
  const dictionary = dictionaries[language];

  // Group words by first letter for an alphabetical listing
  const groupedWords: Record<string, DictionaryWord[]> = {};
  
  if (dictionary) {
    dictionary.words.forEach(word => {
      const firstLetter = word.word.charAt(0).toUpperCase();
      if (!groupedWords[firstLetter]) {
        groupedWords[firstLetter] = [];
      }
      groupedWords[firstLetter].push(word);
    });
  }

  // Sort the letter groups
  const sortedLetters = Object.keys(groupedWords).sort();

  // Handle case where dictionary doesn't exist
  if (!dictionary) {
    return (
      <SharedLayout>
        <div className="max-w-4xl mx-auto py-12 text-center">
          <h1 className="text-3xl font-bold mb-4">Dictionary not found</h1>
          <p className="mb-8">Sorry, we couldn't find that dictionary.</p>
          <Link href="/dictionaries" className="text-primary hover:underline">
            Back to Dictionaries
          </Link>
        </div>
      </SharedLayout>
    );
  }

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
            Back to {dictionary.name} Dictionary
          </Link>
          <h1 className="text-3xl font-bold mb-2">All {dictionary.name} Words</h1>
          <p className="text-muted-foreground">
            Browse all words in our {dictionary.name} dictionary. Each word has its own dedicated page
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
                {groupedWords[letter].map(word => (
                  <Link 
                    key={word.word}
                    href={`/dictionaries/${language}/words/${word.word}`}
                    className="p-4 bg-card hover:bg-muted/50 rounded-lg border transition-colors"
                  >
                    <div className="font-semibold mb-1">{word.word}</div>
                    <div className="text-sm text-muted-foreground">
                      {word.type} • {word.definitions[0]}
                      {word.definitions.length > 1 && '...'}
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
            This page lists all words in our {dictionary.name} dictionary to make them more discoverable
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
