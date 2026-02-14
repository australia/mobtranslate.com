import React from 'react';
import { Globe, Volume2 } from 'lucide-react';
import { Button } from '@mobtranslate/ui';

interface TranslationResultProps {
  word: string;
  translations: Array<{
    language: string;
    translation: string;
    languageCode: string;
  }>;
}

export function TranslationResult({ word, translations }: TranslationResultProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 my-2">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Translations for "{word}"</h3>
      </div>
      <div className="grid gap-2">
        {translations.map((translation, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
          >
            <div>
              <span className="font-medium">{translation.language}</span>
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="text-lg">{translation.translation}</span>
            </div>
            <Button variant="ghost" className="p-2 hover:bg-muted rounded-lg">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}