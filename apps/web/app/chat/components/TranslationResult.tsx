import React from 'react';
import { Globe, Volume2 } from 'lucide-react';

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
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 my-2">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="h-5 w-5 text-indigo-500" />
        <h3 className="font-semibold">Translations for "{word}"</h3>
      </div>
      <div className="grid gap-2">
        {translations.map((translation, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div>
              <span className="font-medium">{translation.language}</span>
              <span className="mx-2 text-gray-400">→</span>
              <span className="text-lg">{translation.translation}</span>
            </div>
            <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
              <Volume2 className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}