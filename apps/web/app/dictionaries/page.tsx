import React from 'react';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter, Button, Badge } from '@/app/components/ui/table';
import { getActiveLanguages } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

export const revalidate = 3600; // Revalidate every hour

export default async function DictionariesPage() {
  // Get languages from Supabase
  const languages = await getActiveLanguages();
  
  // Get word counts for each language
  const supabase = createClient();
  const wordCounts = await Promise.all(
    languages.map(async (lang) => {
      const { count } = await supabase
        .from('words')
        .select('*', { count: 'exact', head: true })
        .eq('language_id', lang.id);
      return { languageId: lang.id, count: count || 0 };
    })
  );

  const languagesWithCounts = languages.map(lang => ({
    ...lang,
    wordCount: wordCounts.find(wc => wc.languageId === lang.id)?.count || 0
  }));

  return (
    <SharedLayout>
      <PageHeader 
        title="Indigenous Language Dictionaries"
        description="Browse our collection of Indigenous language dictionaries from around the world, preserving and sharing traditional languages through digital preservation."
      />

      <Section contained={false}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {languagesWithCounts.map((lang) => (
            <Card key={lang.code} hover className="overflow-hidden flex flex-col h-full">
              <CardHeader className="space-y-3">
                <div>
                  <CardTitle className="font-crimson text-2xl mb-2">
                    <Link href={`/dictionaries/${lang.code}`} className="hover:text-primary transition-colors">
                      {lang.name}
                    </Link>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    {lang.region && (
                      <Badge variant="secondary" className="text-xs">{lang.region}</Badge>
                    )}
                    <Badge variant="outline" className="text-xs">{lang.wordCount.toLocaleString()} words</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <p className="text-muted-foreground font-source-sans leading-relaxed flex-1">
                  {lang.description || `Explore the ${lang.name} language dictionary`}
                </p>
                {lang.status && (
                  <div className="mt-4">
                    <Badge 
                      variant={
                        lang.status === 'severely endangered' ? 'destructive' : 
                        lang.status === 'endangered' ? 'destructive' :
                        lang.status === 'vulnerable' ? 'secondary' : 
                        'default'
                      }
                      className="text-xs"
                    >
                      {lang.status === 'severely endangered' ? 'very-low volume' : 
                       lang.status === 'endangered' ? 'low volume' :
                       lang.status === 'vulnerable' ? 'low volume' : 
                       lang.status}
                    </Badge>
                  </div>
                )}
              </CardContent>
              <CardFooter className="bg-muted/50 border-t pt-4">
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/dictionaries/${lang.code}`}>
                    View Dictionary
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
          </div>
        </div>
      </Section>

      <Section title="About Our Dictionaries" contained={false}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
                  Our dictionaries are created in collaboration with Indigenous communities, linguists, and cultural keepers. 
                  We acknowledge the Traditional Owners of these languages and thank them for sharing their knowledge.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </Section>
    </SharedLayout>
  );
}

export async function generateMetadata() {
  return {
    title: 'Indigenous Language Dictionaries - MobTranslate',
    description: 'Browse our collection of Indigenous language dictionaries from around the world, preserving and sharing traditional languages through digital preservation.',
    openGraph: {
      title: 'Indigenous Language Dictionaries',
      description: 'Explore dictionaries for Indigenous languages including Kuku Yalanji, Mi\'gmaq, and Anindilyakwa.',
      type: 'website',
    },
  };
}