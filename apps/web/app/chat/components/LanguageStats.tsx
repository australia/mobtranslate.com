import React from 'react';
import { TrendingUp, Trophy, Target } from 'lucide-react';
import Link from 'next/link';

interface LanguageStatsProps {
  stats: {
    totalWords: number;
    masteredWords: number;
    accuracy: number;
    languages: Array<{
      name: string;
      code: string;
      progress: number;
      mastered: number;
      total: number;
    }>;
  };
}

export function LanguageStats({ stats }: LanguageStatsProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 my-2">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-green-500" />
        <h3 className="font-semibold">Your Learning Progress</h3>
      </div>
      
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{stats.totalWords}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Total Words</div>
        </div>
        <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{stats.masteredWords}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Mastered</div>
        </div>
        <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{stats.accuracy}%</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Accuracy</div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">Language Progress</h4>
        {stats.languages.map((language, index) => (
          <Link
            key={index}
            href={`/stats/${language.code}`}
            className="block p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">{language.name}</span>
              <span className="text-sm text-gray-500">
                {language.mastered}/{language.total} words
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${language.progress}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}