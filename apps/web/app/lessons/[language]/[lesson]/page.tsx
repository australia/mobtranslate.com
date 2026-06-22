import { notFound } from 'next/navigation';
import { getLesson } from '@/lib/lessons/content';
import { LessonView } from './LessonView';

export async function generateMetadata(props: { params: Promise<{ language: string; lesson: string }> }) {
  const params = await props.params;
  const lesson = getLesson(params.language, params.lesson);
  return { title: lesson ? `Lesson ${lesson.number}: ${lesson.title} — ${lesson.languageName}` : 'Lesson' };
}

export default async function LessonPage(props: { params: Promise<{ language: string; lesson: string }> }) {
  const params = await props.params;
  const lesson = getLesson(params.language, params.lesson);
  if (!lesson) notFound();
  return <LessonView lesson={lesson} />;
}
