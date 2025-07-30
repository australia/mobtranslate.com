import * as React from "react"
import { cn } from "@/lib/utils"

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
        "flex min-h-[400px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center animate-in fade-in-50",
        className
      )}
      {...props}
    >
      {icon && (
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          {icon}
        </div>
      )}
      {title && (
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      )}
      {description && (
        <p className="mb-4 mt-2 text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action}
      {children}
    </div>
  )
}