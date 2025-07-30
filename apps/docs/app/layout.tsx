import React from 'react'
import type { Metadata } from 'next'
import { DocLayout } from '../components/DocLayout'
import './globals.css'

export const metadata: Metadata = {
  title: 'MobTranslate Documentation',
  description: 'Documentation for MobTranslate - Preserving Indigenous Languages Through Technology',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <DocLayout>{children}</DocLayout>
      </body>
    </html>
  )
}