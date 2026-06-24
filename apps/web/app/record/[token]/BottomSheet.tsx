'use client';

import { ReactNode, useEffect, useState } from 'react';
import { cn } from '@mobtranslate/ui';

/**
 * A bottom sheet — the native-app affordance for secondary actions on a phone.
 * Slides up from the bottom, dims the page, closes on backdrop tap or Escape.
 * Respects prefers-reduced-motion (no slide, instant). Large drag handle and
 * generous padding so older users can read and dismiss it easily.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  // Mount, then flip `shown` on the next frame so the enter transition runs.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 250);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center">
      <div
        className={cn('absolute inset-0 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none', shown ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 w-full max-w-xl rounded-t-3xl border-t border-border bg-card shadow-xl transition-transform duration-250 ease-out motion-reduce:transition-none',
          shown ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ maxHeight: 'calc(100dvh - 3rem)', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-12 rounded-full bg-border" aria-hidden />
        </div>
        <div className="overflow-y-auto px-5 pb-2 pt-3" style={{ maxHeight: 'calc(100dvh - 7rem)' }}>
          <h2 className="mb-4 text-2xl font-bold text-foreground">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
