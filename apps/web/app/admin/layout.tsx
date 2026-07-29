'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Users, 
  Shield, 
  FileCheck, 
  Languages, 
  Settings,
  BarChart3,
  FileText,
  Home,
  ChevronLeft,
  RefreshCw,
  Mic,
  Headphones,
  MessageSquare
} from 'lucide-react';
import { cn } from '@mobtranslate/ui';

interface AdminLayoutProps {
  children: ReactNode;
}

const adminNavItems = [
  {
    title: 'Overview',
    href: '/admin',
    icon: Home,
    description: 'Admin dashboard home'
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: Users,
    description: 'Manage users and roles'
  },
  {
    title: 'Curator Dashboard',
    href: '/curator',
    icon: FileCheck,
    description: 'Review submissions'
  },
  {
    title: 'Languages',
    href: '/admin/languages',
    icon: Languages,
    description: 'Manage language settings'
  },
  {
    title: 'Recording Studio',
    href: '/admin/recordings',
    icon: Mic,
    description: 'Capture speaker audio'
  },
  {
    title: 'Recording Library',
    href: '/admin/recordings/library',
    icon: Headphones,
    description: 'Browse & play all recordings'
  },
  {
    title: 'Explore',
    href: '/admin/explore',
    icon: MessageSquare,
    description: 'Translations, chats & voice clips'
  },
  {
    title: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart3,
    description: 'View system analytics'
  },
  {
    title: 'Documents',
    href: '/admin/documents',
    icon: FileText,
    description: 'Manage uploaded documents'
  },
  {
    title: 'Dictionary Sync',
    href: '/admin/dictionary-sync',
    icon: RefreshCw,
    description: 'YAML and DB sync control'
  },
  {
    title: 'Settings',
    href: '/admin/settings',
    icon: Settings,
    description: 'System configuration'
  }
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();

  // The recording studio is an immersive, full-screen tool with its own
  // topbar — render it bare, outside the admin sidebar chrome.
  if (pathname === '/admin/recordings') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-muted">
      {/* Admin Header */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link 
            href="/" 
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to site
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="hidden text-lg font-semibold sm:inline">Admin Panel</span>
            <span className="font-semibold sm:hidden">Admin</span>
          </div>
        </div>
      </header>

      <div className="flex min-w-0 flex-col md:flex-row">
        {/* Sidebar Navigation */}
        <aside className="w-full border-b border-border bg-card md:min-h-[calc(100vh-4rem)] md:w-64 md:shrink-0 md:border-b-0 md:border-r">
          <nav className="flex gap-1 overflow-x-auto p-3 md:block md:space-y-1 md:p-4">
            {adminNavItems.map((item) => (
              <AdminNavLink key={item.href} {...item} />
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function AdminNavLink({ href, icon: Icon, title, description }: typeof adminNavItems[0]) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/admin' && pathname?.startsWith(href));

  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-max items-center gap-2 rounded-lg px-3 py-2 transition-all md:min-w-0 md:items-start md:gap-3",
        "hover:bg-muted",
        isActive && "bg-primary/10 text-primary hover:bg-primary/20"
      )}
    >
      <Icon className={cn(
        "h-5 w-5 flex-shrink-0 md:mt-0.5",
        isActive ? "text-primary" : "text-muted-foreground"
      )} />
      <div className="min-w-0 flex-1">
        <p className={cn(
          "text-sm font-medium",
          isActive ? "text-primary" : "text-foreground"
        )}>
          {title}
        </p>
        <p className="hidden truncate text-xs text-muted-foreground md:block">
          {description}
        </p>
      </div>
    </Link>
  );
}
