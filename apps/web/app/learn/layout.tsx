import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Learn',
  description:
    'Practise and learn Australian First Nations languages with quizzes and spaced repetition.',
  path: '/learn',
});

export default function LearnLayout({ children }: { children: ReactNode }) {
  return children;
}
