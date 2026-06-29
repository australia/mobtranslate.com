import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Learn',
  description:
    'Practise and learn Australian First Nations languages with quizzes and spaced repetition.',
  alternates: { canonical: '/learn' },
  openGraph: { title: 'Learn | Mob Translate', url: '/learn', type: 'website' },
};

export default function LearnLayout({ children }: { children: ReactNode }) {
  return children;
}
