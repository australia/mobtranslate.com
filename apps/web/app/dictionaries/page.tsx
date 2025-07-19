import React from 'react';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import { getSupportedLanguages } from '@dictionaries';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter, Button, Badge } from '@ui/components';

export default async function DictionariesPage() {
  // Use getSupportedLanguages directly instead of fetching from API
  const languages = getSupportedLanguages();

  return (
    <SharedLayout>
      <PageHeader 
        title="Aboriginal Language Dictionaries"
        description="Browse our collection of Aboriginal language dictionaries, preserving and sharing traditional languages through digital preservation."
      />

      <Section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {languages.map((lang: any) => (
            <Card key={lang.code} hover className="overflow-hidden">
              <CardHeader>
                <CardTitle className="font-crimson">
                  <Link href={`/dictionaries/${lang.code}`} className="hover:text-primary transition-colors">
                    {lang.meta.name}
                  </Link>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{lang.meta.region}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground font-source-sans leading-relaxed">
                  {lang.meta.description}
                </p>
              </CardContent>
              <CardFooter className="bg-muted/30 border-t">
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/dictionaries/${lang.code}`}>
                    View Dictionary
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="About Our Dictionaries">
        <Card>
          <CardContent className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold font-crimson mb-4">Language Preservation</h3>
                <p className="text-muted-foreground font-source-sans leading-relaxed">
                  Each dictionary represents years of community work to document and preserve traditional knowledge. 
                  These digital resources ensure that future generations can access and learn from their linguistic heritage.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold font-crimson mb-4">Community Collaboration</h3>
                <p className="text-muted-foreground font-source-sans leading-relaxed">
                  Our dictionaries are created in collaboration with Aboriginal communities, linguists, and cultural keepers. 
                  We acknowledge the Traditional Owners of these languages and thank them for sharing their knowledge.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Section>
    </SharedLayout>
  );
}
