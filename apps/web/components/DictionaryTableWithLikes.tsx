'use client';

import React from 'react';
import { cn } from '../lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@ui/components/Table';
import { Badge } from '@ui/components/Badge';
import { Card } from '@ui/components/card';
import { WordLikeButton } from './WordLikeButton';

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
  onWordClick?: (word: string) => void;
  className?: string;
  showLikeButtons?: boolean;
}

const DictionaryTableWithLikes: React.FC<DictionaryTableWithLikesProps> = ({ 
  words, 
  onWordClick, 
  className, 
  showLikeButtons = true 
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
            <TableHead className="font-crimson">Word</TableHead>
            <TableHead className="font-crimson">Type</TableHead>
            <TableHead className="font-crimson">Definition</TableHead>
            <TableHead className="font-crimson">Example</TableHead>
            {showLikeButtons && <TableHead className="font-crimson w-16">Like</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {words.map((word, index) => (
            <TableRow key={word.id || index}>
              <TableCell>
                {onWordClick ? (
                  <button
                    onClick={() => onWordClick(word.word)}
                    className="font-medium font-crimson text-primary hover:underline text-left"
                  >
                    {word.word}
                  </button>
                ) : (
                  <span className="font-medium font-crimson">{word.word}</span>
                )}
              </TableCell>
              <TableCell>
                {word.type && (
                  <Badge variant="secondary" className="text-xs">
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