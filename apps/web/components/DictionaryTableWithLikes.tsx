'use client';

import React from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge, Card, cn } from '@mobtranslate/ui';
import { WordLikeButton } from './WordLikeButton';
import { SpeakButton } from './audio/SpeakButton';

export interface DictionaryWord {
  id: string;
  word: string;
  type?: string;
  definition?: string;
  definitions?: string[];
  translations?: string[];
  example?: string;
}

export interface DictionaryTableWithLikesProps {
  words: DictionaryWord[];
  onWordClick?: (_word: string) => void;
  className?: string;
  showLikeButtons?: boolean;
  /** Language code so each row can play its pronunciation. */
  langCode?: string;
}

const DictionaryTableWithLikes: React.FC<DictionaryTableWithLikesProps> = ({
  words,
  onWordClick,
  className,
  showLikeButtons = true,
  langCode,
}) => {
  const getDefinitionText = (word: DictionaryWord) => {
    if (word.definitions && word.definitions.length > 0) {
      return word.definitions[0];
    }
    return word.definition || '';
  };

  const getTranslationsText = (word: DictionaryWord) => {
    if (word.translations && word.translations.length > 0) {
      return word.translations.join(', ');
    }
    return '';
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Word</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Definition</TableHead>
            <TableHead>Example</TableHead>
            {showLikeButtons && <TableHead className="w-16">Like</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {words.map((word, index) => (
            <TableRow key={word.id || index}>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {onWordClick ? (
                    <button
                      onClick={() => onWordClick(word.word)}
                      className="font-display text-base font-semibold text-foreground hover:text-[var(--lang-accent)] transition-colors text-left"
                      lang={langCode}
                    >
                      {word.word}
                    </button>
                  ) : (
                    <span className="font-display text-base font-semibold text-foreground" lang={langCode}>{word.word}</span>
                  )}
                  <SpeakButton
                    text={word.word}
                    englishText={getTranslationsText(word) || getDefinitionText(word)}
                    lang={langCode}
                    size="sm"
                  />
                </div>
              </TableCell>
              <TableCell>
                {word.type && (
                  <Badge variant="outline" className="text-xs">
                    {word.type}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-source-sans">
                {getDefinitionText(word)}
                {getTranslationsText(word) && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {getTranslationsText(word)}
                  </div>
                )}
              </TableCell>
              <TableCell className="font-source-sans text-sm italic">
                {word.example && `"${word.example}"`}
              </TableCell>
              {showLikeButtons && (
                <TableCell>
                  <WordLikeButton wordId={word.id} size="sm" />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};

export { DictionaryTableWithLikes };
