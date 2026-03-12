'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@mobtranslate/ui';
import { EmptyState } from '@/components/layout/EmptyState';
import { LoadingState } from '@/components/layout/LoadingState';
import { DictionaryTableWithLikes } from '@/components/DictionaryTableWithLikes';
import { Heart, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { transformWordForUI } from '@/lib/utils/dictionary-transform';

interface LikedWord {
  id: string;
  word_id: string;
  is_love: boolean;
  liked_at: string;
  word: any; // Full word object from API
}

export default function MyLikesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [likes, setLikes] = useState<LikedWord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });

  useEffect(() => {
    // Don't redirect if still loading
    if (loading) return;

    if (!user) {
      router.push('/auth/signin?redirect=/my-likes');
      return;
    }

    fetchLikes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, pagination.page]);

  const fetchLikes = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      });

      const response = await fetch(`/api/v2/user/likes?${params}`);
      const data = await response.json();

      if (data.error) {
        console.error('Error fetching likes:', data.error);
        return;
      }

      setLikes(data.likes);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Error fetching likes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWordClick = (word: string) => {
    const likedWord = likes.find(l => l.word.word === word);
    if (likedWord?.word) {
      router.push(`/dictionaries/${likedWord.word.language.code}/words/${encodeURIComponent(word)}`);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const transformedWords = likes.map(like => ({
    ...transformWordForUI(like.word),
    likedAt: like.liked_at
  }));

  // Show loading while checking auth
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
    return null; // Will redirect in useEffect
  }

  return (
    <SharedLayout>
      {/* Header */}
      <div className="py-8 md:py-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-sm font-semibold mb-6 border border-rose-200 dark:border-rose-800/50">
          <Heart className="w-4 h-4 fill-current" />
          Collection
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-tight">
            My Liked Words
          </h1>
          {pagination.total > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-sm font-medium text-muted-foreground">
              <Heart className="h-3 w-3 fill-rose-500 text-rose-500" />
              {pagination.total} liked
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-lg">
          Words you&apos;ve liked across all languages
        </p>
      </div>

      <div className="pb-12">
        {isLoading ? (
          <LoadingState />
        ) : transformedWords.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16">
              <EmptyState
                icon={<Heart className="h-12 w-12 text-rose-300 dark:text-rose-700" />}
                title="No liked words yet"
                description="Click the heart icon on any word to start building your collection!"
                action={
                  <Button onClick={() => router.push('/dictionaries')}>
                    <BookOpen className="mr-2 h-4 w-4" />
                    Browse Dictionaries
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Group words by language */}
            {Object.entries(
              transformedWords.reduce((acc, word) => {
                const lang = likes.find(l => l.word.id === word.id)?.word.language.name || 'Unknown';
                if (!acc[lang]) acc[lang] = [];
                acc[lang].push(word);
                return acc;
              }, {} as Record<string, typeof transformedWords>)
            ).map(([language, words]) => (
              <Card key={language} className="mb-6">
                <CardHeader className="border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <CardTitle className="text-lg">{language}</CardTitle>
                    <span className="text-sm text-muted-foreground">
                      {words.length} {words.length === 1 ? 'word' : 'words'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <DictionaryTableWithLikes
                    words={words}
                    onWordClick={handleWordClick}
                    showLikeButtons={true}
                  />
                </CardContent>
              </Card>
            ))}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 mt-8">
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={!pagination.hasPrev}
                  className="gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground px-4">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={!pagination.hasNext}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </SharedLayout>
  );
}
