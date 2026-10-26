'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, FlaskConical } from 'lucide-react';
import { cn } from '@mobtranslate/ui';

const researchNavItems = [
  { title: 'Overview', href: '/admin/research', exact: true },
  { title: 'Quinkan atlas', href: '/admin/research/quinkan', exclude: '/admin/research/quinkan/private' },
  { title: 'Private workspace', href: '/admin/research/quinkan/private' },
  { title: 'Field', href: '/admin/research/field' },
  { title: 'Rock art', href: '/admin/research/rock-art' },
] as const;

function isActive(pathname: string, item: (typeof researchNavItems)[number]): boolean {
  if ('exact' in item) return pathname === item.href;
  if ('exclude' in item && pathname.startsWith(item.exclude)) return false;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Slim chrome above each research tool. The research layout publishes its
 * height (h-10) as --research-bar-height so full-viewport tools can subtract it.
 */
export default function ResearchBar() {
  const pathname = usePathname() ?? '';
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 overflow-x-auto border-b bg-card px-3 text-sm">
      {/* A plain anchor: leaving the section reloads into the normal admin shell. */}
      <a href="/admin" className="flex shrink-0 items-center gap-1 text-muted-foreground transition-colors hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Admin
      </a>
      <span className="flex shrink-0 items-center gap-1.5 font-semibold">
        <FlaskConical className="h-4 w-4 text-primary" />
        Research
      </span>
      <nav className="flex items-center gap-1" aria-label="Research tools">
        {researchNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'shrink-0 rounded-md px-2 py-1 transition-colors hover:bg-muted',
              isActive(pathname, item) ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground',
            )}
          >
            {item.title}
          </Link>
        ))}
      </nav>
      <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground sm:inline">Super admin only · not indexed · no analytics</span>
    </header>
  );
}
