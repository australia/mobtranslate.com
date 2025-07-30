'use client'

import React, { useEffect, useState } from 'react'

interface TOCItem {
  id: string
  text: string
  level: number
}

export function TableOfContents() {
  const [headings, setHeadings] = useState<TOCItem[]>([])
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    const elements = document.querySelectorAll('article h2, article h3')
    const items: TOCItem[] = []
    
    elements.forEach((element) => {
      const id = element.id || element.textContent?.toLowerCase().replace(/\s+/g, '-') || ''
      if (!element.id) {
        element.id = id
      }
      
      items.push({
        id,
        text: element.textContent || '',
        level: parseInt(element.tagName[1])
      })
    })
    
    setHeadings(items)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      {
        rootMargin: '-100px 0px -66% 0px'
      }
    )

    const elements = document.querySelectorAll('article h2, article h3')
    elements.forEach((element) => observer.observe(element))

    return () => {
      elements.forEach((element) => observer.unobserve(element))
    }
  }, [headings])

  if (headings.length === 0) return null

  return (
    <nav className="space-y-2">
      {headings.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          className={`block text-sm transition-colors ${
            heading.level === 3 ? 'pl-4' : ''
          } ${
            activeId === heading.id
              ? 'text-blue-600 font-medium'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {heading.text}
        </a>
      ))}
    </nav>
  )
}