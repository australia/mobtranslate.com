import React from 'react';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter, Button, Badge } from '@ui/components';
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
        title="Aboriginal Language Dictionaries"
        description="Browse our collection of Aboriginal language dictionaries, preserving and sharing traditional languages through digital preservation."
      />

      <Section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {languagesWithCounts.map((lang) => (
            <Card key={lang.code} hover className="overflow-hidden">
              <CardHeader>
                <CardTitle className="font-crimson">
                  <Link href={`/dictionaries/${lang.code}`} className="hover:text-primary transition-colors">
                    {lang.name}
                  </Link>
                </CardTitle>
                <div className="flex items-center gap-2">
                  {lang.region && (
                    <Badge variant="secondary">{lang.region}</Badge>
                  )}
                  <Badge variant="outline">{lang.wordCount} words</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground font-source-sans leading-relaxed">
                  {lang.description || `Explore the ${lang.name} language dictionary`}
                </p>
                {lang.status && (
                  <Badge 
                    variant={
                      lang.status === 'severely endangered' ? 'destructive' : 
                      lang.status === 'endangered' ? 'destructive' :
                      lang.status === 'vulnerable' ? 'secondary' : 
                      'default'
                    }
                    className="mt-3"
                  >
                    {lang.status}
                  </Badge>
                )}
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

export async function generateMetadata() {
  return {
    title: 'Aboriginal Language Dictionaries - MobTranslate',
    description: 'Browse our collection of Aboriginal language dictionaries, preserving and sharing traditional languages through digital preservation.',
    openGraph: {
      title: 'Aboriginal Language Dictionaries',
      description: 'Explore dictionaries for Aboriginal languages including Kuku Yalanji, Mi\'gmaq, and Anindilyakwa.',
      type: 'website',
    },
  };
}