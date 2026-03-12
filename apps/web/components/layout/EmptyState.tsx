import * as React from "react"
import { cn } from "@mobtranslate/ui"

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  title?: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-8 text-center animate-in fade-in-50",
        className
      )}
      role="status"
      {...props}
    >
      {icon && (
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      {title && (
        <h3 className="mt-5 text-lg font-display font-semibold">{title}</h3>
      )}
      {description && (
        <p className="mb-6 mt-2 max-w-sm text-sm text-[var(--color-muted-foreground)] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
      {children}
    </div>
  )
}
