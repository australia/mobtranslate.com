'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { sections } from '../content/navigation';
import { applyTheme, readThemePreference } from '../lib/theme';

function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    const sync = () => {
      setDark(applyTheme(readThemePreference(), false));
    };
    const reflect = () => setDark(document.documentElement.classList.contains('dark'));
    sync();
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    system.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    window.addEventListener('mt-theme-change', reflect);
    return () => {
      system.removeEventListener('change', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('mt-theme-change', reflect);
    };
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    applyTheme(next ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 w-full px-2 py-2.5 text-sm rounded-md transition-colors hover:bg-[var(--color-muted)] border-2 border-[var(--color-border)]"
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
        placeholder="Find a topic..."
        aria-label="Find a design system topic"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-8 pr-2 py-2.5 text-sm rounded-md border-2 border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] outline-none focus:border-[var(--color-ring)] transition-colors"
      />
    </div>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [search, setSearch] = React.useState('');

  const filteredSections = sections.map((section) => ({
    ...section,
    items: search
      ? section.items.filter((item) =>
          `${section.title} ${item.label}`.toLowerCase().includes(search.trim().toLowerCase())
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
      {search && <p role="status" className="text-sm mb-3">{filteredSections.reduce((total, section) => total + section.items.length, 0)} topics found</p>}
      {filteredSections.length === 0 && <p className="text-sm mb-4">Try a component name or a category such as Foundations. <Link className="underline" href={`/search?q=${encodeURIComponent(search.trim())}`} onClick={onNavigate}>Search all guidance</Link></p>}
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
                  aria-current={pathname === item.href ? 'page' : undefined}
                  onClick={onNavigate}
                  className={`block px-2 py-2.5 text-sm rounded-md transition-colors ${
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
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const headerRef = React.useRef<HTMLElement>(null);
  const pathname = usePathname();

  React.useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let frame = 0;
    const reveal = (target: EventTarget | null) => {
      cancelAnimationFrame(frame);
      if (!(target instanceof HTMLElement) || !target.closest('main')) return;
      frame = requestAnimationFrame(() => {
        if (!target.isConnected || document.activeElement !== target || !target.matches(':focus-visible')) return;
        const headerBox = header.getBoundingClientRect();
        const targetBox = target.getBoundingClientRect();
        const aboveHeader = headerBox.height > 0 && targetBox.top < headerBox.bottom;
        const belowViewport = targetBox.top >= innerHeight || (targetBox.bottom > innerHeight && targetBox.height <= innerHeight - headerBox.bottom);
        if (aboveHeader || belowViewport) {
          target.scrollIntoView({block: 'start', inline: 'nearest', behavior: 'instant'});
        }
      });
    };
    const measure = () => {
      document.documentElement.style.setProperty('--styleguide-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
      reveal(document.activeElement);
    };
    const focus = (event: FocusEvent) => reveal(event.target);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    document.addEventListener('focusin', focus);
    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', focus);
      cancelAnimationFrame(frame);
      document.documentElement.style.removeProperty('--styleguide-header-height');
    };
  }, []);

  React.useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  React.useEffect(() => {
    if (mobileOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [mobileOpen]);

  React.useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (desktop.matches) dialogRef.current?.close(); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  return (
    <>
      <header ref={headerRef} className="mobile-nav-header"><button
        className="mobile-nav-trigger"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={mobileOpen}
        aria-controls="mobile-navigation"
      >Menu</button><span className="text-sm font-semibold">MobTranslate styleguide</span></header>
      <nav aria-label="Design system" className="styleguide-desktop-nav w-64 shrink-0 border-r border-[var(--color-border)] h-screen overflow-y-auto sticky top-0 p-4 bg-[var(--color-background)]">
        <NavContent />
      </nav>
      <dialog id="mobile-navigation" ref={dialogRef} className="mobile-navigation" aria-label="Design system navigation" onClose={() => setMobileOpen(false)} onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}>
        <div className="p-4">
          <button className="nav-close" onClick={() => dialogRef.current?.close()}>Close navigation</button>
          {mobileOpen && <nav aria-label="Design system"><NavContent onNavigate={() => dialogRef.current?.close()} /></nav>}
        </div>
      </dialog>
    </>
  );
}
