import Link from 'next/link';
import SharedLayout from './components/SharedLayout';
import { Home, BookOpen, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <SharedLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] py-20 text-center px-4">
        <div
          className="text-[10rem] sm:text-[12rem] font-display font-black leading-none select-none mb-2"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            opacity: 0.85,
          }}
          aria-hidden="true"
        >
          404
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Compass className="w-5 h-5 text-primary" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-display font-bold">
            Page Not Found
          </h1>
        </div>

        <p className="text-muted-foreground max-w-md mx-auto mb-10 text-base leading-relaxed">
          It looks like you&apos;ve wandered off the path. Don&apos;t worry — there are
          thousands of words and languages waiting to be explored.
        </p>

        <div className="flex flex-wrap gap-3 justify-center" role="navigation" aria-label="Recovery options">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            Go Home
          </Link>
          <Link
            href="/dictionaries"
            className="inline-flex items-center gap-2 px-6 py-3 border border-border font-medium rounded-lg hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
          >
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            Browse Dictionaries
          </Link>
        </div>
      </div>
    </SharedLayout>
  );
}
