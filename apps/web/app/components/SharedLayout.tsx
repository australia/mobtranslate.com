'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { Menu, X, Sun, Moon, Github, Heart } from 'lucide-react';
import { cn, Button } from '@mobtranslate/ui';
import { ModernNav } from '@/components/navigation/ModernNav';

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
  const [_isScrolled, setIsScrolled] = useState<boolean>(false);

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
    { title: 'Dictionaries', href: '/dictionaries' },
    { title: 'Education', href: '/education' },
    { title: 'Contribute', href: 'https://github.com/australia/mobtranslate.com', external: true }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header - Remove scroll effects, simplify background */}
      <header 
        className={cn(
          "sticky top-0 z-50 w-full border-b shadow-sm transition-all duration-300 bg-background/95 backdrop-blur-sm"
        )}
      >
        <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
          <div className="flex h-20 sm:h-24 items-center justify-between">
            {/* Logo - Update font */}
            <Link
              href="/"
              className="flex items-center space-x-3 text-xl sm:text-2xl md:text-3xl font-bold text-foreground hover:text-primary transition-all shrink-0"
            >
              <span className="bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent whitespace-nowrap">Mob Translate</span>
            </Link>
            
            {/* Desktop Navigation - Simplify hover effect */}
            <nav className="hidden md:flex items-center gap-6 lg:gap-10">
              {navLinks.map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  className="text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.title}
                </Link>
              ))}
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  onClick={toggleDarkMode}
                  className="p-2.5"
                  aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </Button>
                <ModernNav />
              </div>
            </nav>
            
            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-2">
              <ModernNav />
              <Button
                variant="ghost"
                onClick={toggleDarkMode}
                className="p-2"
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </Button>
              <Button
                variant="ghost"
                onClick={toggleMenu}
                className="p-2"
                aria-label="Toggle menu"
              >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </Button>
            </div>
          </div>
        </div> {/* <-- Added this closing tag */}
        
        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden">
            <nav className="container-custom py-4 flex flex-col gap-2 border-t animate-fade-in">
              {navLinks.map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  className="text-foreground hover:text-primary transition-colors font-medium py-2 px-3 rounded-md hover:bg-muted/50"
                  onClick={toggleMenu}
                >
                  {link.title}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>
      
      {/* Main Content - Apply max-width and center */}
      <main className="flex-1 mx-auto max-w-[1920px] 2xl:max-w-[2200px] px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-6 sm:py-8 lg:py-12">
        {children}
      </main>
      
      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-muted/30">
        <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
          {/* Main footer content */}
          <div className="py-12 grid grid-cols-1 md:grid-cols-4 gap-10">
            {/* Brand */}
            <div className="md:col-span-1">
              <Link href="/" className="text-xl font-bold">
                <span className="bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent">Mob Translate</span>
              </Link>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                Open-source translation tools for Indigenous languages. Built with respect, powered by community.
              </p>
              <div className="flex items-center gap-3 mt-4">
                <a
                  href="https://github.com/australia/mobtranslate.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                  aria-label="GitHub Repository"
                >
                  <Github size={18} />
                </a>
                <a
                  href="https://twitter.com/ajaxdavis"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                  aria-label="Twitter"
                >
                  <Heart size={18} />
                </a>
              </div>
            </div>

            {/* Navigation */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Explore</h3>
              <ul className="space-y-2.5">
                {navLinks.map((link) => (
                  <li key={link.title}>
                    <Link
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Resources</h3>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/styleguide" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Style Guide
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/australia/mobtranslate.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Source Code
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/australia/mobtranslate.com/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Report an Issue
                  </a>
                </li>
              </ul>
            </div>

            {/* Community */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Community</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We welcome developers, linguists, and community members. Every contribution helps preserve a language.
              </p>
              <a
                href="https://github.com/australia/mobtranslate.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <Github size={14} />
                Contribute on GitHub
              </a>
            </div>
          </div>

          {/* Acknowledgement + Copyright */}
          <div className="py-6 border-t border-border/50">
            <p className="text-xs text-muted-foreground leading-relaxed mb-4 max-w-3xl">
              We acknowledge the Traditional Owners of the languages represented on this platform
              and pay our respects to Elders past, present, and emerging. We recognise that sovereignty
              was never ceded.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
              <p>{new Date().getFullYear()} Mob Translate. Open source under MIT License.</p>
              <p>Made with care for language preservation.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}