import * as React from "react"
import { cn } from "@mobtranslate/ui"

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  variant?: string
  contained?: boolean
  title?: string
  description?: string
}

export function Section({ className, variant: _variant, contained: _contained, title: _title, description: _description, ...props }: SectionProps) {
  return (
    <section
      className={cn("pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16", className)}
      {...props}
    />
  )
}
