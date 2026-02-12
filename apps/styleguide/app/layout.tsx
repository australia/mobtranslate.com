import type { Metadata } from 'next';
import { SidebarNav } from '../components/sidebar-nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mobtranslate UI — Design System',
  description: 'Component library and design system for Mobtranslate',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <SidebarNav />
          <main className="flex-1 p-4 md:p-8 max-w-5xl max-md:pt-16">{children}</main>
        </div>
      </body>
    </html>
  );
}
