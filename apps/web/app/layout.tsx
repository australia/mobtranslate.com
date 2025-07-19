import './globals.css';
import { ReactNode } from 'react';
import { Metadata } from 'next';
import { Inter, Poppins } from 'next/font/google';
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from '@/contexts/AuthContext';

// Load fonts
const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap'
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
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link 
          rel="preconnect" 
          href="https://fonts.gstatic.com" 
          crossOrigin="anonymous" 
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Libre+Bodoni:ital,wght@0,400..700;1,400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[url('/images/pattern-bg-light.svg')] bg-fixed bg-cover font-sans antialiased">
        <AuthProvider>
          <div className="relative flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
          </div>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
