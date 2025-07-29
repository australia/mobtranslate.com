'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  FileCheck,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  TrendingUp,
  Home,
  ChevronLeft,
  BookOpen
} from 'lucide-react';
import { cn } from '@/app/lib/utils';

interface CuratorLayoutProps {
  children: ReactNode;
}

const curatorNavItems = [
  {
    title: 'Dashboard',
    href: '/curator',
    icon: Home,
    description: 'Overview and stats'
  },
  {
    title: 'Pending Reviews',
    href: '/curator/pending',
    icon: Clock,
    description: 'Words awaiting review'
  },
  {
    title: 'Improvement Suggestions',
    href: '/curator/improvements',
    icon: TrendingUp,
    description: 'Suggested improvements'
  },
  {
    title: 'Comments',
    href: '/curator/comments',
    icon: MessageSquare,
    description: 'Manage comments'
  },
  {
    title: 'Approved',
    href: '/curator/approved',
    icon: CheckCircle,
    description: 'Recently approved'
  },
  {
    title: 'Rejected',
    href: '/curator/rejected',
    icon: XCircle,
    description: 'Recently rejected'
  },
  {
    title: 'Guidelines',
    href: '/curator/guidelines',
    icon: BookOpen,
    description: 'Curation guidelines'
  }
];

export default function CuratorLayout({ children }: CuratorLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Curator Header */}
      <header className="sticky top-0 z-50 border-b bg-white dark:bg-gray-800 shadow-sm">
        <div className="flex h-16 items-center px-4 gap-4">
          <Link 
            href="/" 
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to site
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-lg">Curator Dashboard</span>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="w-64 min-h-[calc(100vh-4rem)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <nav className="p-4 space-y-1">
            {curatorNavItems.map((item) => (
              <CuratorNavLink key={item.href} {...item} />
            ))}
          </nav>

          {/* Quick Stats */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Quick Stats
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Pending</span>
                <span className="font-medium">-</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">This Week</span>
                <span className="font-medium">-</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Total Reviewed</span>
                <span className="font-medium">-</span>
              </div>
            </div>
          </div>
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

function CuratorNavLink({ href, icon: Icon, title, description }: typeof curatorNavItems[0]) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/curator' && pathname?.startsWith(href));

  return (
    <Link
      href={href}
      className={cn(
        "flex items-start gap-3 rounded-lg px-3 py-2 transition-all",
        "hover:bg-gray-100 dark:hover:bg-gray-700",
        isActive && "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400"
      )}
    >
      <Icon className={cn(
        "h-5 w-5 mt-0.5 flex-shrink-0",
        isActive ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"
      )} />
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium",
          isActive ? "text-green-700 dark:text-green-400" : "text-gray-900 dark:text-gray-100"
        )}>
          {title}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {description}
        </p>
      </div>
    </Link>
  );
}