'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { Menu, X, Sun, Moon, Github, Heart } from 'lucide-react';
import { cn } from '../lib/utils';
import { ModernNav } from '@/components/navigation/ModernNav';

interface NavLink {
  title: string;
  href: string;
  external?: boolean;
}

interface SharedLayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
}

export default function SharedLayout({ children, fullWidth = false }: SharedLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    
    // Check user preference for dark mode
    if (typeof window !== 'undefined') {
      // Default to light mode but respect user's saved preference
      const savedMode = localStorage.getItem('darkMode');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      
      if (savedMode === 'true' || (prefersDark && savedMode === null)) {
        setIsDarkMode(true);
        document.documentElement.classList.add('dark');
      } else {
        // Ensure light mode is applied
        document.documentElement.classList.remove('dark');
      }
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
    { title: 'History', href: '/history' },
    { title: 'Dictionaries', href: '/dictionaries' },
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
        <div className={cn(
          "mx-auto",
          fullWidth ? "max-w-[1920px] 2xl:max-w-[2200px] px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16" : "container-custom max-w-[800px]"
        )}>
          <div className="flex h-20 sm:h-24 items-center justify-between">
            {/* Logo - Update font */}
            <Link 
              href="/" 
              className="flex items-center space-x-3 text-2xl sm:text-3xl font-bold text-foreground hover:text-primary transition-all"
            >
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Mob Translate</span>
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
                <button
                  onClick={toggleDarkMode}
                  className="p-2.5 rounded-lg hover:bg-muted transition-colors"
                  aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </button>
                <ModernNav />
              </div>
            </nav>
            
            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-2">
              <ModernNav />
              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-md "
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button 
                onClick={toggleMenu}
                className="p-2 rounded-md text-foreground hover:bg-muted transition-colors"
                aria-label="Toggle menu"
              >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
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
      <main className={cn(
        "flex-1 mx-auto",
        fullWidth ? "max-w-full py-6 sm:py-8 lg:py-12" : "container-custom py-8 sm:py-12 max-w-[800px]"
      )}>
        {children}
      </main>
      
      {/* Footer - Remove background, simplify elements */}
      <footer className="mt-auto py-8 border-t border-border">
        <div className="container-custom max-w-[800px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* About */}
            <div>
              <h3 className="text-lg font-medium mb-4">About Mob Translate</h3>
              <p className="text-muted-foreground leading-relaxed">
                A community-driven project dedicated to preserving and promoting 
                Indigenous languages worldwide through accessible translation tools.
              </p>
              <div className="mt-4">
                <a href="https://twitter.com/ajaxdavis" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-all duration-200 underline inline-flex items-center gap-1">
                  Contact via @ajaxdavis on Twitter
                </a>
              </div>
            </div>
            
            {/* Quick Links - Simplify link style */}
            <div>
              <h3 className="text-lg font-medium mb-4">Quick Links</h3>
              <ul className="space-y-3">
                {navLinks.map((link) => (
                  <li key={link.title}>
                    <Link
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Connect - Simplify button style */}
            <div>
              <h3 className="text-lg font-medium mb-4">Connect</h3>
              <div className="flex items-center gap-4">
                <a 
                  href="https://github.com/australia/mobtranslate.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-primary hover:text-primary/80 transition-colors"
                  aria-label="GitHub Repository"
                >
                  <Github size={20} />
                </a>
                <a 
                  href="https://github.com/australia/mobtranslate.com/stargazers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-primary hover:text-primary/80 transition-colors"
                  aria-label="Star on GitHub"
                >
                  <Heart size={20} />
                </a>
              </div>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Contribute to our open-source project and help us improve translations for
                Indigenous languages worldwide.
              </p>
            </div>
          </div>
          
          {/* Update font */}
          <div className="mt-8 pt-6 border-t border-border/30 text-center text-muted-foreground">
            <p className="font-space-grotesk">
              {new Date().getFullYear()} Mob Translate
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}