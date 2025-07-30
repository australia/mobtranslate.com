'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'
import { TableOfContents } from './TableOfContents'

interface NavSection {
  title: string
  items: Array<{
    title: string
    href: string
  }>
}

const navigation: NavSection[] = [
  {
    title: 'Get started',
    items: [
      { title: 'What is MobTranslate?', href: '/' },
      { title: 'Installation', href: '/getting-started' },
      { title: 'FAQ', href: '/faq' },
    ]
  },
  {
    title: 'Core concepts',
    items: [
      { title: 'Languages', href: '/languages' },
      { title: 'Words & Phrases', href: '/words-phrases' },
      { title: 'API Reference', href: '/api' },
      { title: 'Architecture', href: '/architecture' },
    ]
  },
  {
    title: 'Integration guides',
    items: [
      { title: 'Common examples', href: '/examples' },
      { title: 'Using with React', href: '/react' },
      { title: 'Using with Next.js', href: '/nextjs' },
    ]
  }
]

export function DocLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#ffffff' }}>
      {/* Top navigation bar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b" style={{ borderColor: '#eaeaea' }}>
        <div className="flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl font-bold">MOBTRANSLATE</span>
              <span className="bg-yellow-300 text-black px-2 py-0.5 text-sm font-bold rounded">DOC</span>
            </Link>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-sm text-gray-700 hover:text-black">Docs</Link>
            <Link href="https://github.com/australia/mobtranslate.com" className="text-sm text-gray-700 hover:text-black">GitHub</Link>
            <Link href="/community" className="text-sm text-gray-700 hover:text-black">Community</Link>
            <Link href="/blog" className="text-sm text-gray-700 hover:text-black">Blog</Link>
            <button className="text-sm text-gray-700 hover:text-black">Try →</button>
            <button className="text-gray-700 hover:text-black">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </nav>
        </div>
      </header>

      <div className="flex pt-16">
        {/* Sidebar */}
        <aside className="fixed left-0 top-16 bottom-0 w-64 overflow-y-auto bg-white border-r" style={{ borderColor: '#eaeaea' }}>
          <nav className="p-6">
            {navigation.map((section, sectionIndex) => (
              <div key={section.title} className={sectionIndex > 0 ? 'mt-8' : ''}>
                <h3 className="font-semibold text-sm mb-2" style={{ color: '#000' }}>
                  {section.title}
                </h3>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block text-sm py-1 transition-colors ${
                          pathname === item.href
                            ? 'text-blue-600 font-medium'
                            : 'text-gray-700 hover:text-gray-900'
                        }`}
                        style={{
                          textDecoration: pathname === item.href ? 'underline' : 'none',
                          textUnderlineOffset: '3px'
                        }}
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 ml-64">
          <div className="flex">
            {/* Article content */}
            <main className="flex-1 px-8 py-12 max-w-3xl">
              <article className="prose prose-lg max-w-none">
                {children}
              </article>
            </main>

            {/* Right sidebar (table of contents) */}
            <aside className="hidden xl:block w-64 px-8 py-12">
              <div className="sticky top-24">
                <h4 className="text-sm font-semibold mb-4 text-gray-900">On this page</h4>
                <TableOfContents />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}