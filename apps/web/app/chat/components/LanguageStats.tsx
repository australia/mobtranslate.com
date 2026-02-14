import React from 'react';
import { TrendingUp } from 'lucide-react';
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
    <div className="bg-card rounded-xl border border-border p-4 my-2">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-success" />
        <h3 className="font-semibold">Your Learning Progress</h3>
      </div>
      
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-primary/10 rounded-lg">
          <div className="text-2xl font-bold text-primary">{stats.totalWords}</div>
          <div className="text-xs text-muted-foreground">Total Words</div>
        </div>
        <div className="text-center p-3 bg-success/10 rounded-lg">
          <div className="text-2xl font-bold text-success">{stats.masteredWords}</div>
          <div className="text-xs text-muted-foreground">Mastered</div>
        </div>
        <div className="text-center p-3 bg-muted rounded-lg">
          <div className="text-2xl font-bold text-foreground">{stats.accuracy}%</div>
          <div className="text-xs text-muted-foreground">Accuracy</div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Language Progress</h4>
        {stats.languages.map((language, index) => (
          <Link
            key={index}
            href={`/stats/${language.code}`}
            className="block p-3 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">{language.name}</span>
              <span className="text-sm text-muted-foreground">
                {language.mastered}/{language.total} words
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-gradient-to-r from-primary to-primary/70 h-2 rounded-full transition-all duration-500"
                style={{ width: `${language.progress}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}