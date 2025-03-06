import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@ui/components/card';
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
              <Card key={lang.code} className="overflow-hidden">
                <CardHeader>
                  <CardTitle>
                    <Link href={`/dictionaries/${lang.code}`} className="hover:underline">
                      {lang.meta.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>{lang.meta.region}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{lang.meta.description}</p>
                </CardContent>
                <CardFooter className="bg-muted/50 border-t">
                  <div className="flex justify-between w-full text-sm">
                    <Link href={`/dictionaries/${lang.code}`} className="text-primary hover:underline">
                      View Dictionary
                    </Link>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </SharedLayout>
  );
}
