import Link from 'next/link';
import SharedLayout from './components/SharedLayout';
import TranslatorWrapper from './components/TranslatorWrapper';
import { PageHeader } from '@/app/components/ui/page-header';
import { Section } from '@/app/components/ui/section';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';

// TODO: Container component needs to be created or imported from the correct location
const Container = ({ children }: { children: React.ReactNode }) => (
  <div className="container">{children}</div>
);
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