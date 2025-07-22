'use client';

import React from 'react';
import { cn } from '../lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './Table';
import { Badge } from './Badge';
import { Card } from './card';

export interface DictionaryWord {
  id?: string;
  word: string;
  type?: string;
  definition?: string;
  definitions?: string[];
  translations?: string[];
  example?: string;
}

export interface DictionaryTableProps {
  words: DictionaryWord[];
  onWordClick?: (word: string) => void;
  className?: string;
  showLikeButtons?: boolean;
}

const DictionaryTable: React.FC<DictionaryTableProps> = ({ words, onWordClick, className, showLikeButtons = true }) => {
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {words.map((word, index) => (
              <TableRow key={index}>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  };

export { DictionaryTable };