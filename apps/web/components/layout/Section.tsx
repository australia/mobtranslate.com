import * as React from "react"
import { cn } from "@mobtranslate/ui"

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'default' | 'muted'
  contained?: boolean
  title?: string
  description?: string
}

export function Section({ className, variant, contained: _contained, title, description, children, ...props }: SectionProps) {
  return (
    <section
      className={cn(
        "pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16",
        variant === 'muted' && "bg-muted/30",
        className
      )}
      {...props}
    >
      {(title || description) && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 text-center">
          {title && <h2 className="text-3xl font-display font-bold tracking-tight mb-2">{title}</h2>}
          {description && <p className="text-muted-foreground max-w-2xl mx-auto">{description}</p>}
        </div>
      )}
      {children}
    </section>
  )
}
