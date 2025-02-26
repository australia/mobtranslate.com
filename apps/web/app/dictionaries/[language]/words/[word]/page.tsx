'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SharedLayout from '../../../../components/SharedLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/card';
import { getDictionary, type Dictionary, type DictionaryWord } from '../../../../lib/dictionary';

export default function WordPage() {
  const params = useParams();
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [wordData, setWordData] = useState<DictionaryWord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Safely get language parameter
  const language = params?.language as string || '';
  
  useEffect(() => {
    const loadDictionary = async () => {
      setLoading(true);
      try {
        if (!params?.language || !params?.word) {
          setError('Missing language or word parameter');
          setLoading(false);
          return;
        }

        const language = params.language as string;
        const word = params.word as string;
        
        // Get dictionary data
        const dictionaryData = getDictionary(language);
        setDictionary(dictionaryData);
        
        // Find the requested word in the dictionary
        const wordData = dictionaryData?.words.find(w => 
          w.word.toLowerCase() === word.toLowerCase()
        );
        
        // Handle case where word might be undefined
        setWordData(wordData || null);
      } catch (err) {
        console.error('Error loading word data:', err);
        setError('Failed to load dictionary data.');
      }
      setLoading(false);
    };

    loadDictionary();
  }, [params]);

  // SEO metadata would be set here in a production app
  
  if (loading) {
    return (
      <SharedLayout>
        <div className="container max-w-4xl py-12">
          <div className="flex justify-center items-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        </div>
      </SharedLayout>
    );
  }

  if (!dictionary) {
    return (
      <SharedLayout>
        <div className="container max-w-4xl py-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl text-red-500">Error Loading Dictionary</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Sorry, we couldn't load the dictionary. Please try again later.</p>
              <div className="mt-4">
                <Link href="/dictionaries" className="text-blue-500 hover:underline">
                  ← Back to all dictionaries
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </SharedLayout>
    );
  }

  if (!wordData) {
    return (
      <SharedLayout>
        <div className="container max-w-4xl py-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl text-red-500">Word Not Found</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Sorry, we couldn't find that word in the {dictionary.name} dictionary.</p>
              <div className="mt-4">
                <Link href={`/dictionaries/${language}`} className="text-blue-500 hover:underline">
                  ← Back to {dictionary.name} dictionary
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </SharedLayout>
    );
  }

  return (
    <SharedLayout>
      <div className="container max-w-4xl py-12">
        <div className="mb-6">
          <Link href={`/dictionaries/${language}`} className="text-blue-500 hover:underline">
            ← Back to {dictionary.name} dictionary
          </Link>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold">{wordData.word}</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              <span className="italic">{wordData.type}</span> • {dictionary.name}
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-2">Definition</h3>
              {wordData.definition.split('\n').map((paragraph, index) => (
                <p key={index} className={index > 0 ? "mt-2" : ""}>
                  {paragraph}
                </p>
              ))}
            </div>
            
            {wordData.example && (
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2">Example</h3>
                <p className="italic">"{wordData.example}"</p>
              </div>
            )}
            
            {wordData.cultural_context && (
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2">Cultural Context</h3>
                <p>{wordData.cultural_context}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SharedLayout>
  );
}
