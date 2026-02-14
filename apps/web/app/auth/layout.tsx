'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Globe, BookOpen, Sparkles, Heart } from 'lucide-react';

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
      {/* Left Panel - Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
          {/* Pattern overlay */}
          <div className="absolute inset-0 opacity-[0.15]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
          {/* Floating orbs */}
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '4s' }} />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Logo */}
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="text-2xl font-bold text-white">Mob Translate</span>
          </Link>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-sm font-medium mb-6 w-fit">
              <Heart className="w-3.5 h-3.5 text-amber-400" />
              Language Preservation
            </div>

            <h1 className="text-4xl xl:text-5xl font-display font-black text-white mb-4 tracking-tight leading-tight">
              Every Language Carries{' '}
              <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">
                a World
              </span>
            </h1>

            <p className="text-lg text-white/60 mb-10 leading-relaxed">
              Join our community preserving Indigenous languages through open-source
              translation tools, interactive dictionaries, and AI-powered learning.
            </p>

            {/* Feature bullets */}
            <div className="space-y-4 mb-10">
              {[
                { icon: Globe, text: 'Translation tools for Indigenous languages' },
                { icon: BookOpen, text: 'Community-curated living dictionaries' },
                { icon: Sparkles, text: 'AI-powered contextual translations' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <item.icon className="w-4 h-4 text-amber-400" />
                  </div>
                  <span className="text-white/80 text-sm">{item.text}</span>
                </div>
              ))}
            </div>

            {/* Floating words */}
            <div className="flex flex-wrap gap-3">
              {FLOATING_WORDS.map((item, i) => (
                <div
                  key={i}
                  className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm"
                >
                  <div className="text-sm font-medium text-white/90">{item.word}</div>
                  <div className="text-xs text-white/40">{item.meaning} &middot; {item.lang}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <p className="text-xs text-white/30">
            We acknowledge the Traditional Owners of the languages represented on this platform.
          </p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <div className="p-6 lg:hidden">
          <Link
            href="/"
            className="text-2xl font-bold bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent"
          >
            Mob Translate
          </Link>
        </div>

        {/* Form area */}
        <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
          {children}
        </div>

        {/* Footer */}
        <div className="p-6 text-center text-sm text-muted-foreground">
          {new Date().getFullYear()} Mob Translate &middot; Open Source
        </div>
      </div>
    </div>
  );
}
