import './globals.css';
import { ReactNode } from 'react';
import { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/layout/Toaster';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { SHARE_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, X_HANDLE } from '@/lib/seo';

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
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'indigenous languages', 'aboriginal languages', 'first nations languages', 'translation',
    'dictionary', 'Kuku Yalanji', 'Wajarri', 'Anindilyakwa', "Mi'gmaq", 'language learning',
    'language revitalisation',
  ],
  authors: [{ name: 'Mob Translate Community' }],
  creator: 'Mob Translate Community',
  // No canonical here: it would be inherited, and every page without its own
  // would tell search engines it is a copy of the homepage.
  openGraph: {
    siteName: SITE_NAME,
    locale: 'en_AU',
    type: 'website',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    site: X_HANDLE,
    creator: X_HANDLE,
    images: [{ url: SHARE_IMAGE.url, alt: SHARE_IMAGE.alt }],
  },
  robots: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: SITE_NAME },
  formatDetection: { telephone: false },
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
    <html lang="en-AU" className={`${inter.variable} ${playfairDisplay.variable}`} suppressHydrationWarning>
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
        <GoogleAnalytics />
      </body>
    </html>
  );
}
