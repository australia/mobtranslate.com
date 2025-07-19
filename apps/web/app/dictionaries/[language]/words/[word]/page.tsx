import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import SharedLayout from '../../../../components/SharedLayout';
import { type DictionaryWord } from '@dictionaries';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Badge, Breadcrumbs, Button, DictionaryEntry } from '@ui/components';

async function getWordData(language: string, word: string) {
  try {
    const headersList = headers();
    const host = headersList.get('host') || 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    
    const response = await fetch(
      `${protocol}://${host}/api/dictionaries/${language}/words/${encodeURIComponent(word)}`,
      { 
        cache: 'no-store',
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error('Failed to fetch word data');
    }
    
    return response.json();
  } catch (error) {
    console.error('Error fetching word data:', error);
    return null;
  }
}

export default async function WordDetailPage({
  params,
}: {
  params: { language: string; word: string };
}) {
  const { language, word } = params;
  
  const wordResponse = await getWordData(language, decodeURIComponent(word));
  
  if (!wordResponse || !wordResponse.success) {
    notFound();
  }
  
  const { data: wordData, meta, relatedWords } = wordResponse;
  
  const breadcrumbItems = [
    { href: '/', label: 'Home' },
    { href: '/dictionaries', label: 'Dictionaries' },
    { href: `/dictionaries/${language}`, label: meta.name },
    { href: `/dictionaries/${language}/words/${encodeURIComponent(word)}`, label: wordData.word }
  ];

  return (
    <SharedLayout>
      <PageHeader 
        title={wordData.word}
        description={`${wordData.type ? `${wordData.type} - ` : ''}${meta.name} Dictionary`}
      >
        {wordData.type && (
          <Badge variant="secondary" className="mt-4">
            {wordData.type}
          </Badge>
        )}
      </PageHeader>

      <Section contained={false}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <Breadcrumbs items={breadcrumbItems} />
          
          <DictionaryEntry word={wordData} detailed />
          
          {/* Related words */}
          {relatedWords && relatedWords.length > 0 && (
            <Section title="Related Words">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {relatedWords.map((related: DictionaryWord) => (
                  <Link 
                    key={related.word}
                    href={`/dictionaries/${language}/words/${encodeURIComponent(related.word)}`}
                    className="block"
                  >
                    <Card hover className="h-full">
                      <CardContent className="p-4">
                        <h3 className="font-medium font-crimson text-lg mb-2 text-primary">
                          {related.word}
                        </h3>
                        <p className="text-sm text-muted-foreground font-source-sans">
                          {related.definition || 
                            (related.definitions && related.definitions[0]) || 
                            'No definition available'}
                        </p>
                        {related.type && (
                          <Badge variant="outline" className="mt-2 text-xs">
                            {related.type}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </Section>
          )}
          
          <div className="pt-6 border-t">
            <Button asChild variant="outline">
              <Link href={`/dictionaries/${language}`}>
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to {meta.name} Dictionary
              </Link>
            </Button>
          </div>
        </div>
      </Section>
    </SharedLayout>
  );
}
