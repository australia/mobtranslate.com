import * as React from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  heading?: string
  text?: string
  children?: React.ReactNode
}

export function PageHeader({
  heading,
  text,
  children,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-0.5", className)} {...props}>
      {heading && (
        <h2 className="text-2xl font-bold tracking-tight">{heading}</h2>
      )}
      {text && (
        <p className="text-muted-foreground">
          {text}
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
      className={cn("text-sm text-muted-foreground", className)}
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