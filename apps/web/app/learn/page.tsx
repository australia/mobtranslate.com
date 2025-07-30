'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Button, LoadingState } from '@/app/components/ui/table';
import { Brain, Play, BookOpen } from 'lucide-react';
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
        <Section>
          <LoadingState />
        </Section>
      </SharedLayout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SharedLayout>
      <PageHeader 
        title="Learn Words"
        description="Choose a language to start learning"
      />

      <Section>
        {isLoadingLanguages ? (
          <LoadingState />
        ) : languages.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Languages Available</h3>
              <p className="text-muted-foreground">
                There are no language dictionaries available yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {languages.map((language) => (
              <Card key={language.code} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg">{language.name}</CardTitle>
                  {language.wordCount !== undefined && (
                    <p className="text-sm text-muted-foreground">
                      {language.wordCount} words available
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <Link href={`/learn/${language.code}`}>
                    <Button className="w-full">
                      <Play className="h-4 w-4 mr-2" />
                      Start Learning
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        <div className="mt-8 text-center">
          <Link href="/stats">
            <Button variant="outline">
              <Brain className="h-4 w-4 mr-2" />
              View Your Stats
            </Button>
          </Link>
        </div>
      </Section>
    </SharedLayout>
  );
}