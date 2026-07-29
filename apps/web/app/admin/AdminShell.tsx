'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, ChevronLeft, FileCheck, FileText, Headphones, Home, Languages, MessageSquare, Mic, RefreshCw, Settings, Shield, Users } from 'lucide-react';
import { cn } from '@mobtranslate/ui';

const adminNavItems = [
  { title: 'Overview', href: '/admin', icon: Home, description: 'Platform overview', globalOnly: true },
  { title: 'Users', href: '/admin/users', icon: Users, description: 'Manage users and roles', globalOnly: true },
  { title: 'Curator Dashboard', href: '/curator', icon: FileCheck, description: 'Review submissions' },
  { title: 'Languages', href: '/admin/languages', icon: Languages, description: 'Manage assigned languages' },
  { title: 'Recording Studio', href: '/admin/recordings', icon: Mic, description: 'Capture speaker audio' },
  { title: 'Recording Library', href: '/admin/recordings/library', icon: Headphones, description: 'Browse recordings' },
  { title: 'Explore', href: '/admin/explore', icon: MessageSquare, description: 'Translations and voice clips', globalOnly: true },
  { title: 'Analytics', href: '/admin/analytics', icon: BarChart3, description: 'Platform analytics', globalOnly: true },
  { title: 'Documents', href: '/admin/documents', icon: FileText, description: 'Source document register' },
  { title: 'Dictionary Sync', href: '/admin/dictionary-sync', icon: RefreshCw, description: 'Global sync control', globalOnly: true },
  { title: 'Settings', href: '/admin/settings', icon: Settings, description: 'System configuration', globalOnly: true },
] as const;

export default function AdminShell({ children, isSuperAdmin, isLanguageManager }: { children: ReactNode; isSuperAdmin: boolean; isLanguageManager: boolean }) {
  const pathname = usePathname();
  if (pathname === '/admin/recordings') return <>{children}</>;
  const visibleItems = adminNavItems.filter((item) => isSuperAdmin || (isLanguageManager && !('globalOnly' in item && item.globalOnly)));

  return (
    <div className="min-h-screen bg-muted">
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ChevronLeft className="h-4 w-4" />Back to site</Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /><span className="hidden text-lg font-semibold sm:inline">{isSuperAdmin ? 'Admin Panel' : isLanguageManager ? 'Language Manager' : 'Administration'}</span><span className="font-semibold sm:hidden">{isSuperAdmin ? 'Admin' : isLanguageManager ? 'Manager' : 'Admin'}</span></div>
        </div>
      </header>

      <div className="flex min-w-0 flex-col md:flex-row">
        {visibleItems.length > 0 ? <aside className="w-full border-b border-border bg-card md:min-h-[calc(100vh-4rem)] md:w-64 md:shrink-0 md:border-b-0 md:border-r">
          <nav className="flex gap-1 overflow-x-auto p-3 md:block md:space-y-1 md:p-4">{visibleItems.map((item) => <AdminNavLink key={item.href} item={item} />)}</nav>
        </aside> : null}
        <main className="min-w-0 flex-1 p-4 sm:p-6"><div className="mx-auto max-w-7xl">{children}</div></main>
      </div>
    </div>
  );
}

function AdminNavLink({ item }: { item: (typeof adminNavItems)[number] }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
  const Icon = item.icon;
  return <Link href={item.href} className={cn('flex min-w-max items-center gap-2 rounded-lg px-3 py-2 transition-all hover:bg-muted md:min-w-0 md:items-start md:gap-3', isActive && 'bg-primary/10 text-primary hover:bg-primary/20')}><Icon className={cn('h-5 w-5 flex-shrink-0 md:mt-0.5', isActive ? 'text-primary' : 'text-muted-foreground')} /><div className="min-w-0 flex-1"><p className={cn('text-sm font-medium', isActive ? 'text-primary' : 'text-foreground')}>{item.title}</p><p className="hidden truncate text-xs text-muted-foreground md:block">{item.description}</p></div></Link>;
}
