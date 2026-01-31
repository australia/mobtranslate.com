'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { AppChatInterface } from './components/AppChatInterface';

export default function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin?redirect=/chat');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-indigo-200 dark:border-indigo-800"></div>
          <div className="absolute top-0 left-0 w-20 h-20 rounded-full border-4 border-transparent border-t-indigo-500 dark:border-t-indigo-400 animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <AppChatInterface />;
}