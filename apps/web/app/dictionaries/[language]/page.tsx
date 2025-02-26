'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SharedLayout from '../../components/SharedLayout';

// Types for dictionary data
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

export default function LanguageDictionaryPage() {
  const params = useParams();
  const language = params?.language as string || '';
  const dictionary = dictionaries[language];
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  const filteredWords = dictionary?.words.filter(word => 
    word.word.toLowerCase().includes(searchTerm.toLowerCase()) || 
    word.definitions.some(def => def.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

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
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <Link 
              href="/dictionaries" 
              className="text-primary hover:underline flex items-center mb-4"
            >
              <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dictionaries
            </Link>
            <h1 className="text-3xl font-bold">{dictionary.name} Dictionary</h1>
            <p className="text-muted-foreground mt-2">{dictionary.description}</p>
          </div>
          
          <div className="w-full md:w-auto">
            <div className="relative">
              <input
                type="text"
                placeholder="Search words or definitions..."
                className="w-full md:w-80 p-3 pl-10 rounded-lg border border-input bg-background"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <svg 
                className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Word</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Definition</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredWords.length > 0 ? (
                filteredWords.map((word) => (
                  <tr key={word.word} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link 
                        href={`/dictionaries/${language}/words/${word.word}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {word.word}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{word.type}</td>
                    <td className="px-4 py-3">
                      {word.definitions.map((def, index) => (
                        <span key={index}>
                          {index > 0 && ', '}
                          {def}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3 italic text-sm hidden md:table-cell">
                      {word.example || '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No words found matching "{searchTerm}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="mt-10 flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            Showing {filteredWords.length} of {dictionary.words.length} words
          </div>
          
          <div className="text-sm">
            <Link 
              href={`/dictionaries/${language}/all-words`}
              className="text-primary hover:underline"
            >
              View all words as individual pages
            </Link>
          </div>
        </div>
        
        <div className="mt-10 bg-muted p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">About SEO and Individual Word Pages</h2>
          <p className="mb-3">
            Each word in this dictionary has its own dedicated page, optimized for search engines to help 
            people discover these important Aboriginal language resources.
          </p>
          <p>
            Click on any word to view its detailed page with pronunciation, cultural context, and examples.
          </p>
        </div>
      </div>
    </SharedLayout>
  );
}
