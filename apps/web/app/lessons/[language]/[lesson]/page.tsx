import { notFound } from 'next/navigation';
import { getLesson } from '@/lib/lessons/content';
import { LessonView } from './LessonView';

export function generateMetadata({ params }: { params: { language: string; lesson: string } }) {
  const lesson = getLesson(params.language, params.lesson);
  return { title: lesson ? `Lesson ${lesson.number}: ${lesson.title} — ${lesson.languageName}` : 'Lesson' };
}

export default function LessonPage({ params }: { params: { language: string; lesson: string } }) {
  const lesson = getLesson(params.language, params.lesson);
  if (!lesson) notFound();
  return <LessonView lesson={lesson} />;
}
