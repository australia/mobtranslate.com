import type { Metadata } from 'next';
import { StoryDeck } from './StoryDeck';

export const metadata: Metadata = {
  title: 'A day with an elder — a Kuku Yalanji yarn',
  description:
    'A short illustrated story in Kuku Yalanji and English: a nephew and his elder yarn about family over turtle and kangaroo, then make camp in the bush under the stars. Every Kuku Yalanji word is a real dictionary entry.',
};

export default function KukuYalanjiStoryPage() {
  return <StoryDeck />;
}
