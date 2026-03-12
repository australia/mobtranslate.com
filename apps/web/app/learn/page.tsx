'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@mobtranslate/ui';
import { LoadingState } from '@/components/layout/LoadingState';
import { Brain, Play, BookOpen, Sparkles, ChevronRight, Trophy, Flame, GraduationCap } from 'lucide-react';
import Link from 'next/link';

interface Language {
  code: string;
  name: string;
  wordCount?: number;
}

export default function LearnPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [isLoadingLanguages, setIsLoadingLanguages] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push('/auth/signin?redirect=/learn');
      return;
    }

    fetchLanguages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const fetchLanguages = async () => {
    setIsLoadingLanguages(true);
    try {
      const response = await fetch('/api/v2/languages/available');
      const data = await response.json();

      if (data.languages) {
        setLanguages(data.languages);
      }
    } catch (error) {
      console.error('Error fetching languages:', error);
    } finally {
      setIsLoadingLanguages(false);
    }
  };

  if (loading) {
    return (
      <SharedLayout>
        <div className="py-12">
          <LoadingState />
        </div>
      </SharedLayout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SharedLayout>
      {/* Hero Header */}
      <div className="relative py-10 md:py-16 overflow-hidden">
        {/* Subtle decorative background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute bottom-0 right-10 w-48 h-48 rounded-full bg-primary/3 blur-3xl" />
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            Spaced Repetition
          </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight">
          Start Learning
        </h1>
        <p className="text-lg text-muted-foreground mt-3 max-w-lg">
          Choose a language below and build your vocabulary with spaced repetition quizzes. The more you practice, the better you remember.
        </p>
      </div>

      <div className="pb-16">
        {isLoadingLanguages ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-6 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-muted" />
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-32 bg-muted rounded" />
                    <div className="h-3 w-20 bg-muted rounded" />
                  </div>
                </div>
                <div className="h-10 bg-muted rounded-lg mt-4" />
              </div>
            ))}
          </div>
        ) : languages.length === 0 ? (
          <Card className="max-w-md mx-auto border-dashed">
            <CardContent className="p-10 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-6">
                <BookOpen className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-display font-bold mb-2">No Languages Available</h3>
              <p className="text-muted-foreground">
                There are no language dictionaries available for learning yet. Check back soon!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {languages.map((language, index) => (
              <Link key={language.code} href={`/learn/${language.code}`} className="group block">
                <div className="relative h-full rounded-2xl border-2 border-border bg-card p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-primary/40 group-active:scale-[0.98]">
                  {/* Hover glow */}
                  <div className="absolute inset-0 rounded-2xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div className="relative">
                    {/* Language icon and name */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors flex-shrink-0">
                        <GraduationCap className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-display font-bold truncate">{language.name}</h3>
                        {language.wordCount !== undefined && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {language.wordCount.toLocaleString()} words
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Start button */}
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/60">
                      <span className="text-sm font-semibold text-primary group-hover:text-primary/80 transition-colors">
                        Start Learning
                      </span>
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all duration-300">
                        <Play className="h-4 w-4 text-primary group-hover:text-white ml-0.5 transition-colors" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Bottom actions */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/stats">
            <Button variant="outline" className="gap-2 rounded-xl px-6">
              <Trophy className="h-4 w-4" />
              View Your Stats
            </Button>
          </Link>
          <Link href="/leaderboard">
            <Button variant="outline" className="gap-2 rounded-xl px-6">
              <Flame className="h-4 w-4" />
              Leaderboard
            </Button>
          </Link>
        </div>
      </div>
    </SharedLayout>
  );
}
