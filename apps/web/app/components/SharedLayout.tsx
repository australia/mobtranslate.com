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
      if (localStorage.getItem('darkMode') === 'true' || 
          (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && 
          localStorage.getItem('darkMode') === null)) {
        setIsDarkMode(true);
        document.documentElement.classList.add('dark');
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
          "sticky top-0 z-50 w-full border-b transition-all duration-200",
          isScrolled ? "bg-background/95 backdrop-blur-md shadow-sm" : "bg-background"
        )}
      >
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link 
              href="/" 
              className="flex items-center space-x-2 font-bold text-2xl text-primary hover:opacity-90 transition-opacity"
            >
              <span className="hidden sm:inline">Mob Translate</span>
              <span className="inline sm:hidden">MT</span>
            </Link>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6">
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
                className="p-2 rounded-md text-foreground hover:bg-muted transition-colors"
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </nav>
            
            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-2">
              <button 
                onClick={toggleDarkMode}
                className="p-2 rounded-md text-foreground hover:bg-muted transition-colors"
                aria-label="Toggle dark mode"
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
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-4 border-t">
              {navLinks.map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  className="text-foreground hover:text-primary transition-colors font-medium py-2"
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
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
      
      {/* Footer */}
      <footer className="w-full border-t py-8 bg-muted">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* About */}
            <div>
              <h3 className="text-lg font-semibold mb-4">About Mob Translate</h3>
              <p className="text-muted-foreground">
                A community-driven project dedicated to preserving and promoting 
                Australian Aboriginal languages through accessible translation tools.
              </p>
            </div>
            
            {/* Quick Links */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-2">
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
            
            {/* Connect */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Connect</h3>
              <div className="flex items-center gap-4">
                <a 
                  href="https://github.com/australia/mobtranslate.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  aria-label="GitHub Repository"
                >
                  <Github size={24} />
                </a>
                <a 
                  href="https://github.com/australia/mobtranslate.com/stargazers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  aria-label="Star on GitHub"
                >
                  <Heart size={24} />
                </a>
              </div>
              <p className="mt-4 text-muted-foreground">
                Contribute to our open-source project and help us improve translations for
                Aboriginal languages.
              </p>
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t text-center text-muted-foreground">
            <p>
              &copy; {new Date().getFullYear()} Mob Translate. All rights reserved.
            </p>
            <p className="mt-2 text-sm">
              This project acknowledges the Traditional Owners of the lands on which we work and live.
              We pay our respects to Elders past, present and emerging.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}