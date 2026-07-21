'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Sun, Moon, Code, Heart, Globe, BookOpen, Users, ExternalLink } from 'lucide-react';
import { cn, Button } from '@mobtranslate/ui';
import { ModernNav } from '@/components/navigation/ModernNav';
import { BrandMark } from '@/components/brand/BrandMark';
import { ContactEmailLink } from './ContactEmailLink';

interface NavLink {
  title: string;
  href: string;
  external?: boolean;
}

interface SharedLayoutProps {
  children: ReactNode;
}

export default function SharedLayout({ children }: SharedLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);

    // Check user preference for dark mode
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('darkMode');
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;

      if (savedMode === 'true' || (prefersDark && savedMode === null)) {
        setIsDarkMode(true);
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      // Listen for system preference changes in real-time
      const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        const saved = localStorage.getItem('darkMode');
        // Only auto-switch if user hasn't explicitly chosen
        if (saved === null) {
          setIsDarkMode(e.matches);
          if (e.matches) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      };
      mediaQuery?.addEventListener('change', handleChange);

      return () => {
        window.removeEventListener('scroll', handleScroll);
        mediaQuery?.removeEventListener('change', handleChange);
      };
    }

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    if (typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('darkMode', 'false');
      } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('darkMode', 'true');
      }
    }
  };

  // Navigation links data
  const navLinks: NavLink[] = [
    { title: 'About', href: '/about' },
    { title: 'Atlas', href: '/atlas' },
    { title: 'Dictionaries', href: '/dictionaries' },
    { title: 'Map', href: '/map' },
    { title: 'Spread', href: '/atlas/spread' },
    { title: 'Translate', href: '/#translate' },
    { title: 'Talk', href: '/talk/kuku-yalanji' },
    { title: 'Models', href: '/models' },
    { title: 'Learn', href: '/education' },
    { title: 'Community', href: '/leaderboard' }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background" style={{ overflowX: 'clip' }}>
      {/* Skip to content link */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to main content
      </a>

      {/* Header with glass morphism */}
      <header
        className={cn(
          "sticky top-0 z-50 w-full transition-all duration-300",
          "backdrop-blur-xl",
          isScrolled
            ? "bg-background/85 shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)] border-b border-border/50"
            : "bg-background/60 border-b border-transparent"
        )}
      >
        <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
          <div className="flex h-16 md:h-18 items-center justify-between">
            {/* Logo with decorative dot */}
            <Link
              href="/"
              className="flex min-h-11 items-center gap-2.5 group shrink-0"
            >
              <BrandMark size={30} className="rounded-[7px] shrink-0 group-hover:scale-105 transition-transform duration-300" />
              <span className="text-xl sm:text-2xl font-bold text-foreground whitespace-nowrap">
                Mob Translate
              </span>
            </Link>

            {/* Desktop Navigation with underline animation */}
            <nav className="hidden min-[1360px]:flex items-center gap-6 lg:gap-8" aria-label="Main navigation">
              {navLinks.map((link) => {
                const isActive = !link.external && pathname.startsWith(link.href);
                return (
                <Link
                  key={link.title}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    "relative text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200",
                    "after:absolute after:left-0 after:bottom-[-4px] after:h-[2px] after:w-0 after:bg-primary after:rounded-full",
                    "after:transition-all after:duration-300 after:ease-out",
                    "hover:after:w-full",
                    link.external && "inline-flex items-center gap-1"
                  )}
                >
                  {link.title}
                  {link.external && <ExternalLink className="h-3 w-3 opacity-50" />}
                </Link>
                );
              })}
              <div className="flex items-center gap-3 ml-2">
                {/* Dark mode toggle with smooth icon transition */}
                <Button
                  variant="ghost"
                  onClick={toggleDarkMode}
                  className="relative h-11 w-11 rounded-full p-2 hover:bg-muted transition-colors"
                  aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  <Sun
                    size={18}
                    className={cn(
                      "absolute inset-0 m-auto transition-all duration-300",
                      isDarkMode
                        ? "rotate-0 scale-100 opacity-100"
                        : "rotate-90 scale-0 opacity-0"
                    )}
                  />
                  <Moon
                    size={18}
                    className={cn(
                      "absolute inset-0 m-auto transition-all duration-300",
                      isDarkMode
                        ? "-rotate-90 scale-0 opacity-0"
                        : "rotate-0 scale-100 opacity-100"
                    )}
                  />
                </Button>
                <ModernNav />
              </div>
            </nav>

            {/* Mobile Menu Controls */}
            <div className="flex min-[1360px]:hidden items-center gap-1.5">
              <ModernNav />
              <Button
                variant="ghost"
                onClick={toggleDarkMode}
                className="relative h-11 w-11 rounded-full p-2 hover:bg-muted transition-colors"
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <Sun
                  size={18}
                  className={cn(
                    "absolute inset-0 m-auto transition-all duration-300",
                    isDarkMode
                      ? "rotate-0 scale-100 opacity-100"
                      : "rotate-90 scale-0 opacity-0"
                  )}
                />
                <Moon
                  size={18}
                  className={cn(
                    "absolute inset-0 m-auto transition-all duration-300",
                    isDarkMode
                      ? "-rotate-90 scale-0 opacity-0"
                      : "rotate-0 scale-100 opacity-100"
                  )}
                />
              </Button>
              <Button
                variant="ghost"
                onClick={toggleMenu}
                className="h-11 w-11 rounded-full p-2 hover:bg-muted transition-colors"
                aria-label="Toggle menu"
              >
                <span className={cn(
                  "transition-all duration-300",
                  isMenuOpen ? "rotate-90" : "rotate-0"
                )}>
                  {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </span>
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu with slide-down transition */}
        <div
          className={cn(
            "min-[1360px]:hidden overflow-hidden transition-all duration-300 ease-in-out",
            isMenuOpen ? "max-h-[36rem] opacity-100" : "max-h-0 opacity-0"
          )}
          aria-hidden={!isMenuOpen}
        >
          <nav className="px-4 sm:px-6 py-3 flex flex-col gap-1 border-t border-border/50 bg-background/80 backdrop-blur-xl" aria-label="Mobile navigation">
            {navLinks.map((link) => {
              const isActive = !link.external && pathname.startsWith(link.href);
              return (
              <Link
                key={link.title}
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noopener noreferrer' : undefined}
                tabIndex={isMenuOpen ? 0 : -1}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  "text-foreground hover:text-primary transition-colors duration-200 font-medium py-2.5 px-3 rounded-lg hover:bg-muted/50",
                  "flex items-center justify-between"
                )}
                onClick={toggleMenu}
              >
                <span>{link.title}</span>
                {link.external && <ExternalLink className="h-3.5 w-3.5 opacity-40" />}
              </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area with smooth transitions */}
      <main id="main-content" className="flex-1 w-full mx-auto max-w-[1920px] 2xl:max-w-[2200px] px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-6 sm:py-8 lg:py-12">
        {children}
      </main>

      {/* Rich Footer with warm gradient */}
      <footer className="mt-auto border-t border-border bg-gradient-to-b from-muted/40 to-muted/70 dark:from-muted/20 dark:to-muted/40">
        <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
          {/* Main footer content - 4 columns */}
          <div className="py-12 lg:py-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
            {/* Brand + Social */}
            <div className="sm:col-span-2 lg:col-span-1">
              <Link href="/" className="inline-flex items-center gap-2 group">
                <BrandMark size={26} className="rounded-md shrink-0 group-hover:scale-105 transition-transform duration-300" />
                <span className="text-xl font-bold text-foreground">
                  Mob Translate
                </span>
              </Link>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-xs">
                Open-source dictionaries and translation tools for Indigenous languages.
              </p>
              <div className="flex items-center gap-2.5 mt-5">
                <a
                  href="https://github.com/australia/mobtranslate.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all duration-200 hover:scale-110 hover:bg-primary/10 hover:text-foreground"
                  aria-label="GitHub Repository"
                >
                  <Code size={16} />
                </a>
                <a
                  href="https://twitter.com/ajaxdavis"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all duration-200 hover:scale-110 hover:bg-primary/10 hover:text-foreground"
                  aria-label="Twitter"
                >
                  <Heart size={16} />
                </a>
                <a
                  href="/about"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all duration-200 hover:scale-110 hover:bg-primary/10 hover:text-foreground"
                  aria-label="About Us"
                >
                  <Globe size={16} />
                </a>
              </div>
            </div>

            {/* Explore */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2">
                <BookOpen size={14} className="text-primary" aria-hidden="true" />
                Explore
              </h3>
              <ul className="space-y-2.5">
                {navLinks.map((link) => (
                  <li key={link.title}>
                    <Link
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className="text-sm text-muted-foreground hover:text-foreground hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1"
                    >
                      {link.title}
                      {link.external && <ExternalLink className="h-3 w-3 opacity-40" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2">
                <Globe size={14} className="text-primary" aria-hidden="true" />
                Resources
              </h3>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/labs/v2" className="text-sm text-muted-foreground hover:text-foreground hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1.5">
                    Translate
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80">v2 research preview</span>
                  </Link>
                </li>
                <li>
                  <Link href="/styleguide" className="text-sm text-muted-foreground hover:text-foreground hover:translate-x-0.5 transition-all duration-200 inline-block">
                    Style Guide
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/australia/mobtranslate.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1"
                  >
                    Source Code
                    <ExternalLink className="h-3 w-3 opacity-40" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/australia/mobtranslate.com/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1"
                  >
                    Report an Issue
                    <ExternalLink className="h-3 w-3 opacity-40" />
                  </a>
                </li>
                <li>
                  <Link href="/leaderboard" className="text-sm text-muted-foreground hover:text-foreground hover:translate-x-0.5 transition-all duration-200 inline-block">
                    Leaderboard
                  </Link>
                </li>
                <li>
                  <Link href="/credits" className="text-sm text-muted-foreground hover:text-foreground hover:translate-x-0.5 transition-all duration-200 inline-block">
                    Credits
                  </Link>
                </li>
                <li>
                  <Link href="/download" className="text-sm text-muted-foreground hover:text-foreground hover:translate-x-0.5 transition-all duration-200 inline-block">
                    Get the app
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground hover:translate-x-0.5 transition-all duration-200 inline-block">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/support" className="text-sm text-muted-foreground hover:text-foreground hover:translate-x-0.5 transition-all duration-200 inline-block">
                    Support
                  </Link>
                </li>
                <li>
                  <Link href="/account-deletion" className="text-sm text-muted-foreground hover:text-foreground hover:translate-x-0.5 transition-all duration-200 inline-block">
                    Delete account &amp; data
                  </Link>
                </li>
              </ul>
            </div>

            {/* Community */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2">
                <Users size={14} className="text-primary" aria-hidden="true" />
                Community
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We welcome developers, linguists, and community members. Every contribution helps build the platform.
              </p>
              <a
                href="https://github.com/australia/mobtranslate.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-primary hover:text-primary/80 hover:translate-x-0.5 transition-all duration-200"
              >
                <Code size={14} />
                Contribute on GitHub
              </a>
              <p className="text-sm text-muted-foreground leading-relaxed mt-4">
                Get in touch:{' '}
                <ContactEmailLink className="text-primary font-medium hover:text-primary/80" />
              </p>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="py-6 border-t border-border/40">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
              <p>&copy; {new Date().getFullYear()} Mob Translate. Application code: MIT License.</p>
              <p>Source terms vary · Research translations unverified</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
