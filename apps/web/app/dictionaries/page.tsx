import React from 'react';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import { getSupportedLanguages } from '@dictionaries';

export default async function DictionariesPage() {
  // Use getSupportedLanguages directly instead of fetching from API
  const languages = getSupportedLanguages();

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

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {languages.map((lang: any) => (
              <Link 
                key={lang.code}
                href={`/dictionaries/${lang.code}`} 
                className="block p-6 border border-border hover:border-primary transition-colors duration-200"
              >
                <h2 className="text-xl font-medium text-foreground mb-1 hover:underline">
                  {lang.meta.name}
                </h2>
                <p className="text-sm text-muted-foreground mb-3">{lang.meta.region}</p>
                <p className="text-sm text-foreground/80">
                  {lang.meta.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </SharedLayout>
  );
}
