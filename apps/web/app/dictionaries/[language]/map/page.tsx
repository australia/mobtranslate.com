import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import SharedLayout from '../../../components/SharedLayout';
import { Badge } from '@/app/components/ui/badge';
import { getLocationWordsForLanguage } from '@/lib/supabase/queries';
import { AllLocationsMap } from './AllLocationsMap';

export const revalidate = 60;

// Full-bleed wrapper that breaks out of the parent max-width container
function FullBleed({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        width: '100vw',
        position: 'relative',
        left: '50%',
        right: '50%',
        marginLeft: '-50vw',
        marginRight: '-50vw',
      }}
    >
      {children}
    </div>
  );
}

export default async function MapPage({
  params,
}: {
  params: { language: string };
}) {
  const { language } = params;

  try {
    const { words, language: languageData } = await getLocationWordsForLanguage(language);

    return (
      <SharedLayout>
        <div style={{ margin: '-1.5rem -1rem', marginBottom: 0 }} className="sm:!-mx-6 lg:!-mx-8 xl:!-mx-12 2xl:!-mx-16 sm:!-mt-8 lg:!-mt-12">
          {/* Compact header bar above the map */}
          <FullBleed>
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <nav className="flex items-center gap-1.5 text-sm">
                    <Link href="/dictionaries" className="text-muted-foreground hover:text-foreground transition-colors">
                      Dictionaries
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <Link href={`/dictionaries/${language}`} className="text-muted-foreground hover:text-foreground transition-colors">
                      {languageData.name}
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-foreground font-medium">Place Names</span>
                  </nav>
                  <div className="flex items-center gap-2">
                    {languageData.region && (
                      <Badge variant="secondary" className="text-xs">{languageData.region}</Badge>
                    )}
                    <Badge variant="outline" className="text-xs">{words.length} locations</Badge>
                  </div>
                </div>
              </div>
            </div>
          </FullBleed>

          {/* Full-width map area */}
          <FullBleed>
            {words.length > 0 ? (
              <AllLocationsMap
                words={words}
                languageCode={language}
                languageName={languageData.name}
              />
            ) : (
              <div className="w-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)', background: '#73acc3' }}>
                <div className="text-center bg-white/90 rounded-xl p-8 shadow-lg">
                  <p className="text-muted-foreground text-lg">No location data available yet</p>
                  <Link
                    href={`/dictionaries/${language}`}
                    className="text-sm text-primary hover:underline mt-3 inline-block"
                  >
                    Back to dictionary
                  </Link>
                </div>
              </div>
            )}
          </FullBleed>
        </div>
      </SharedLayout>
    );
  } catch (error) {
    console.error('Error loading map:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      notFound();
    }

    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { language: string };
}) {
  try {
    const { words, language: languageData } = await getLocationWordsForLanguage(params.language);

    return {
      title: `${languageData.name} Place Names Map - MobTranslate`,
      description: `Explore ${words.length} traditional place names in ${languageData.name} country on an interactive map.`,
      openGraph: {
        title: `${languageData.name} Place Names Map`,
        description: `Interactive map of ${words.length} traditional ${languageData.name} place names.`,
        type: 'website',
      },
    };
  } catch {
    return {
      title: 'Place Names Map - MobTranslate',
      description: 'Explore traditional place names on an interactive map.',
    };
  }
}
