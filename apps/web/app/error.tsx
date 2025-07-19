'use client';

import { useEffect } from 'react';
import { Button, Alert } from '@ui/components';
import { AlertTriangle } from 'lucide-react';
import SharedLayout from './components/SharedLayout';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <SharedLayout>
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <Alert variant="destructive" className="border-2">
            <AlertTriangle className="h-5 w-5" />
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Something went wrong!</h2>
              <p className="text-sm">
                We encountered an error while processing your request. 
                Please try again or contact support if the problem persists.
              </p>
              {process.env.NODE_ENV === 'development' && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium">Error details</summary>
                  <pre className="mt-2 overflow-auto p-2 bg-muted rounded">
                    {error.message}
                    {error.digest && `\nDigest: ${error.digest}`}
                  </pre>
                </details>
              )}
              <div className="flex gap-2 pt-2">
                <Button onClick={reset} variant="default" size="sm">
                  Try again
                </Button>
                <Button
                  onClick={() => window.location.href = '/'}
                  variant="outline"
                  size="sm"
                >
                  Go home
                </Button>
              </div>
            </div>
          </Alert>
        </div>
      </div>
    </SharedLayout>
  );
}