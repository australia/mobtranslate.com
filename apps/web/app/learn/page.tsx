'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@mobtranslate/ui';
import { LoadingState } from '@/components/layout/LoadingState';
import { Brain, Play, BookOpen, Sparkles, ChevronRight } from 'lucide-react';
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
      {/* Header */}
      <div className="py-6 md:py-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Practice Mode
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
          Learn Words
        </h1>
        <p className="text-muted-foreground mt-2">
          Choose a language to start learning
        </p>
      </div>

      <div className="pb-12">
        {isLoadingLanguages ? (
          <LoadingState />
        ) : languages.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-display font-bold mb-2">No Languages Available</h3>
              <p className="text-muted-foreground">
                There are no language dictionaries available yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {languages.map((language) => (
              <Link key={language.code} href={`/learn/${language.code}`} className="group block">
                <Card className="h-full transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30">
                  <CardHeader>
                    <CardTitle className="text-lg font-display">{language.name}</CardTitle>
                    {language.wordCount !== undefined && (
                      <p className="text-sm text-muted-foreground">
                        {language.wordCount.toLocaleString()} words available
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-primary group-hover:underline">Start Learning</span>
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Play className="h-3.5 w-3.5 text-primary ml-0.5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <Link href="/stats">
            <Button variant="outline" className="gap-2">
              <Brain className="h-4 w-4" />
              View Your Stats
            </Button>
          </Link>
        </div>
      </div>
    </SharedLayout>
  );
}