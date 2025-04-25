import './globals.css';
import { ReactNode } from 'react';
import { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import { Analytics } from "@vercel/analytics/react";

// Load fonts
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

export const metadata: Metadata = {
  title: 'Mob Translate | Indigenous Language Translation',
  description: 'Open-source ecosystem for preserving and translating indigenous languages',
  keywords: 'indigenous languages, translation, aboriginal languages, language preservation',
  authors: [{ name: 'Mob Translate Community' }],
  openGraph: {
    title: 'Mob Translate | Indigenous Language Translation',
    description: 'Open-source ecosystem for preserving and translating indigenous languages',
    url: 'https://mobtranslate.com',
    siteName: 'Mob Translate',
    locale: 'en_AU',
    type: 'website',
  },
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable}`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-[url('/images/pattern-bg-light.svg')] bg-fixed bg-cover font-sans antialiased">
        <div className="relative flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
