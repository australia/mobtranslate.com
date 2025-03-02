'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { Menu, X, Sun, Moon, Github, Heart } from 'lucide-react';
import { cn } from '../lib/utils';

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
    { title: 'Home', href: '/' },
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
              className="flex items-center space-x-2 font-serif font-bold text-2xl sm:text-3xl text-primary hover:opacity-90 transition-all"
            >
              <div className="w-10 h-10 rounded-full aboriginal-gradient flex items-center justify-center text-white mr-2">
                <span className="text-lg font-bold">MT</span>
              </div>
              <span className="hidden sm:inline tracking-tight">Mob Translate</span>
            </Link>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  className="text-foreground hover:text-primary transition-colors font-medium"
                >
                  {link.title}
                </Link>
              ))}
              
              {/* Dark Mode Toggle */}
              <button 
                onClick={toggleDarkMode}
                className="p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition-colors"
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </nav>
            
            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-2">
              <button 
                onClick={toggleDarkMode}
                className="p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition-colors"
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button
                onClick={toggleMenu}
                className="p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition-colors"
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
            <nav className="container-custom py-4 flex flex-col gap-4 border-t animate-fade-in">
              {navLinks.map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  className="text-foreground hover:text-primary transition-colors font-medium py-3 px-2 rounded-md hover:bg-muted/50"
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
      <footer className="w-full border-t py-12 bg-muted/30">
        <div className="container-custom">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* About */}
            <div>
              <h3 className="text-xl font-semibold mb-4">About Mob Translate</h3>
              <p className="text-muted-foreground leading-relaxed">
                A community-driven project dedicated to preserving and promoting 
                Australian Aboriginal languages through accessible translation tools.
              </p>
            </div>
            
            {/* Quick Links */}
            <div>
              <h3 className="text-xl font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-3">
                {navLinks.map((link) => (
                  <li key={link.title}>
                    <Link
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center"
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-2"></span>
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Connect */}
            <div>
              <h3 className="text-xl font-semibold mb-4">Connect</h3>
              <div className="flex items-center gap-4">
                <a 
                  href="https://github.com/australia/mobtranslate.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-foreground/5 hover:bg-foreground/10 text-primary rounded-full transition-colors"
                  aria-label="GitHub Repository"
                >
                  <Github size={22} />
                </a>
                <a 
                  href="https://github.com/australia/mobtranslate.com/stargazers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-foreground/5 hover:bg-foreground/10 text-primary rounded-full transition-colors"
                  aria-label="Star on GitHub"
                >
                  <Heart size={22} />
                </a>
              </div>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Contribute to our open-source project and help us improve translations for
                Aboriginal languages.
              </p>
            </div>
          </div>
          
          <div className="mt-10 pt-8 border-t text-center text-muted-foreground">
            <p>
              &copy; {new Date().getFullYear()} Mob Translate. All rights reserved.
            </p>
            <p className="mt-3 text-sm max-w-2xl mx-auto">
              This project acknowledges the Traditional Owners of the lands on which we work and live.
              We pay our respects to Elders past, present and emerging.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}