'use client';

import React from 'react';
import { Card, CardContent } from '@ui/components';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  progress?: {
    value: number;
    max: number;
    color?: string;
  };
  className?: string;
  compact?: boolean;
  onClick?: () => void;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-blue-500',
  trend,
  progress,
  className = '',
  compact = false,
  onClick
}: StatsCardProps) {
  return (
    <Card 
      className={cn(
        "h-full transition-all duration-200",
        onClick && "cursor-pointer hover:shadow-lg hover:scale-[1.02]",
        className
      )}
      onClick={onClick}
    >
      <CardContent className={compact ? "p-4" : "p-6"}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-gray-600 truncate",
              compact ? "text-xs" : "text-sm"
            )}>
              {title}
            </p>
            <p className={cn(
              "font-bold mt-1",
              compact ? "text-xl" : "text-2xl"
            )}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            
            {/* Subtitle or Trend */}
            {(subtitle || trend) && (
              <div className="mt-2">
                {trend ? (
                  <div className={cn(
                    "flex items-center text-sm",
                    trend.positive ? "text-green-600" : "text-red-600"
                  )}>
                    <span className="font-medium">
                      {trend.positive ? '+' : ''}{trend.value}
                    </span>
                    <span className="ml-1 text-gray-600">
                      {trend.label}
                    </span>
                  </div>
                ) : subtitle ? (
                  <p className="text-sm text-gray-600">{subtitle}</p>
                ) : null}
              </div>
            )}
            
            {/* Progress Bar */}
            {progress && (
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={cn(
                      "h-2 rounded-full transition-all duration-500",
                      progress.color || "bg-blue-500"
                    )}
                    style={{ 
                      width: `${Math.min((progress.value / progress.max) * 100, 100)}%` 
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {progress.value} / {progress.max}
                </p>
              </div>
            )}
          </div>
          
          {/* Icon */}
          <div className={cn(
            "flex-shrink-0",
            compact ? "ml-3" : "ml-4"
          )}>
            <div className={cn(
              "rounded-full p-2",
              "bg-opacity-10",
              iconColor === 'text-blue-500' && "bg-blue-500",
              iconColor === 'text-green-500' && "bg-green-500",
              iconColor === 'text-purple-500' && "bg-purple-500",
              iconColor === 'text-orange-500' && "bg-orange-500",
              iconColor === 'text-red-500' && "bg-red-500",
              iconColor === 'text-yellow-500' && "bg-yellow-500",
              iconColor === 'text-indigo-500' && "bg-indigo-500",
              iconColor === 'text-pink-500' && "bg-pink-500",
              iconColor === 'text-gray-500' && "bg-gray-500"
            )}>
              <Icon className={cn(
                compact ? "h-5 w-5" : "h-6 w-6",
                iconColor
              )} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}