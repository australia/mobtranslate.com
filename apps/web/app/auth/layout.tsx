'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Globe, BookOpen, Sparkles } from 'lucide-react';

const FLOATING_WORDS = [
  { word: 'Yaama', meaning: 'Hello', lang: 'Gamilaraay' },
  { word: 'Ngany', meaning: 'I/Me', lang: 'Wajarri' },
  { word: 'Bunjil', meaning: 'Eagle', lang: 'Kulin' },
  { word: 'Jalygurr', meaning: 'Stars', lang: 'Nyoongar' },
  { word: 'Minya', meaning: 'What', lang: 'Anindilyakwa' },
  { word: 'Barayagal', meaning: 'Great', lang: 'Gadigal' },
];

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
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Skip to content link */}
      <a href="#auth-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to main content
      </a>

      {/* Left Panel - Branding (hidden on mobile). Solid warm-earth ground:
          no gradient, no floating orbs, no gradient text. */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative bg-[#33180c] text-[#faf8f5]">
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Logo */}
          <Link href="/" className="inline-flex items-center gap-2.5 group w-fit">
            <span className="w-2 h-2 rounded-full bg-[#ecb485]" />
            <span className="text-2xl font-bold text-[#faf8f5]">Mob Translate</span>
          </Link>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#ecb485] mb-6">
              Community language learning
            </p>

            <h1 className="text-4xl xl:text-5xl font-display font-bold text-[#faf8f5] mb-5 tracking-[-0.02em] leading-[1.1]">
              Every language carries a world
            </h1>

            <p className="text-lg text-[#faf8f5]/65 mb-10 leading-relaxed">
              Join the community keeping Indigenous languages living, through open dictionaries,
              translation, and a learning habit you can build a few words at a time.
            </p>

            {/* Feature list */}
            <ul className="space-y-4 mb-12">
              {[
                { icon: Globe, text: 'Translation tools for Indigenous languages' },
                { icon: BookOpen, text: 'Community-curated living dictionaries' },
                { icon: Sparkles, text: 'AI translation, always flagged as a guide' },
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <item.icon className="w-4.5 h-4.5 text-[#ecb485] shrink-0" aria-hidden="true" />
                  <span className="text-[#faf8f5]/85 text-sm">{item.text}</span>
                </li>
              ))}
            </ul>

            {/* A few words, as a quiet editorial strip */}
            <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-[#faf8f5]/10 pt-6">
              {FLOATING_WORDS.map((item, i) => (
                <div key={i}>
                  <div className="text-sm font-medium text-[#faf8f5]/90" lang="und">{item.word}</div>
                  <div className="text-xs text-[#faf8f5]/55">{item.meaning} &middot; {item.lang}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <div className="p-6 lg:hidden">
          <Link href="/" className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
            <span className="w-2 h-2 rounded-full bg-primary" />
            Mob Translate
          </Link>
          <h1 className="text-2xl font-display font-bold mt-4 text-foreground">
            Every Language Carries a World
          </h1>
        </div>

        {/* Form area */}
        <main id="auth-content" className="flex flex-1 items-center justify-center p-4 sm:p-8">
          {children}
        </main>

        {/* Footer */}
        <div className="p-6 text-center text-sm text-muted-foreground">
          {new Date().getFullYear()} Mob Translate &middot; Open Source
        </div>
      </div>
    </div>
  );
}
