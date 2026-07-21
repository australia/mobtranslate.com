'use client';

import React, { Suspense, lazy } from 'react';
import Link from 'next/link';
import { WordLikeButton } from '@/components/WordLikeButton';
import { Badge } from '@mobtranslate/ui';
import { MapPin, MessageSquareQuote, Info, Tag, Volume2, GitBranch, Shuffle, Link2, BookMarked, Quote } from 'lucide-react';
import type { Word } from '@/lib/supabase/types';
import { Recordings } from './Recordings';
import { SpeakButton } from '@/components/audio/SpeakButton';
import { WordCorrectionAction } from '@/components/improvements/WordCorrectionAction';

const LocationMap = lazy(() => import('./LocationMap').then(m => ({ default: m.LocationMap })));

interface WordDetailContentProps {
  word: Word;
  languageCode: string;
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lang-accent)] mb-3">
    {children}
  </h3>
);

// "fauna-bird" -> "Fauna · bird"
function humanizeDomain(d: string): string {
  return d
    .split('-')
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' · ');
}

export function WordDetailContent({ word, languageCode }: WordDetailContentProps) {
  const definitions = word.definitions?.map(d => d.definition) || [];
  const translations = word.definitions?.flatMap(d =>
    d.translations?.map(t => t.translation) || []
  ) || [];
  const wordHref = (text: string) => `/dictionaries/${languageCode}/words/${encodeURIComponent(text)}`;
  const ipa = word.phonemic || (word.phonetic_transcription ? `/${word.phonetic_transcription}/` : null);

  return (
    <div className="space-y-10">
      {/* Pronunciation + gloss + save action */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          {ipa && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Volume2 className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
              <span className="font-mono text-lg">{ipa}</span>
            </div>
          )}
          {word.gloss && (
            <p className="text-xl text-foreground/90">
              <span className="text-muted-foreground">gloss </span>
              <span className="font-medium">“{word.gloss}”</span>
            </p>
          )}
          {(word.semantic_domain || word.verb_class || word.dialect) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {word.semantic_domain && (
                <Badge variant="secondary" className="gap-1">
                  <Tag className="w-3 h-3" /> {humanizeDomain(word.semantic_domain)}
                </Badge>
              )}
              {word.verb_class && <Badge variant="outline">{word.verb_class}</Badge>}
              {word.dialect && <Badge variant="outline">{word.dialect} dialect</Badge>}
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <WordLikeButton wordId={word.id} size="lg" showLabel />
          <WordCorrectionAction
            wordId={word.id}
            word={word.word}
            definition={definitions[0]}
            translation={translations[0]}
          />
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

      {/* Attributed source and community pronunciations */}
      <Recordings
        endpointBase={`/api/v2/words/${word.id}`}
        target={{ kind: 'word', label: word.word, gloss: word.gloss ?? null, wordId: word.id }}
      />

      {/* Usage examples — each is independently recordable */}
      {word.usage_examples && word.usage_examples.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquareQuote className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
            <SectionLabel>Examples</SectionLabel>
          </div>
          <div className="divide-y divide-border">
            {word.usage_examples.map((example, index) => (
              <div key={example.id || index} className="py-5 first:pt-0">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-lg leading-relaxed font-medium" lang={languageCode}>
                    {example.example_text}
                  </p>
                  <SpeakButton
                    text={example.example_text}
                    englishText={example.translation}
                    lang={languageCode}
                    size="sm"
                    label="Hear example"
                  />
                </div>
                {example.transliteration && (
                  <p className="text-sm text-muted-foreground/80 mt-1 font-mono">{example.transliteration}</p>
                )}
                {example.translation && (
                  <p className="text-base text-muted-foreground mt-1.5">{example.translation}</p>
                )}
                {(example.context || example.source) && (
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {[example.context, example.source].filter(Boolean).join(' · ')}
                  </p>
                )}
                {example.id && (
                  <Recordings
                    variant="compact"
                    endpointBase={`/api/v2/examples/${example.id}`}
                    target={{ kind: 'sentence', label: example.example_text, gloss: example.translation ?? null, exampleId: example.id }}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Word formation — derivation + reduplication */}
      {(word.derivation?.morpheme || word.reduplication?.base) && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
            <SectionLabel>Word formation</SectionLabel>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {word.derivation?.morpheme && (
              <div className="rounded-xl border border-border bg-card p-4">
                <dt className="text-sm font-semibold text-foreground">Derivation</dt>
                <dd className="mt-1 text-base text-muted-foreground">
                  <span className="font-mono text-foreground">{word.derivation.morpheme}</span>
                  {word.derivation.function && <span> — {word.derivation.function}</span>}
                </dd>
              </div>
            )}
            {word.reduplication?.base && (
              <div className="rounded-xl border border-border bg-card p-4">
                <dt className="text-sm font-semibold text-foreground">Reduplication</dt>
                <dd className="mt-1 text-base text-muted-foreground">
                  <span className="font-medium text-foreground" lang={languageCode}>{word.reduplication.base}</span>
                  {word.reduplication.pattern && <span> · {word.reduplication.pattern} reduplication</span>}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {/* Synonyms */}
      {word.synonyms && word.synonyms.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Shuffle className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
            <SectionLabel>Synonyms</SectionLabel>
          </div>
          <div className="flex flex-wrap gap-2">
            {word.synonyms.map((s, i) => (
              <Link
                key={i}
                href={wordHref(s.text)}
                className="px-3.5 py-1.5 rounded-full border border-border text-sm font-medium text-foreground transition-colors hover:border-[var(--lang-accent)] hover:text-[var(--lang-accent)]"
                lang={languageCode}
              >
                {s.text}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* See also */}
      {word.see_also && word.see_also.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
            <SectionLabel>See also</SectionLabel>
          </div>
          <div className="flex flex-wrap gap-2">
            {word.see_also.map((ref, i) => (
              <Link
                key={i}
                href={wordHref(ref)}
                className="px-3.5 py-1.5 rounded-full border border-border text-sm font-medium text-foreground transition-colors hover:border-[var(--lang-accent)] hover:text-[var(--lang-accent)]"
                lang={languageCode}
              >
                {ref}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Commentary — linguistic notes */}
      {word.commentary && word.commentary.length > 0 && (
        <section className="rounded-xl bg-muted/40 border border-border p-6">
          <div className="flex items-center gap-2 mb-3">
            <Quote className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
            <SectionLabel>Commentary</SectionLabel>
          </div>
          <ul className="space-y-2.5 list-disc pl-5 marker:text-muted-foreground">
            {word.commentary.map((c, i) => (
              <li key={i} className="text-base leading-relaxed text-foreground/90 max-w-[68ch]">{c}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Usage notes */}
      {word.usage_notes && word.usage_notes.length > 0 && (
        <section>
          <SectionLabel>Usage notes</SectionLabel>
          <ul className="space-y-2 list-disc pl-5 marker:text-muted-foreground">
            {word.usage_notes.map((n, i) => (
              <li key={i} className="text-base leading-relaxed text-muted-foreground max-w-[65ch]">{n}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Cultural context — attributed panel */}
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

      {/* Source attribution */}
      {(word.loanword_source || word.entry_source) && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground/80 pt-2">
          <BookMarked className="w-3.5 h-3.5" aria-hidden="true" />
          {word.loanword_source && <span>Loan from {word.loanword_source}.</span>}
          {word.entry_source && <span>Source: {word.entry_source}.</span>}
        </p>
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
