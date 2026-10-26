'use client';

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg' | 'xl';

const variants: Record<Variant, string> = {
  primary: 'field-btn-primary',
  secondary: 'field-btn-secondary',
  ghost: 'field-btn-ghost',
  danger: 'field-btn-danger',
};

const sizes: Record<Size, string> = {
  md: 'min-h-11 px-4 text-[0.9375rem]',
  lg: 'min-h-12 px-5 text-base',
  xl: 'min-h-16 px-5 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...rest }, ref) {
    return <button ref={ref} type={type} className={`field-btn ${variants[variant]} ${sizes[size]} ${className}`} {...rest} />;
  },
);

/**
 * A native modal dialog: focus trap, Escape and the top layer come from the
 * platform. On phones it rises as a sheet; on wide screens it is centred.
 */
export function Dialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`field-dialog ${wide ? 'field-dialog-wide' : ''}`}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--field-line)] px-5 py-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="field-icon-btn -mr-2" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Toast({ message, action, onAction }: { message: string; action?: string; onAction?: () => void }) {
  return (
    <div className="field-toast" role="status" aria-live="polite">
      <span>{message}</span>
      {action && onAction && (
        <button type="button" onClick={onAction} className="field-toast-action">
          {action}
        </button>
      )}
    </div>
  );
}

/** Section heading inside a panel. */
export function PanelHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[0.9375rem] font-semibold">{children}</h3>
      {aside}
    </div>
  );
}
