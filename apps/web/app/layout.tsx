import './globals.css';
import { ReactNode } from 'react';
import { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/layout/Toaster';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';

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
  metadataBase: new URL('https://mobtranslate.com'),
  title: {
    default: 'Mob Translate — Indigenous language dictionaries, translation & voice',
    template: '%s | Mob Translate',
  },
  description:
    "Open-source dictionaries, AI translation and pronunciation for Australian First Nations languages — Kuku Yalanji, Anindilyakwa, Wajarri, Mi'gmaq and more.",
  applicationName: 'Mob Translate',
  keywords: [
    'indigenous languages', 'aboriginal languages', 'first nations languages', 'translation',
    'dictionary', 'Kuku Yalanji', 'Anindilyakwa', 'Wajarri', "Mi'gmaq", 'language learning',
    'language revitalisation',
  ],
  authors: [{ name: 'Mob Translate Community' }],
  creator: 'Mob Translate Community',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Mob Translate — Indigenous language dictionaries, translation & voice',
    description:
      'Open-source dictionaries, AI translation and pronunciation for Australian First Nations languages.',
    url: 'https://mobtranslate.com',
    siteName: 'Mob Translate',
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mob Translate',
    description:
      'Open-source dictionaries, AI translation and pronunciation for Australian First Nations languages.',
  },
  robots: { index: true, follow: true },
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
        <GoogleAnalytics />
      </body>
    </html>
  );
}
