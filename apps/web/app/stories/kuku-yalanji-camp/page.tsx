import type { Metadata } from 'next';
import { StoryDeck } from './StoryDeck';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'A day with an elder — a Kuku Yalanji yarn',
  description:
    'An illustrated story in Kuku Yalanji and English: a nephew and his elder yarn about family, then make camp under the stars. Every Kuku Yalanji word is a real dictionary entry.',
  path: '/stories/kuku-yalanji-camp',
});

export default function KukuYalanjiStoryPage() {
  return <StoryDeck />;
}
