'use client';

import * as React from "react";
import { cn } from "../../lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = ({ className, ...props }: CardProps) => (
  <div
    className={cn("rounded-xl border bg-card text-card-foreground shadow transition-all duration-300 hover:shadow-lg hover:-translate-y-1", className)}
    {...props}
  />
);

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardHeader = ({ className, ...props }: CardHeaderProps) => (
  <div
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
);

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export const CardTitle = ({ className, ...props }: CardTitleProps) => (
  <h3
    className={cn("font-semibold leading-none tracking-tight text-2xl", className)}
    {...props}
  />
);

export interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const CardDescription = ({ className, ...props }: CardDescriptionProps) => (
  <p
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
);

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardContent = ({ className, ...props }: CardContentProps) => (
  <div className={cn("p-6 pt-0", className)} {...props} />
);

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardFooter = ({ className, ...props }: CardFooterProps) => (
  <div
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
);
