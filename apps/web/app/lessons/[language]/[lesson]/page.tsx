import { notFound } from 'next/navigation';
import { getLesson } from '@/lib/lessons/content';
import { LessonView } from './LessonView';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata(props: { params: Promise<{ language: string; lesson: string }> }) {
  const params = await props.params;
  const lesson = getLesson(params.language, params.lesson);
  if (!lesson) return { title: 'Lesson' };
  return pageMetadata({
    title: `Lesson ${lesson.number}: ${lesson.title} — ${lesson.languageName}`,
    description: `Lesson ${lesson.number} of the ${lesson.languageName} course on Mob Translate: ${lesson.title}.`,
    path: `/lessons/${params.language}/${params.lesson}`,
  });
}

export default async function LessonPage(props: { params: Promise<{ language: string; lesson: string }> }) {
  const params = await props.params;
  const lesson = getLesson(params.language, params.lesson);
  if (!lesson) notFound();
  return <LessonView lesson={lesson} />;
}
