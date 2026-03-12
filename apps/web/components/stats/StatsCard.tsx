'use client';

import React from 'react';
import { Card, cn } from '@mobtranslate/ui';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  progress?: {
    value: number;
    max: number;
    color?: string;
  };
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor = 'text-primary',
  trend,
  progress,
  className = '',
  style,
  onClick
}: StatsCardProps) {
  const progressPercentage = progress ? Math.min((progress.value / progress.max) * 100, 100) : 0;

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300 border border-border/60",
        "hover:shadow-lg hover:-translate-y-0.5",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
      style={style}
    >
      {/* Warm accent bottom line */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400/30 via-orange-400/30 to-transparent" />

      <div className="relative p-5 lg:p-6">
        <div className="flex items-start justify-between mb-3">
          {/* Icon */}
          <div className="p-2.5 rounded-xl bg-muted/70">
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>

          {/* Trend indicator */}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold",
              trend.isPositive
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
            )}>
              {trend.isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : trend.value === 0 ? (
                <Minus className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <p className="text-sm font-medium text-muted-foreground">
            {title}
          </p>
          <p className="text-3xl font-bold text-foreground tracking-tight">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>

          {description && (
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {/* Progress section */}
        {progress && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">Progress</span>
              <span className={cn(
                progressPercentage >= 70 ? "text-emerald-600 dark:text-emerald-400" :
                progressPercentage >= 40 ? "text-amber-600 dark:text-amber-400" :
                "text-red-600 dark:text-red-400"
              )}>
                {progressPercentage.toFixed(0)}%
              </span>
            </div>
            <div className="relative h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out",
                  progress.color || (
                    progressPercentage >= 70 ? "bg-emerald-500" :
                    progressPercentage >= 40 ? "bg-amber-500" :
                    "bg-red-500"
                  )
                )}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress.value.toLocaleString()}</span>
              <span>{progress.max.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
