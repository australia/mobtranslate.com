'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/card';
import SharedLayout from '../../../../components/SharedLayout';

import getDictionary, { type Dictionary, type DictionaryWord } from '@dictionaries';

export default function WordDetailPage() {
  const params = useParams();
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [wordData, setWordData] = useState<DictionaryWord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const language = params?.language as string;
    const wordSlug = params?.word as string;
    
    const loadDictionary = async () => {
      if (!language || !wordSlug) {
        setError('Invalid URL parameters');
        setLoading(false);
        return;
      }

      try {
        // Get dictionary data
        const dictionaryData = await getDictionary(language);
        setDictionary(dictionaryData);

        // Find the requested word in the dictionary
        const wordData = dictionaryData?.words.find(w => 
          w.word.toLowerCase() === wordSlug.toLowerCase()
        );
        
        if (!wordData) {
          setError(`Word "${wordSlug}" not found in the ${language} dictionary.`);
        } else {
          setWordData(wordData);
        }
      } catch (err) {
        console.error('Error loading dictionary data:', err);
        setError('Failed to load dictionary data.');
      } finally {
        setLoading(false);
      }
    };

    loadDictionary();
  }, [params]);

  if (loading) {
    return (
      <SharedLayout>
        <div className="max-w-4xl mx-auto py-12 text-center">
          <p className="text-lg">Loading word data...</p>
        </div>
      </SharedLayout>
    );
  }

  if (!dictionary) {
    return (
      <SharedLayout>
        <Card className="max-w-4xl mx-auto my-12">
          <CardHeader>
            <CardTitle className="text-xl text-red-500">Error Loading Dictionary</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Sorry, we couldn't load the dictionary. Please try again later.</p>
            <Link href="/dictionaries" className="text-primary hover:underline mt-4 inline-block">
              Return to Dictionary List
            </Link>
          </CardContent>
        </Card>
      </SharedLayout>
    );
  }

  if (!wordData) {
    return (
      <SharedLayout>
        <Card className="max-w-4xl mx-auto my-12">
          <CardHeader>
            <CardTitle className="text-xl text-red-500">Word Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Sorry, we couldn't find that word in the {dictionary.meta.name} dictionary.</p>
            <Link 
              href={`/dictionaries/${params?.language}`}
              className="text-primary hover:underline mt-4 inline-block"
            >
              ← Back to {dictionary.meta.name} dictionary
            </Link>
          </CardContent>
        </Card>
      </SharedLayout>
    );
  }

  return (
    <SharedLayout>
      <div className="max-w-4xl mx-auto">
        <Link 
          href={`/dictionaries/${params?.language}`}
          className="text-primary hover:underline flex items-center mb-8"
        >
          <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          ← Back to {dictionary.meta.name} dictionary
        </Link>

        <div className="bg-card rounded-lg shadow-md overflow-hidden border">
          <div className="p-8">
            <h1 className="text-4xl font-bold mb-2">{wordData.word}</h1>
            <p className="text-muted-foreground mb-6">
              <span className="italic">{wordData.type}</span> • {dictionary.meta.name}
            </p>

            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">Definition</h2>
                <div className="bg-muted p-4 rounded-md">
                  {wordData.definition ? (
                    <p className="whitespace-pre-line">{wordData.definition}</p>
                  ) : Array.isArray(wordData.definitions) ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {wordData.definitions.map((def, i) => (
                        <li key={i}>{def}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{wordData.definitions || '(No definition available)'}</p>
                  )}
                </div>
              </div>

              {wordData.example && (
                <div>
                  <h2 className="text-xl font-semibold mb-2">Example</h2>
                  <div className="bg-muted p-4 rounded-md italic">
                    "{wordData.example}"
                  </div>
                </div>
              )}

              {wordData.cultural_context && (
                <div>
                  <h2 className="text-xl font-semibold mb-2">Cultural Context</h2>
                  <div className="bg-muted p-4 rounded-md">
                    <p className="whitespace-pre-line">{wordData.cultural_context}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-muted-foreground text-sm">
          <p>
            This page is part of the {dictionary.meta.name} dictionary, contributing to the documentation and 
            preservation of Aboriginal languages.
          </p>
        </div>
      </div>
    </SharedLayout>
  );
}
