'use client';

import React from 'react';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';

export default function DictionariesPage() {
  return (
    <SharedLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Aboriginal Language Dictionaries</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow border">
            <h2 className="text-xl font-semibold mb-2">Kuku Yalanji</h2>
            <p className="text-muted-foreground mb-4">
              Explore the Kuku Yalanji language, traditionally spoken in the rainforest regions of Far North Queensland.
            </p>
            <Link 
              href="/dictionaries/kuku_yalanji" 
              className="inline-flex items-center text-primary hover:underline"
            >
              Browse Dictionary
              <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          
          <div className="bg-card rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow border opacity-70">
            <h2 className="text-xl font-semibold mb-2">More Coming Soon</h2>
            <p className="text-muted-foreground mb-4">
              We're working on adding more Aboriginal language dictionaries to our collection. Check back soon!
            </p>
          </div>
        </div>
        
        <div className="mt-12 bg-muted p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Contribute to Our Dictionaries</h2>
          <p className="mb-4">
            Help us expand our collection of Aboriginal language dictionaries. If you have knowledge of an Aboriginal 
            language or access to resources, consider contributing to our open-source project.
          </p>
          <a 
            href="https://github.com/australia/mobtranslate.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            Contribute on GitHub
          </a>
        </div>
      </div>
    </SharedLayout>
  );
}
