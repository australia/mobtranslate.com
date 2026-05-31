'use client';

import React, { Suspense, lazy } from 'react';
import { WordLikeButton } from '@/components/WordLikeButton';
import { Badge } from '@mobtranslate/ui';
import { MapPin, MessageSquareQuote, Info, Tag, Volume2 } from 'lucide-react';
import type { Word } from '@/lib/supabase/types';

const LocationMap = lazy(() => import('./LocationMap').then(m => ({ default: m.LocationMap })));

interface WordDetailContentProps {
  word: Word;
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lang-accent)] mb-3">
    {children}
  </h3>
);

export function WordDetailContent({ word }: WordDetailContentProps) {
  const definitions = word.definitions?.map(d => d.definition) || [];
  const translations = word.definitions?.flatMap(d =>
    d.translations?.map(t => t.translation) || []
  ) || [];

  return (
    <div className="space-y-10">
      {/* Pronunciation + save action */}
      <div className="flex items-start justify-between gap-4">
        {word.phonetic_transcription ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Volume2 className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
            <span className="font-mono text-lg">/{word.phonetic_transcription}/</span>
          </div>
        ) : <span />}
        <div className="shrink-0">
          <WordLikeButton wordId={word.id} size="lg" showLabel />
        </div>
      </div>

      {/* Definitions */}
      {definitions.length > 0 && (
        <section>
          <SectionLabel>Definition{definitions.length > 1 ? 's' : ''}</SectionLabel>
          <ol className={definitions.length > 1 ? 'list-decimal pl-5 space-y-3 marker:text-muted-foreground' : 'space-y-3'}>
            {definitions.map((def, i) => (
              <li key={i} className="text-lg md:text-xl leading-relaxed max-w-[65ch]">
                {def}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Translations */}
      {translations.length > 0 && (
        <section>
          <SectionLabel>Translations</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {translations.map((t, i) => (
              <span
                key={i}
                className="px-3.5 py-1.5 rounded-full bg-[var(--lang-accent-soft)] text-sm font-medium text-foreground/90"
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Usage examples */}
      {word.usage_examples && word.usage_examples.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquareQuote className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
            <SectionLabel>Examples</SectionLabel>
          </div>
          <div className="divide-y divide-border">
            {word.usage_examples.map((example, index) => (
              <div key={index} className="py-4 first:pt-0">
                <p className="text-lg leading-relaxed" lang={word.language_id ? undefined : undefined}>
                  {example.example_text}
                </p>
                {example.translation && (
                  <p className="text-sm text-muted-foreground mt-1.5">{example.translation}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cultural context — attributed panel, full border, no side-stripe */}
      {word.cultural_contexts?.[0]?.context_description && (
        <section className="rounded-xl bg-[var(--lang-accent-soft)] border border-border p-6">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
            <SectionLabel>Cultural note</SectionLabel>
          </div>
          <p className="text-base leading-relaxed text-foreground/90 max-w-[65ch]">
            {word.cultural_contexts[0].context_description}
          </p>
        </section>
      )}

      {/* Notes */}
      {word.notes && (
        <section>
          <SectionLabel>Notes</SectionLabel>
          <p className="text-base leading-relaxed text-muted-foreground max-w-[65ch]">{word.notes}</p>
        </section>
      )}

      {/* Location map */}
      {word.is_location && word.latitude && word.longitude && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
            <SectionLabel>Location</SectionLabel>
          </div>
          <Suspense fallback={
            <div className="w-full h-[300px] rounded-xl bg-muted animate-pulse flex items-center justify-center">
              <span className="text-sm text-muted-foreground">Loading map…</span>
            </div>
          }>
            <LocationMap
              latitude={word.latitude}
              longitude={word.longitude}
              word={word.word}
              locationDescription={
                word.definitions?.find(d =>
                  ['place name', 'creek', 'river', 'mountain', 'beach', 'bay', 'island', 'hill', 'falls', 'camp', 'flat']
                    .some(k => d.definition.toLowerCase().includes(k))
                )?.definition
              }
            />
          </Suspense>
        </section>
      )}

      {/* Metadata badges */}
      {(word.is_location || word.is_loan_word || word.register || word.domain || word.obsolete) && (
        <div className="flex items-center gap-2 flex-wrap pt-2">
          <Tag className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          {word.is_location && (
            <Badge variant="secondary" className="gap-1">
              <MapPin className="w-3 h-3" /> Place name
            </Badge>
          )}
          {word.is_loan_word && (
            <Badge variant="outline">
              Loan word{word.loan_source_language && ` from ${word.loan_source_language}`}
            </Badge>
          )}
          {word.register && <Badge variant="secondary">{word.register}</Badge>}
          {word.domain && <Badge variant="secondary">{word.domain}</Badge>}
          {word.obsolete && <Badge variant="destructive">Obsolete</Badge>}
        </div>
      )}
    </div>
  );
}
