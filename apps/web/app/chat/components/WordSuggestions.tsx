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
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 my-2">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-5 w-5 text-purple-500" />
        <h3 className="font-semibold">Suggested Words to Learn</h3>
      </div>
      <div className="grid gap-2">
        {words.map((word, index) => (
          <Link
            key={index}
            href={`/learn/${word.languageCode}`}
            className="block p-3 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 hover:from-purple-100 hover:to-indigo-100 dark:hover:from-purple-950/30 dark:hover:to-indigo-950/30 transition-all"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-lg">{word.word}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{word.meaning}</div>
              </div>
              <div className="text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded-full">
                {word.language}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}