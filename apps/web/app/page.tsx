import Link from 'next/link';
import SharedLayout from './components/SharedLayout';
import TranslatorWrapper from './components/TranslatorWrapper';
import { Section } from '@/components/layout/Section';
import { Card, CardContent, Badge } from '@mobtranslate/ui';
import { getActiveLanguages } from '@/lib/supabase/queries';

export const revalidate = 3600; // Revalidate every hour

export default async function Page() {
  const languages = await getActiveLanguages();

  return (
    <SharedLayout>
      {/* Hero */}
      <div className="py-8 md:py-12">
        <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-3">
          Mob Translate
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          A community-driven project to make &lsquo;Google Translate&rsquo; for Indigenous languages.
          Preserving and promoting Indigenous languages through open-source technology.
        </p>
      </div>

      {/* Translator */}
      <Section>
        <div className="max-w-4xl mx-auto">
          <TranslatorWrapper languages={languages} />
        </div>
      </Section>

      {/* Dictionary Cards */}
      <Section
        title="Available Dictionaries"
        description="Explore our growing collection of Indigenous language dictionaries"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {languages.map((language) => (
              <Link
                key={language.id}
                href={`/dictionaries/${language.code}`}
                className="block no-underline"
              >
                <Card className="h-full hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-xl font-display font-bold">{language.name}</h3>
                      {language.status && (
                        <Badge
                          variant={
                            language.status === 'severely endangered' ? 'destructive' :
                            language.status === 'endangered' ? 'destructive' :
                            language.status === 'vulnerable' ? 'secondary' :
                            'primary'
                          }
                          className="text-xs shrink-0 ml-2"
                        >
                          {language.status === 'severely endangered' ? 'very-low volume' :
                           language.status === 'endangered' ? 'low volume' :
                           language.status === 'vulnerable' ? 'low volume' :
                           language.status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-3">
                      {language.description || `Explore the language of the ${language.name} people`}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {language.region && (
                        <Badge variant="outline">{language.region}</Badge>
                      )}
                      {language.family && (
                        <Badge variant="outline">{language.family}</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </Section>

      {/* CTA */}
      <Section variant="muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-display font-bold tracking-tight mb-4">Join the Movement</h2>
            <p className="text-muted-foreground mb-8">
              Mob Translate is an open-source initiative dedicated to preserving and promoting
              Indigenous languages worldwide. We believe that language is culture, and by making
              these languages accessible to everyone, we&apos;re helping to keep them alive for future
              generations.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link href="/about" className="mt-btn mt-btn-primary mt-btn-md">
                Learn More
              </Link>
              <Link href="https://github.com/australia/mobtranslate.com" target="_blank" rel="noopener noreferrer" className="mt-btn mt-btn-outline mt-btn-md">
                Contribute on GitHub
              </Link>
            </div>
          </div>
        </div>
      </Section>
    </SharedLayout>
  );
}

export async function generateMetadata() {
  return {
    title: 'Mob Translate - Indigenous Language Translation',
    description: 'A community-driven project to create translation tools for Indigenous languages worldwide, making language preservation and learning accessible to all.',
    openGraph: {
      title: 'Mob Translate - Indigenous Language Translation',
      description: 'A community-driven project to create translation tools for Indigenous languages worldwide.',
      type: 'website',
    },
  };
}
