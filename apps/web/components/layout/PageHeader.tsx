import * as React from "react"
import { cn } from "@mobtranslate/ui"

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  heading?: string
  description?: string
  text?: string
  badge?: React.ReactNode
  children?: React.ReactNode
}

export function PageHeader({
  title,
  heading,
  description,
  text,
  badge,
  children,
  className,
  ...props
}: PageHeaderProps) {
  const displayTitle = title || heading
  const displayText = description || text

  return (
    <div className={cn("space-y-0.5", className)} {...props}>
      <div className="flex items-center gap-3">
        {displayTitle && (
          <h2 className="text-2xl font-bold tracking-tight">{displayTitle}</h2>
        )}
        {badge}
      </div>
      {displayText && (
        <p className="text-[var(--color-muted-foreground)]">
          {displayText}
        </p>
      )}
      {children}
    </div>
  )
}

interface PageHeaderDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

export function PageHeaderDescription({
  className,
  ...props
}: PageHeaderDescriptionProps) {
  return (
    <p
      className={cn("text-sm text-[var(--color-muted-foreground)]", className)}
      {...props}
    />
  )
}

interface PageHeaderHeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement> {}

export function PageHeaderHeading({
  className,
  ...props
}: PageHeaderHeadingProps) {
  return (
    <h1
      className={cn(
        "text-3xl font-bold leading-tight tracking-tighter md:text-4xl lg:leading-[1.1]",
        className
      )}
      {...props}
    />
  )
}
