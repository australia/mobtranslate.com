import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Leaderboard',
  description: 'Top contributors learning and building Australian First Nations language dictionaries.',
  alternates: { canonical: '/leaderboard' },
  openGraph: { title: 'Leaderboard | Mob Translate', url: '/leaderboard', type: 'website' },
};

export default function LeaderboardLayout({ children }: { children: ReactNode }) {
  return children;
}
