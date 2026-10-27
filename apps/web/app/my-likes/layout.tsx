import React from 'react';
import { privatePage } from '@/lib/seo';

export const metadata = privatePage('My liked words', 'Your liked and loved words across every dictionary.');

export default function MyLikesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}