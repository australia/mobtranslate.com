import type { Metadata } from 'next';
import { SidebarNav } from '../components/sidebar-nav';
import { PageOutline } from '../components/page-outline';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mobtranslate UI — Design System',
  description: 'Component library and design system for Mobtranslate',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <div className="flex min-h-screen">
          <SidebarNav />
          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 p-4 md:p-8 max-w-5xl max-md:pt-20">{children}</main>
          <PageOutline />
        </div>
      </body>
    </html>
  );
}
