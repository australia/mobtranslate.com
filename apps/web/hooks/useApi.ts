import useSWR, { SWRConfiguration, mutate as globalMutate } from 'swr';
import { useAuth } from '@/contexts/AuthContext';

// Custom fetcher with auth
const fetcher = async (url: string) => {
  const res = await fetch(url);
  
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    const data = await res.json().catch(() => ({}));
    (error as any).info = data;
    (error as any).status = res.status;
    throw error;
  }
  
  return res.json();
};

// Custom hook for authenticated API calls
export function useApi<T = any>(
  endpoint: string | null, 
  options?: SWRConfiguration
) {
  const { user } = useAuth();
  
  // Only fetch if user is authenticated and endpoint is provided
  const shouldFetch = user && endpoint;
  
  return useSWR<T>(
    shouldFetch ? endpoint : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      ...options
    }
  );
}

// Hook for dashboard data with optimistic updates
export function useDashboardData(period: string = '30d', language?: string) {
  const endpoint = language 
    ? `/api/v2/dashboard/analytics?period=${period}&language=${language}`
    : `/api/v2/dashboard/overview?period=${period}`;
    
  return useApi(endpoint, {
    refreshInterval: 30000, // Refresh every 30 seconds
    revalidateOnFocus: true
  });
}

// Hook for leaderboard data
export function useLeaderboardData(language: string, period: string = 'week') {
  return useApi(`/api/v2/leaderboard/${language}?period=${period}`, {
    refreshInterval: 60000, // Refresh every minute
    revalidateOnFocus: true
  });
}

// Hook for user profile
export function useUserProfile() {
  return useApi('/api/user/profile', {
    revalidateOnMount: true
  });
}

// Hook for word likes with optimistic updates
export function useWordLikes(wordId: string) {
  const { data, error, mutate } = useApi(`/api/v2/likes/word/${wordId}`);
  
  const toggleLike = async (liked: boolean) => {
    // Optimistic update
    mutate({ liked }, false);
    
    try {
      const response = await fetch(`/api/v2/likes/word/${wordId}`, {
        method: liked ? 'POST' : 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to update like');
      
      const result = await response.json();
      mutate(result); // Update with server response
      
      // Revalidate any lists that might include this word
      globalMutate(key => typeof key === 'string' && key.includes('/likes'));
      
      return result;
    } catch (error) {
      mutate(); // Revert on error
      throw error;
    }
  };
  
  return {
    liked: data?.liked || false,
    loading: !error && !data,
    error,
    toggleLike
  };
}

// Hook for fetching liked words
export function useLikedWords() {
  return useApi('/api/v2/likes', {
    refreshInterval: 0 // Don't auto-refresh
  });
}

// Hook for stats data
export function useStatsData(language: string) {
  return useApi(`/api/v2/stats/simple?language=${language}`, {
    refreshInterval: 60000, // Refresh every minute
    revalidateOnFocus: true
  });
}

// Utility to invalidate cache
export function invalidateCache(matcher: string | RegExp) {
  globalMutate(key => {
    if (typeof key !== 'string') return false;
    if (typeof matcher === 'string') return key.includes(matcher);
    return matcher.test(key);
  });
}