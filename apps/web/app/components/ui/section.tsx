import * as React from "react"
import { cn } from "@/lib/utils"

interface SectionProps extends React.HTMLAttributes<HTMLElement> {}

export function Section({ className, ...props }: SectionProps) {
  return (
    <section
      className={cn("pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16", className)}
      {...props}
    />
  )
}