import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-lg border-2 px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-accent",
  {
    variants: {
      variant: {
        default:
          "border-foreground bg-primary text-primary-foreground hover:bg-accent",
        secondary:
          "border-foreground bg-secondary text-secondary-foreground hover:bg-accent",
        destructive:
          "border-foreground bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground border-foreground bg-transparent hover:bg-accent/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }