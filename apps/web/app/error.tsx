'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import SharedLayout from './components/SharedLayout';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <SharedLayout>
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 mb-6">
            <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-display font-bold mb-3">
            Something went wrong
          </h1>

          <p className="text-muted-foreground max-w-md mx-auto mb-4 text-base leading-relaxed">
            We hit an unexpected bump while loading this page. This is usually
            temporary — give it another try and things should be back to normal.
          </p>

          {process.env.NODE_ENV === 'development' && error.message && (
            <details className="text-left mb-6 rounded-lg border border-border bg-muted/50 p-4">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground select-none">
                Error details (development only)
              </summary>
              <pre className="mt-3 overflow-auto text-xs p-3 bg-background rounded-md border border-border font-mono whitespace-pre-wrap break-words">
                {error.message}
                {error.digest && `\nDigest: ${error.digest}`}
              </pre>
            </details>
          )}

          <div className="flex flex-wrap gap-3 justify-center" role="navigation" aria-label="Recovery options">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Try Again
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 border border-border font-medium rounded-lg hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
            >
              <Home className="w-4 h-4" aria-hidden="true" />
              Go Home
            </Link>
          </div>
        </div>
      </div>
    </SharedLayout>
  );
}
