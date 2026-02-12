'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavSection {
  title: string;
  items: { label: string; href: string }[];
}

const sections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Introduction', href: '/' },
      { label: 'Tokens', href: '/tokens' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { label: 'Getting Started', href: '/guides/getting-started' },
      { label: 'Design Principles', href: '/guides/design-principles' },
      { label: 'Accessibility', href: '/guides/accessibility' },
      { label: 'Theming', href: '/guides/theming' },
    ],
  },
  {
    title: 'Foundations',
    items: [
      { label: 'Colors', href: '/foundations/colors' },
      { label: 'Typography', href: '/foundations/typography' },
      { label: 'Spacing', href: '/foundations/spacing' },
      { label: 'Elevation', href: '/foundations/elevation' },
      { label: 'Motion', href: '/foundations/motion' },
    ],
  },
  {
    title: 'Components',
    items: [
      { label: 'Accordion', href: '/components/accordion' },
      { label: 'Alert', href: '/components/alert' },
      { label: 'Alert Dialog', href: '/components/alert-dialog' },
      { label: 'Aspect Ratio', href: '/components/aspect-ratio' },
      { label: 'Autocomplete', href: '/components/autocomplete' },
      { label: 'Avatar', href: '/components/avatar' },
      { label: 'Badge', href: '/components/badge' },
      { label: 'Breadcrumbs', href: '/components/breadcrumbs' },
      { label: 'Button', href: '/components/button' },
      { label: 'Card', href: '/components/card' },
      { label: 'Checkbox', href: '/components/checkbox' },
      { label: 'Checkbox Group', href: '/components/checkbox-group' },
      { label: 'Chip', href: '/components/chip' },
      { label: 'Collapsible', href: '/components/collapsible' },
      { label: 'Combobox', href: '/components/combobox' },
      { label: 'Context Menu', href: '/components/context-menu' },
      { label: 'Dialog', href: '/components/dialog' },
      { label: 'Drawer', href: '/components/drawer' },
      { label: 'Field', href: '/components/field' },
      { label: 'Fieldset', href: '/components/fieldset' },
      { label: 'Form', href: '/components/form' },
      { label: 'Input', href: '/components/input' },
      { label: 'Menu', href: '/components/menu' },
      { label: 'Menubar', href: '/components/menubar' },
      { label: 'Meter', href: '/components/meter' },
      { label: 'Navigation Menu', href: '/components/navigation-menu' },
      { label: 'Number Field', href: '/components/number-field' },
      { label: 'Pagination', href: '/components/pagination' },
      { label: 'Popover', href: '/components/popover' },
      { label: 'Preview Card', href: '/components/preview-card' },
      { label: 'Progress', href: '/components/progress' },
      { label: 'Radio', href: '/components/radio' },
      { label: 'Rating', href: '/components/rating' },
      { label: 'Scroll Area', href: '/components/scroll-area' },
      { label: 'Select', href: '/components/select' },
      { label: 'Separator', href: '/components/separator' },
      { label: 'Skeleton', href: '/components/skeleton' },
      { label: 'Slider', href: '/components/slider' },
      { label: 'Stack', href: '/components/stack' },
      { label: 'Stepper', href: '/components/stepper' },
      { label: 'Switch', href: '/components/switch' },
      { label: 'Table', href: '/components/table' },
      { label: 'Tabs', href: '/components/tabs' },
      { label: 'Textarea', href: '/components/textarea' },
      { label: 'Toast', href: '/components/toast' },
      { label: 'Toggle', href: '/components/toggle' },
      { label: 'Toggle Group', href: '/components/toggle-group' },
      { label: 'Toolbar', href: '/components/toolbar' },
      { label: 'Tooltip', href: '/components/tooltip' },
      { label: 'Visually Hidden', href: '/components/visually-hidden' },
    ],
  },
  {
    title: 'Patterns',
    items: [
      { label: 'Forms', href: '/patterns/forms' },
      { label: 'Navigation', href: '/patterns/navigation' },
      { label: 'Data Display', href: '/patterns/data-display' },
    ],
  },
];

function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem('mt-theme');
    if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      setDark(true);
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('mt-theme', next ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors hover:bg-[var(--color-muted)] border-2 border-[var(--color-border)]"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
      )}
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}

function SearchFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative mb-3">
      <svg
        className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        type="text"
        placeholder="Search components..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md border-2 border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] outline-none focus:border-[var(--color-ring)] transition-colors"
      />
    </div>
  );
}

function NavContent() {
  const pathname = usePathname();
  const [search, setSearch] = React.useState('');

  const filteredSections = sections.map((section) => ({
    ...section,
    items: search
      ? section.items.filter((item) =>
          item.label.toLowerCase().includes(search.toLowerCase())
        )
      : section.items,
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <div className="mb-4">
        <Link href="/" className="text-lg font-bold">
          Mobtranslate UI
        </Link>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">Design System</p>
      </div>
      <div className="mb-3">
        <ThemeToggle />
      </div>
      <SearchFilter value={search} onChange={setSearch} />
      {filteredSections.map((section) => (
        <div key={section.title} className="mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2 px-2">
            {section.title}
          </h3>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block px-2 py-1.5 text-sm rounded-md transition-colors ${
                    pathname === item.href
                      ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-medium'
                      : 'hover:bg-[var(--color-muted)]'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function SidebarNav() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-md border-2 border-[var(--color-border)] bg-[var(--color-background)]"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle navigation"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {mobileOpen ? (
            <><path d="M6 6l12 12" /><path d="M6 18L18 6" /></>
          ) : (
            <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>
          )}
        </svg>
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav
        className={`
          w-64 shrink-0 border-r-2 border-[var(--color-border)] h-screen overflow-y-auto sticky top-0 p-4 bg-[var(--color-background)]
          max-md:fixed max-md:z-40 max-md:transition-transform max-md:duration-200
          ${mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}
        `}
      >
        <NavContent />
      </nav>
    </>
  );
}
