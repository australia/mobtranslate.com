import Link from 'next/link';
import type { Metadata } from 'next';
import SharedLayout from '../components/SharedLayout';
import { creditsByCategory, CATEGORY_META } from '@/lib/credits';
import { ArrowRight, Heart } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Credits — MobTranslate',
  description:
    'The communities, dictionary makers, linguists and open voice models whose work MobTranslate is built on.',
};

export default function CreditsPage() {
  const groups = creditsByCategory();

  return (
    <SharedLayout>
      <div className="max-w-3xl mx-auto py-8 md:py-12">
        <header className="mb-10">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary mb-2 flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5" /> With thanks
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Credits</h1>
          <p className="text-muted-foreground mt-3 leading-relaxed max-w-2xl">
            MobTranslate holds languages that belong to their communities, recorded and described
            over decades. The dictionaries, the spelling systems, the pronunciation and the voices
            are all built on the work below. This is our thank-you to them.
          </p>
        </header>

        <div className="space-y-10">
          {groups.map(({ category, items }) => (
            <section key={category}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                {CATEGORY_META[category].label}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 mb-4">{CATEGORY_META[category].blurb}</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/credits/${c.slug}`}
                      className="group block h-full rounded-xl border border-border p-4 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold leading-snug group-hover:text-primary transition-colors">{c.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{c.role}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      {c.languages && c.languages.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {c.languages.map((l) => (
                            <span key={l} className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{l}</span>
                          ))}
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-12 border-t border-border pt-6 leading-relaxed">
          Have we missed someone, or got something wrong? Attribution matters — please{' '}
          <a
            href="https://github.com/australia/mobtranslate.com/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            let us know
          </a>
          .
        </p>
      </div>
    </SharedLayout>
  );
}
