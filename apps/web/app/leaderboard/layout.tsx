import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Leaderboard',
  description:
    'Top contributors learning and building Australian First Nations language dictionaries.',
  path: '/leaderboard',
});

export default function LeaderboardLayout({ children }: { children: ReactNode }) {
  return children;
}
