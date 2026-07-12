import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import SharedLayout from '../components/SharedLayout';

interface AtlasStubProps {
  eyebrow: string;
  title: string;
  intro: string;
  bullets?: string[];
  liveAlt?: { href: string; label: string };
}

/**
 * A dignified placeholder for atlas views that land in later phases. It never
 * pretends the feature is done — it says plainly what is coming and points to
 * what is live now.
 */
export default function AtlasStub({
  eyebrow,
  title,
  intro,
  bullets,
  liveAlt,
}: AtlasStubProps) {
  return (
    <SharedLayout>
      <div className="mx-auto max-w-2xl py-6">
        <Link
          href="/atlas"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Back to the atlas
        </Link>

        <div className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>
          <h1 className="marketing mt-1 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <span className="mt-3 inline-block rounded-full bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            In progress
          </span>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{intro}</p>
        </div>

        {bullets && bullets.length > 0 && (
          <ul className="mt-6 space-y-2.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[14px] text-foreground/85">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>
        )}

        {liveAlt && (
          <div className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-[13px] text-muted-foreground">Available now</p>
            <Link
              href={liveAlt.href}
              className="mt-1 inline-flex items-center gap-2 text-base font-semibold text-primary hover:underline"
            >
              {liveAlt.label} →
            </Link>
          </div>
        )}
      </div>
    </SharedLayout>
  );
}
