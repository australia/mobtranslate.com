'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SharedLayout from '../../components/SharedLayout';
import { getDictionary, type Dictionary } from '../../lib/dictionary';

// Language codes we support
const supportedLanguages = ['kuku_yalanji', 'migmaq', 'anindilyakwa'];

export default function LanguageDictionaryPage() {
  const params = useParams();
  const language = params?.language as string || '';
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!supportedLanguages.includes(language)) {
      setError(`Language '${language}' is not supported.`);
      setLoading(false);
      return;
    }
    
    try {
      // Fetch dictionary data using the provided function
      const dictionaryData = getDictionary(language);
      setDictionary(dictionaryData);
    } catch (err) {
      console.error('Error loading dictionary:', err);
      setError('Failed to load dictionary data.');
    } finally {
      setLoading(false);
    }
  }, [language]);

  // Filter words based on search term
  const filteredWords = dictionary?.words?.filter(word => 
    word.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
    word.definition.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <SharedLayout>
        <div className="max-w-4xl mx-auto py-12 text-center">
          <p className="text-lg">Loading dictionary...</p>
        </div>
      </SharedLayout>
    );
  }

  if (error || !dictionary) {
    return (
      <SharedLayout>
        <div className="max-w-4xl mx-auto py-12 text-center">
          <p className="text-lg text-red-500">{error || 'Dictionary not found'}</p>
          <Link href="/dictionaries" className="text-blue-500 hover:underline mt-4 inline-block">
            Return to Dictionary List
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
                      {word.definition.length > 100 
                        ? `${word.definition.substring(0, 100).replace(/\n.*$/, '')}...` 
                        : word.definition.split('\n')[0]}
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
