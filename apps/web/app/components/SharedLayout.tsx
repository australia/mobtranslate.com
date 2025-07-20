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
}

export default function SharedLayout({ children }: SharedLayoutProps) {
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
    { title: 'Dictionaries', href: '/dictionaries' },
    { title: 'Contribute', href: 'https://github.com/australia/mobtranslate.com', external: true }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header 
        className={cn(
          "sticky top-0 z-50 w-full border-b transition-all duration-300",
          isScrolled 
            ? "bg-background/95 backdrop-blur-md shadow-sm" 
            : "bg-background"
        )}
      >
        <div className="container-custom">
          <div className="flex h-16 sm:h-20 items-center justify-between">
            {/* Logo */}
            <Link 
              href="/" 
              className="flex items-center space-x-2 text-xl sm:text-2xl text-primary hover:text-primary/90 transition-all font-roboto font-medium"
            >
              <div className="w-10 h-10 rounded bg-primary flex items-center justify-center text-white">
                <span className="font-medium">MT</span>
              </div>
              <span className="hidden sm:inline">Mob Translate</span>
            </Link>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  className="relative text-foreground hover:text-primary transition-colors group"
                >
                  <span className="relative z-10">{link.title}</span>
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary group-hover:w-full transition-all duration-300"></span>
                </Link>
              ))}
              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-full bg-muted hover:bg-primary/20 text-foreground transition-colors transform hover:rotate-12 duration-300"
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <ModernNav />
            </nav>
            
            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-2">
              <ModernNav />
              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-md text-foreground hover:bg-muted transition-colors"
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
        </div>
        
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
      
      {/* Main Content */}
      <main className="flex-1 container-custom py-8 sm:py-12">
        {children}
      </main>
      
      {/* Footer */}
      <footer className="mt-auto py-8 border-t border-border bg-secondary/20">
        <div className="container-custom">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* About */}
            <div>
              <h3 className="text-lg font-medium mb-4">About Mob Translate</h3>
              <p className="text-muted-foreground leading-relaxed">
                A community-driven project dedicated to preserving and promoting 
                Australian Aboriginal languages through accessible translation tools.
              </p>
              <p className="mt-4 text-muted-foreground">
                Built by Thomas Davis. You can reach him at:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <a href="mailto:thomasalwyndavis@gmail.com" className="text-primary hover:text-primary/80 transition-all duration-200 underline">
                  thomasalwyndavis@gmail.com
                </a>
              </div>
              <div className="mt-2">
                <a href="https://twitter.com/ajaxdavis" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-all duration-200 underline">
                  @ajaxdavis on Twitter
                </a>
              </div>
            </div>
            
            {/* Quick Links */}
            <div>
              <h3 className="text-lg font-medium mb-4">Quick Links</h3>
              <ul className="space-y-3">
                {navLinks.map((link) => (
                  <li key={link.title}>
                    <Link
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center group"
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-2 group-hover:opacity-80 transition-opacity"></span>
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Connect */}
            <div>
              <h3 className="text-lg font-medium mb-4">Connect</h3>
              <div className="flex items-center gap-4">
                <a 
                  href="https://github.com/australia/mobtranslate.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-foreground/5 hover:bg-primary/10 text-primary rounded transition-colors"
                  aria-label="GitHub Repository"
                >
                  <Github size={20} />
                </a>
                <a 
                  href="https://github.com/australia/mobtranslate.com/stargazers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-foreground/5 hover:bg-primary/10 text-primary rounded transition-colors"
                  aria-label="Star on GitHub"
                >
                  <Heart size={20} />
                </a>
              </div>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Contribute to our open-source project and help us improve translations for
                Aboriginal languages.
              </p>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-border/30 text-center text-muted-foreground">
            <p className="font-inter">
              {new Date().getFullYear()} Mob Translate
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}