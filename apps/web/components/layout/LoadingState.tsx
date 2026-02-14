import * as React from "react"
import { cn } from "@mobtranslate/ui"

interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  text?: string
}

export function LoadingState({
  text = "Loading...",
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[400px] flex-col items-center justify-center",
        className
      )}
      {...props}
    >
      <div className="flex flex-col items-center space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
        {text && (
          <p className="text-sm text-[var(--color-muted-foreground)]">{text}</p>
        )}
      </div>
    </div>
  )
}

export function LoadingSpinner({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-muted)] border-t-[var(--color-primary)]", className)}
      {...props}
    />
  )
}

export function LoadingSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[var(--color-muted)]", className)}
      {...props}
    />
  )
}
