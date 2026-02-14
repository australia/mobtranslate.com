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
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-border"></div>
          <div className="absolute top-0 left-0 w-20 h-20 rounded-full border-4 border-transparent border-t-primary animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <AppChatInterface />;
}