'use client';

import { Button } from '@mobtranslate/ui';
import { useToast } from '@/hooks/useToast';

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="mt-toast-viewport">
      {toasts.map(function ({ id, title, description, variant = 'default' }) {
        return (
          <div key={id} className={`mt-toast mt-toast-${variant}`} role="alert">
            <div className="grid gap-1">
              {title && <div className="mt-toast-title">{title}</div>}
              {description && (
                <div className="mt-toast-description">{description}</div>
              )}
            </div>
            <Button variant="ghost" size="sm" className="mt-toast-close" onClick={() => dismiss(id)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
