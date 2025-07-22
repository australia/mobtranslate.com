'use client';

import React from 'react';
import { cn } from '../lib/utils';
import { Card, CardContent } from './card';
import { Badge } from './Badge';

export interface DictionaryWord {
  word: string;
  type?: string;
  definition?: string;
  definitions?: string[];
  translations?: string[];
  synonyms?: string[];
  example?: string;
  cultural_context?: string;
}

export interface DictionaryEntryProps {
  word: DictionaryWord;
  detailed?: boolean;
  className?: string;
}

const DictionaryEntry: React.FC<DictionaryEntryProps> = ({ word, detailed = false, className }) => {
    const definitions = word.definitions || (word.definition ? [word.definition] : []);
    const translations = word.translations || [];

    if (detailed) {
      return (
        <Card className={cn('p-6', className)}>
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold font-crimson">{word.word}</h1>
                {word.type && (
                  <Badge variant="secondary" className="mt-2">
                    {word.type}
                  </Badge>
                )}
              </div>
              <button className="text-muted-foreground hover:text-primary transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            </div>

            {definitions.length > 0 && (
              <div>
                <h4 className="font-semibold font-crimson mb-2">Definition</h4>
                <div className="space-y-1">
                  {definitions.map((def, index) => (
                    <p key={index} className="font-source-sans">{def}</p>
                  ))}
                </div>
              </div>
            )}

            {translations.length > 0 && (
              <div>
                <h4 className="font-semibold font-crimson mb-2">Translations</h4>
                <div className="flex flex-wrap gap-2">
                  {translations.map((translation, index) => (
                    <Badge key={index} variant="outline">
                      {translation}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {word.example && (
              <div>
                <h4 className="font-semibold font-crimson mb-2">Example Usage</h4>
                <blockquote className="italic text-muted-foreground border-l-4 border-primary pl-4 font-source-sans">
                  {word.example}
                </blockquote>
              </div>
            )}

            {word.cultural_context && (
              <div>
                <h4 className="font-semibold font-crimson mb-2">Cultural Context</h4>
                <p className="text-muted-foreground font-source-sans">{word.cultural_context}</p>
              </div>
            )}
          </div>
        </Card>
      );
    }

    return (
      <Card className={cn('p-4', className)}>
        <CardContent className="p-0">
          <div className="space-y-2">
            <div className="flex items-start justify-between">
              <div className="font-medium text-lg font-crimson">{word.word}</div>
              {word.type && (
                <Badge variant="secondary" className="text-xs">
                  {word.type}
                </Badge>
              )}
            </div>
            
            {definitions.length > 0 && (
              <div className="text-sm font-source-sans">
                {definitions[0]}
              </div>
            )}
            
            {translations.length > 0 && (
              <div className="text-xs text-muted-foreground font-source-sans">
                {translations.join(', ')}
              </div>
            )}
            
            {word.example && (
              <div className="text-xs text-muted-foreground italic font-source-sans">
                "{word.example}"
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

export { DictionaryEntry };