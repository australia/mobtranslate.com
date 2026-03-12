import * as React from "react"
import { cn } from "@mobtranslate/ui"

interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  text?: string
  size?: "sm" | "md" | "lg"
}

export function LoadingState({
  text = "Loading...",
  size = "md",
  className,
  ...props
}: LoadingStateProps) {
  const sizeClasses = {
    sm: "h-5 w-5 border-2",
    md: "h-8 w-8 border-[3px]",
    lg: "h-12 w-12 border-4",
  }

  return (
    <div
      className={cn(
        "flex min-h-[400px] flex-col items-center justify-center",
        className
      )}
      role="status"
      aria-live="polite"
      {...props}
    >
      <div className="flex flex-col items-center space-y-4">
        <div
          className={cn(
            "rounded-full border-[var(--color-muted)] border-t-[var(--color-primary)] animate-spin",
            sizeClasses[size]
          )}
          aria-hidden="true"
        />
        {text && (
          <p className="text-sm text-[var(--color-muted-foreground)] font-medium">
            {text}
          </p>
        )}
        <span className="sr-only">{text || "Loading"}</span>
      </div>
    </div>
  )
}

export function LoadingSpinner({
  className,
  size = "md",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-[3px]",
    lg: "h-12 w-12 border-4",
  }

  return (
    <div
      className={cn(
        "rounded-full border-[var(--color-muted)] border-t-[var(--color-primary)] animate-spin",
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label="Loading"
      {...props}
    />
  )
}

export function LoadingSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[var(--color-muted)]", className)}
      aria-hidden="true"
      {...props}
    />
  )
}
