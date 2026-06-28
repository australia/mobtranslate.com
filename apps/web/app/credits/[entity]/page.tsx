import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import { CREDITS, getCredit, CATEGORY_META } from '@/lib/credits';
import { ArrowLeft, ExternalLink, Quote } from 'lucide-react';

export function generateStaticParams() {
  return CREDITS.map((c) => ({ entity: c.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ entity: string }> },
): Promise<Metadata> {
  const { entity } = await params;
  const c = getCredit(entity);
  if (!c) return { title: 'Credit not found — MobTranslate' };
  return {
    title: `${c.name} — Credits — MobTranslate`,
    description: `${c.role}. ${c.contribution}`,
  };
}

export default async function CreditEntityPage(
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  const c = getCredit(entity);
  if (!c) notFound();

  // Others credited for the same language(s), for gentle cross-linking.
  const related = CREDITS.filter(
    (o) => o.slug !== c.slug && o.languages?.some((l) => c.languages?.includes(l)),
  ).slice(0, 4);

  return (
    <SharedLayout>
      <div className="max-w-2xl mx-auto py-8 md:py-12">
        <Link href="/credits" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Credits
        </Link>

        <article className="mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary mb-2">
            {CATEGORY_META[c.category].label}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">{c.name}</h1>
          <p className="text-lg text-muted-foreground mt-2">{c.role}</p>

          {c.languages && c.languages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {c.languages.map((l) => (
                <span key={l} className="text-xs rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{l}</span>
              ))}
            </div>
          )}

          {/* What we use of theirs */}
          <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 flex gap-3">
            <Quote className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-foreground">{c.contribution}</p>
          </div>

          {/* Bio */}
          <div className="prose-sm mt-6">
            <p className="text-[15px] leading-relaxed text-foreground/90">{c.bio}</p>
          </div>

          {/* Links */}
          {c.links && c.links.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {c.links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 h-9 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  {l.label}
                  <ExternalLink className="h-3.5 w-3.5 opacity-50" />
                </a>
              ))}
            </div>
          )}
        </article>

        {related.length > 0 && (
          <div className="mt-12 border-t border-border pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Also credited
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {related.map((o) => (
                <li key={o.slug}>
                  <Link
                    href={`/credits/${o.slug}`}
                    className="group flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 hover:border-primary transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate group-hover:text-primary transition-colors">{o.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{o.role}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SharedLayout>
  );
}
