'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export function useWordLike(wordId: string) {
  const [isLiked, setIsLiked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  // Fetch current like status
  useEffect(() => {
    if (user && wordId) {
      fetch(`/api/v2/words/${wordId}/like`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setIsLiked(data.isLiked);
          }
        })
        .catch(err => console.error('Error fetching like status:', err));
    }
  }, [user, wordId]);

  const toggleLike = async () => {
    if (!user) {
      // Redirect to sign in if not authenticated
      router.push('/auth/signin?redirect=' + window.location.pathname);
      return;
    }

    setIsLoading(true);
    
    try {
      if (isLiked) {
        // Unlike
        const res = await fetch(`/api/v2/words/${wordId}/like`, {
          method: 'DELETE',
        });
        
        if (res.ok) {
          setIsLiked(false);
        }
      } else {
        // Like
        const res = await fetch(`/api/v2/words/${wordId}/like`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isLove: false }),
        });
        
        if (res.ok) {
          setIsLiked(true);
        }
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLiked,
    isLoading,
    toggleLike,
    isAuthenticated: !!user
  };
}