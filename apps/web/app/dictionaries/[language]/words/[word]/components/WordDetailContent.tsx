'use client';

import React, { Suspense, lazy } from 'react';
import { Card, CardContent } from '@mobtranslate/ui';
import { WordLikeButton } from '@/components/WordLikeButton';
import { Badge } from '@mobtranslate/ui';
import { MapPin, BookOpen, MessageSquareQuote, Info, Tag, Volume2 } from 'lucide-react';
import type { Word } from '@/lib/supabase/types';

const LocationMap = lazy(() => import('./LocationMap').then(m => ({ default: m.LocationMap })));

interface WordDetailContentProps {
  word: Word;
}

export function WordDetailContent({ word }: WordDetailContentProps) {
  const definitions = word.definitions?.map(d => d.definition) || [];
  const translations = word.definitions?.flatMap(d =>
    d.translations?.map(t => t.translation) || []
  ) || [];

  return (
    <div className="space-y-6">
      {/* Main Definition Card */}
      <Card>
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Phonetic */}
              {word.phonetic_transcription && (
                <div className="flex items-center gap-2 mb-3">
                  <Volume2 className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono text-muted-foreground">/{word.phonetic_transcription}/</span>
                </div>
              )}

              {/* Definitions */}
              {definitions.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
                      Definition{definitions.length > 1 ? 's' : ''}
                    </h3>
                  </div>
                  <ol className={definitions.length > 1 ? 'list-decimal list-inside space-y-2' : 'space-y-2'}>
                    {definitions.map((def, i) => (
                      <li key={i} className="text-base leading-relaxed">
                        {def}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Translations */}
              {translations.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Translations
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {translations.map((t, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-lg bg-primary/5 text-sm font-medium">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Cultural Context */}
              {word.cultural_contexts?.[0]?.context_description && (
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
                        Cultural Context
                      </h4>
                      <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                        {word.cultural_contexts[0].context_description}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Like button */}
            <div className="shrink-0">
              <WordLikeButton wordId={word.id} size="lg" showLabel />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Examples */}
      {word.usage_examples && word.usage_examples.length > 0 && (
        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquareQuote className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
                Usage Examples
              </h3>
            </div>
            <div className="space-y-4">
              {word.usage_examples.map((example, index) => (
                <blockquote key={index} className="border-l-2 border-primary/30 pl-4 py-1">
                  <p className="italic text-base">&ldquo;{example.example_text}&rdquo;</p>
                  {example.translation && (
                    <p className="text-sm text-muted-foreground mt-1.5">
                      {example.translation}
                    </p>
                  )}
                </blockquote>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {word.notes && (
        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Notes
              </h3>
            </div>
            <p className="text-sm leading-relaxed">{word.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Location map */}
      {word.is_location && word.latitude && word.longitude && (
        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
                Location
              </h3>
            </div>
            <Suspense fallback={
              <div className="w-full h-[300px] rounded-lg bg-muted animate-pulse flex items-center justify-center">
                <span className="text-sm text-muted-foreground">Loading map...</span>
              </div>
            }>
              <LocationMap
                latitude={word.latitude}
                longitude={word.longitude}
                word={word.word}
                locationDescription={
                  word.definitions?.find(d =>
                    d.definition.toLowerCase().includes('place name') ||
                    d.definition.toLowerCase().includes('creek') ||
                    d.definition.toLowerCase().includes('river') ||
                    d.definition.toLowerCase().includes('mountain') ||
                    d.definition.toLowerCase().includes('beach') ||
                    d.definition.toLowerCase().includes('bay') ||
                    d.definition.toLowerCase().includes('island') ||
                    d.definition.toLowerCase().includes('hill') ||
                    d.definition.toLowerCase().includes('falls') ||
                    d.definition.toLowerCase().includes('camp') ||
                    d.definition.toLowerCase().includes('flat')
                  )?.definition
                }
              />
            </Suspense>
          </CardContent>
        </Card>
      )}

      {/* Metadata badges */}
      {(word.is_location || word.is_loan_word || word.register || word.domain || word.obsolete) && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="w-3.5 h-3.5 text-muted-foreground" />
          {word.is_location && (
            <Badge variant="secondary" className="gap-1">
              <MapPin className="w-3 h-3" />
              Place Name
            </Badge>
          )}
          {word.is_loan_word && (
            <Badge variant="outline">
              Loan word{word.loan_source_language && ` from ${word.loan_source_language}`}
            </Badge>
          )}
          {word.register && (
            <Badge variant="secondary">{word.register}</Badge>
          )}
          {word.domain && (
            <Badge variant="secondary">{word.domain}</Badge>
          )}
          {word.obsolete && (
            <Badge variant="destructive">Obsolete</Badge>
          )}
        </div>
      )}
    </div>
  );
}
