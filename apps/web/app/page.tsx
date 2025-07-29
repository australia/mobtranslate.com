import Link from 'next/link';
import SharedLayout from './components/SharedLayout';
import TranslatorWrapper from './components/TranslatorWrapper';
import { PageHeader, Section, Card, CardContent, Container, Badge } from '@ui/components';
import { getActiveLanguages } from '@/lib/supabase/queries';

export const revalidate = 3600; // Revalidate every hour

export default async function Page() {
  const languages = await getActiveLanguages();

  return (
    <SharedLayout>
      <PageHeader 
        title="Mob Translate"
        description="A fully open source community-driven project to make 'Google Translate' for as many Indigenous languages as possible. Join us in preserving and promoting Indigenous languages through technology."
      />

      <Section contained={false}>
        <Container>
          <TranslatorWrapper languages={languages} />
        </Container>
      </Section>

      <Section 
        title="Available Dictionaries"
        description="Explore our growing collection of Indigenous language dictionaries"
        contained={false}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {languages.map((language) => (
            <Link 
              key={language.id} 
              href={`/dictionaries/${language.code}`} 
              className="block no-underline"
            >
              <Card hover className="h-full">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-xl font-crimson">{language.name}</h3>
                    {language.status && (
                      <Badge 
                        variant={
                          language.status === 'severely endangered' ? 'destructive' : 
                          language.status === 'endangered' ? 'destructive' :
                          language.status === 'vulnerable' ? 'secondary' : 
                          'default'
                        }
                        className="text-xs"
                      >
                        {language.status === 'severely endangered' ? 'very-low volume' : 
                         language.status === 'endangered' ? 'low volume' :
                         language.status === 'vulnerable' ? 'low volume' : 
                         language.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground font-source-sans mb-3">
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

      <Section variant="muted" contained={false}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl mb-4 font-crimson">Join the Movement</h2>
          <p className="text-muted-foreground mb-6 font-source-sans">
            Mob Translate is an open-source initiative dedicated to preserving and promoting 
            Indigenous languages worldwide. We believe that language is culture, and by making 
            these languages accessible to everyone, we're helping to keep them alive for future 
            generations.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/about">
              <Badge variant="secondary" className="cursor-pointer px-4 py-2">
                Learn More
              </Badge>
            </Link>
            <Link href="https://github.com/jameswsullivan/mobtranslate">
              <Badge variant="outline" className="cursor-pointer px-4 py-2">
                Contribute on GitHub
              </Badge>
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