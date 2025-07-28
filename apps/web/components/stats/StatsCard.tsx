'use client';

import React from 'react';
import { Card } from '@ui/components';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/app/lib/utils';

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
  iconColor = 'text-blue-500',
  trend,
  progress,
  className = '',
  style,
  onClick
}: StatsCardProps) {
  const progressPercentage = progress ? Math.min((progress.value / progress.max) * 100, 100) : 0;
  
  // Extract color name from iconColor class
  const colorName = iconColor.match(/text-(\w+)-500/)?.[1] || 'blue';
  
  // Background gradient colors based on icon color
  const gradientColors = {
    blue: 'from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10',
    green: 'from-green-50 to-green-100/50 dark:from-green-950/20 dark:to-green-900/10',
    purple: 'from-purple-50 to-purple-100/50 dark:from-purple-950/20 dark:to-purple-900/10',
    orange: 'from-orange-50 to-orange-100/50 dark:from-orange-950/20 dark:to-orange-900/10',
    red: 'from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/10',
    yellow: 'from-yellow-50 to-yellow-100/50 dark:from-yellow-950/20 dark:to-yellow-900/10',
    indigo: 'from-indigo-50 to-indigo-100/50 dark:from-indigo-950/20 dark:to-indigo-900/10',
    pink: 'from-pink-50 to-pink-100/50 dark:from-pink-950/20 dark:to-pink-900/10',
    gray: 'from-gray-50 to-gray-100/50 dark:from-gray-950/20 dark:to-gray-900/10'
  };

  const iconBgColors = {
    blue: 'bg-blue-100 dark:bg-blue-900/30',
    green: 'bg-green-100 dark:bg-green-900/30',
    purple: 'bg-purple-100 dark:bg-purple-900/30',
    orange: 'bg-orange-100 dark:bg-orange-900/30',
    red: 'bg-red-100 dark:bg-red-900/30',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/30',
    pink: 'bg-pink-100 dark:bg-pink-900/30',
    gray: 'bg-gray-100 dark:bg-gray-900/30'
  };

  return (
    <Card 
      className={cn(
        "relative overflow-hidden transition-all duration-300 border-0 shadow-sm",
        "hover:shadow-lg hover:-translate-y-1",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
      style={style}
    >
      {/* Background gradient */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-50",
        gradientColors[colorName as keyof typeof gradientColors] || gradientColors.blue
      )} />
      
      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          {/* Icon */}
          <div className={cn(
            "p-3 rounded-xl shadow-sm",
            iconBgColors[colorName as keyof typeof iconBgColors] || iconBgColors.blue
          )}>
            <Icon className={cn("h-6 w-6", iconColor)} />
          </div>
          
          {/* Trend indicator */}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium",
              trend.isPositive 
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}>
              {trend.isPositive ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : trend.value === 0 ? (
                <Minus className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              <span>{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {title}
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          
          {description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {description}
            </p>
          )}
        </div>
        
        {/* Progress section */}
        {progress && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-gray-600 dark:text-gray-400">Progress</span>
              <span className={cn(
                progressPercentage >= 70 ? "text-green-600 dark:text-green-400" :
                progressPercentage >= 40 ? "text-yellow-600 dark:text-yellow-400" :
                "text-red-600 dark:text-red-400"
              )}>
                {progressPercentage.toFixed(0)}%
              </span>
            </div>
            <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out",
                  progress.color || (
                    progressPercentage >= 70 ? "bg-green-500" :
                    progressPercentage >= 40 ? "bg-yellow-500" :
                    "bg-red-500"
                  )
                )}
                style={{ width: `${progressPercentage}%` }}
              >
                {/* Animated shine effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{progress.value.toLocaleString()}</span>
              <span>{progress.max.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}