import './globals.css';
import { ReactNode } from 'react';
import { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/layout/Toaster';

// Load fonts
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Mob Translate | Indigenous Language Translation',
  description: 'Open-source ecosystem for learning and translating indigenous languages',
  keywords: 'indigenous languages, translation, aboriginal languages, language learning',
  authors: [{ name: 'Mob Translate Community' }],
  openGraph: {
    title: 'Mob Translate | Indigenous Language Translation',
    description: 'Open-source ecosystem for learning and translating indigenous languages',
    url: 'https://mobtranslate.com',
    siteName: 'Mob Translate',
    locale: 'en_AU',
    type: 'website',
  },
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Mob Translate' },
};

// device-width + viewport-fit=cover so full-screen recording UIs clear the
// notch / home indicator; safe-area insets are then usable in CSS.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#b45e2a',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${inter.variable} ${playfairDisplay.variable}`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <AuthProvider>
          <div className="relative flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
          </div>
          <Toaster />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
