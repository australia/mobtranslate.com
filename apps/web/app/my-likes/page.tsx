'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Badge, EmptyState, Button, LoadingState } from '@ui/components';
import { DictionaryTableWithLikes } from '@/components/DictionaryTableWithLikes';
import { Heart, BookOpen } from 'lucide-react';
import { transformWordForUI } from '@/lib/utils/dictionary-transform';

interface LikedWord {
  id: string;
  word_id: string;
  is_love: boolean;
  liked_at: string;
  word: any; // Full word object from API
}

export default function MyLikesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [likes, setLikes] = useState<LikedWord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLovesOnly, setShowLovesOnly] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin?redirect=/my-likes');
      return;
    }

    fetchLikes();
  }, [user, showLovesOnly, pagination.page]);

  const fetchLikes = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        loveOnly: showLovesOnly ? 'true' : 'false'
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
    likedAt: like.liked_at,
    isLove: like.is_love
  }));

  const loveCount = likes.filter(l => l.is_love).length;

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return (
    <SharedLayout>
      <PageHeader 
        title="My Liked Words"
        description="Words you've liked and loved across all languages"
      >
        <div className="flex items-center justify-center gap-2 mt-4">
          <Badge variant="secondary">
            <Heart className="h-3 w-3 mr-1" />
            {pagination.total} liked
          </Badge>
          {!showLovesOnly && (
            <Badge variant="outline">
              <Heart className="h-3 w-3 mr-1 fill-current" />
              {loveCount} loved
            </Badge>
          )}
        </div>
      </PageHeader>

      <Section>
        {/* Filter buttons */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={!showLovesOnly ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowLovesOnly(false);
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
          >
            All Likes
          </Button>
          <Button
            variant={showLovesOnly ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowLovesOnly(true);
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
          >
            <Heart className="h-4 w-4 mr-1 fill-current" />
            Loves Only
          </Button>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : transformedWords.length === 0 ? (
          <EmptyState
            icon={Heart}
            title={showLovesOnly ? "No loved words yet" : "No liked words yet"}
            description={
              showLovesOnly 
                ? "Double-click the heart icon on any word to love it!"
                : "Click the heart icon on any word to like it!"
            }
            action={
              <Button onClick={() => router.push('/dictionaries')}>
                <BookOpen className="mr-2 h-4 w-4" />
                Browse Dictionaries
              </Button>
            }
          />
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
                <CardHeader>
                  <CardTitle className="text-lg">{language}</CardTitle>
                </CardHeader>
                <CardContent>
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
              <div className="flex justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={!pagination.hasPrev}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-2 px-4">
                  <span className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                </div>
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={!pagination.hasNext}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </Section>
    </SharedLayout>
  );
}