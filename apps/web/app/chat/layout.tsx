import { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'AI Chat - Mob Translate',
  description: 'Chat with AI about Aboriginal languages and translations',
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}