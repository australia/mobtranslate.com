'use client';

import React from 'react';
import { Card, CardContent, Badge, DictionaryEntry } from '@/app/components/ui/table';
import { WordLikeButton } from '@/components/WordLikeButton';
import type { Word } from '@/lib/supabase/types';

interface WordDetailContentProps {
  word: Word;
}

export function WordDetailContent({ word }: WordDetailContentProps) {
  // Transform word data for DictionaryEntry component
  const dictionaryWord = {
    word: word.word,
    type: word.word_type || word.word_class?.name,
    definition: word.definitions?.[0]?.definition,
    definitions: word.definitions?.map(d => d.definition) || [],
    translations: word.definitions?.flatMap(d => 
      d.translations?.map(t => t.translation) || []
    ) || [],
    synonyms: [],
    example: word.usage_examples?.[0]?.example_text,
    cultural_context: word.cultural_contexts?.[0]?.context_description
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <DictionaryEntry word={dictionaryWord} />
          </div>
          <div className="ml-4">
            <WordLikeButton wordId={word.id} size="lg" showLabel />
          </div>
        </div>
        
        {/* Additional word information */}
        <div className="mt-6 space-y-4">
          {word.phonetic_transcription && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Phonetic</h4>
              <p className="font-mono">{word.phonetic_transcription}</p>
            </div>
          )}
          
          {word.notes && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Notes</h4>
              <p className="text-sm">{word.notes}</p>
            </div>
          )}
          
          {word.usage_examples && word.usage_examples.length > 1 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">More Examples</h4>
              <ul className="space-y-2">
                {word.usage_examples.slice(1).map((example, index) => (
                  <li key={index} className="text-sm italic">
                    "{example.example_text}"
                    {example.translation && (
                      <span className="block text-xs text-muted-foreground mt-1">
                        Translation: {example.translation}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Metadata badges */}
          <div className="flex flex-wrap gap-2 pt-4 border-t">
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
        </div>
      </CardContent>
    </Card>
  );
}