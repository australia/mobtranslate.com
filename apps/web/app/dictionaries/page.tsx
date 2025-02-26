'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@ui/components/card';
import SharedLayout from '../components/SharedLayout';
import { getSupportedLanguages, type LanguageCode, type DictionaryMeta } from '@dictionaries';

interface DictionaryDisplay {
  code: LanguageCode;
  meta: DictionaryMeta;
  wordCount?: number;
}

export default function DictionariesPage() {
  const [dictionaries, setDictionaries] = useState<Record<string, DictionaryDisplay>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get our supported languages from the dictionary service
    const languages = getSupportedLanguages();
    const dictionaryData: Record<string, DictionaryDisplay> = {};
    
    languages.forEach(lang => {
      dictionaryData[lang.code] = {
        code: lang.code,
        meta: lang.meta,
        // In a real app, we'd get the actual word count
        wordCount: Math.floor(Math.random() * 500) + 100 // Just a placeholder
      };
    });
    
    setDictionaries(dictionaryData);
    setLoading(false);
  }, []);

  return (
    <SharedLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Aboriginal Language Dictionaries</h1>
            <p className="text-muted-foreground mt-2">
              Browse our collection of Aboriginal language dictionaries, preserving and sharing traditional languages.
            </p>
          </div>

          {loading ? (
            <p>Loading dictionaries...</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(dictionaries).map(([code, dictionary]) => (
                <Card key={code} className="overflow-hidden">
                  <CardHeader>
                    <CardTitle>{dictionary.meta.name}</CardTitle>
                    <CardDescription>
                      {dictionary.wordCount} words
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-3">{dictionary.meta.description}</p>
                  </CardContent>
                  <CardFooter className="bg-muted/50 border-t pt-6">
                    <Link
                      href={`/dictionaries/${code}`}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
                    >
                      Browse Dictionary
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}
