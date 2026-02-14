import React from 'react';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

interface WordSuggestionsProps {
  words: Array<{
    word: string;
    meaning: string;
    language: string;
    languageCode: string;
  }>;
}

export function WordSuggestions({ words }: WordSuggestionsProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 my-2">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-5 w-5 text-foreground" />
        <h3 className="font-semibold">Suggested Words to Learn</h3>
      </div>
      <div className="grid gap-2">
        {words.map((word, index) => (
          <Link
            key={index}
            href={`/learn/${word.languageCode}`}
            className="block p-3 rounded-lg bg-muted hover:bg-muted/80 transition-all"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-lg">{word.word}</div>
                <div className="text-sm text-muted-foreground">{word.meaning}</div>
              </div>
              <div className="text-xs bg-card px-2 py-1 rounded-full">
                {word.language}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}