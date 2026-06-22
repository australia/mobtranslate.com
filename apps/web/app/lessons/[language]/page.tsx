import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { getLessons } from '@/lib/lessons/content';

export default async function LessonsIndexPage(props: { params: Promise<{ language: string }> }) {
  const params = await props.params;
  const lessons = getLessons(params.language);
  if (lessons.length === 0) notFound();
  const languageName = lessons[0].languageName;

  return (
    <div data-language={params.language} className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center gap-2 text-[var(--lang-accent,var(--color-primary))]">
        <GraduationCap className="h-5 w-5" />
        <span className="text-sm font-semibold uppercase tracking-wide">{languageName} lessons</span>
      </div>
      <h1 className="mt-2 font-display text-4xl font-bold text-foreground">Learn {languageName}</h1>
      <p className="mt-2 text-lg text-muted-foreground">Short, interactive lessons. Tap a sound to hear it, then practise out loud.</p>

      <div className="mt-8 space-y-3">
        {lessons.map((l) => (
          <Link
            key={l.slug}
            href={`/lessons/${params.language}/${l.slug}`}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-[var(--lang-accent,var(--color-primary))]"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--lang-accent-soft,var(--color-muted))] text-lg font-bold text-[var(--lang-accent,var(--color-primary))]">
              {l.number}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-foreground">{l.title}</p>
              <p className="truncate text-sm text-muted-foreground">{l.subtitle}</p>
            </div>
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
