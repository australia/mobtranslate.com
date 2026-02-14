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
  RefreshCw
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
  return (
    <div className="min-h-screen bg-muted">
      {/* Admin Header */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="flex h-16 items-center px-4 gap-4">
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
            <span className="font-semibold text-lg">Admin Panel</span>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="w-64 min-h-[calc(100vh-4rem)] bg-card border-r border-border">
          <nav className="p-4 space-y-1">
            {adminNavItems.map((item) => (
              <AdminNavLink key={item.href} {...item} />
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
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
        "flex items-start gap-3 rounded-lg px-3 py-2 transition-all",
        "hover:bg-muted",
        isActive && "bg-primary/10 text-primary hover:bg-primary/20"
      )}
    >
      <Icon className={cn(
        "h-5 w-5 mt-0.5 flex-shrink-0",
        isActive ? "text-primary" : "text-muted-foreground"
      )} />
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium",
          isActive ? "text-primary" : "text-foreground"
        )}>
          {title}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {description}
        </p>
      </div>
    </Link>
  );
}
