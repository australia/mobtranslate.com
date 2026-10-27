import { Metadata } from 'next';
import React from 'react';
import { privatePage } from '@/lib/seo';

export const metadata: Metadata = privatePage('AI chat', 'Chat with AI about Aboriginal languages and translations.');

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}