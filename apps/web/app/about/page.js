'use client';

import Link from 'next/link';
import { Github, Mail, Twitter } from 'lucide-react';
import SharedLayout from '../components/SharedLayout';

export default function About() {
  return (
    <SharedLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="bg-card shadow-md rounded-md border border-border overflow-hidden">
          <div className="p-6 sm:p-8">
            <h1 className="text-2xl font-medium text-foreground mb-6">About Mob Translate</h1>
            
            <div className="mb-6">
              <p className="text-foreground leading-relaxed mb-4">
                Mob Translate is a community-driven project aimed at creating translation tools for Australian Aboriginal languages.
                Our mission is to make language preservation and learning accessible to all through open-source technology.
              </p>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-medium text-foreground mb-3">
                Project Goals
              </h2>
              <ul className="list-disc pl-6 space-y-2 text-foreground">
                <li>Create an open-source ecosystem for indigenous language translation</li>
                <li>Build a "Google Translate" equivalent for Australian Aboriginal languages</li>
                <li>Preserve and promote indigenous languages through technology</li>
                <li>Foster community collaboration in language documentation</li>
              </ul>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-medium text-foreground mb-3">
                Current Features
              </h2>
              <ul className="list-disc pl-6 space-y-2 text-foreground">
                <li>Dictionary support for multiple indigenous languages</li>
                <li>Modern, accessible web interface</li>
                <li>Community contribution system</li>
                <li>Integration with language learning tools</li>
              </ul>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-medium text-foreground mb-3">
                About the Creator
              </h2>
              <div className="bg-muted p-5 rounded-md border border-border">
                <h3 className="text-lg font-medium text-foreground mb-2">Thomas Davis</h3>
                <p className="text-foreground leading-relaxed mb-4">
                  Thomas Davis is a passionate developer and advocate for indigenous language preservation. 
                  With a background in web development and a commitment to open-source projects, 
                  Thomas created Mob Translate to help preserve and promote Aboriginal languages through technology.
                </p>
                <div className="flex flex-wrap gap-3 mt-3">
                  <a 
                    href="mailto:thomasalwyndavis@gmail.com" 
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-background text-foreground rounded border border-border text-sm hover:bg-muted/80 transition-colors duration-200"
                  >
                    <Mail size={14} className="text-primary" />
                    <span>thomasalwyndavis@gmail.com</span>
                  </a>
                  <a 
                    href="https://twitter.com/ajaxdavis" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-background text-foreground rounded border border-border text-sm hover:bg-muted/80 transition-colors duration-200"
                  >
                    <Twitter size={14} className="text-primary" />
                    <span>@ajaxdavis</span>
                  </a>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <h2 className="text-xl font-medium text-foreground mb-3">
                Get Involved
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                We welcome contributions from developers, linguists, and community members. Visit our{' '}
                <Link 
                  href="https://github.com/australia/mobtranslate.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 transition-colors duration-200 underline"
                >
                  GitHub repository
                </Link>
                {' '}to learn how you can help make indigenous language translation more accessible.
              </p>
              <div className="mt-4">
                <a 
                  href="https://github.com/australia/mobtranslate.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded font-medium shadow-sm hover:bg-primary/90 transition-colors duration-200"
                >
                  <Github size={16} />
                  <span>Contribute on GitHub</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SharedLayout>
  );
}
