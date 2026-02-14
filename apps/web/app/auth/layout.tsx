'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const savedMode = localStorage.getItem('darkMode');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;

    if (savedMode === 'true' || (prefersDark && savedMode === null)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="p-6">
        <Link
          href="/"
          className="text-2xl font-bold bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent"
        >
          Mob Translate
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        {children}
      </div>
      <div className="p-6 text-center text-sm text-muted-foreground">
        {new Date().getFullYear()} Mob Translate
      </div>
    </div>
  );
}
