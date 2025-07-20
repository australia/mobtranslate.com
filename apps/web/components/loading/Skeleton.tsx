'use client';

import React from 'react';
import { cn } from '@/app/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps) {
  const baseClasses = cn(
    "bg-gray-200",
    animation === 'pulse' && "animate-pulse",
    animation === 'wave' && "animate-wave",
    variant === 'circular' && "rounded-full",
    variant === 'rounded' && "rounded-lg",
    variant === 'text' && "rounded",
    className
  );

  const style: React.CSSProperties = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1em' : undefined)
  };

  return <div className={baseClasses} style={style} />;
}

// Card Skeleton
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={cn("bg-white rounded-lg border p-6", className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton width="60%" height={20} className="mb-2" />
          <Skeleton width="40%" height={32} />
        </div>
        <Skeleton variant="circular" width={40} height={40} />
      </div>
    </div>
  );
}

// Word Card Skeleton
export function WordCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn(
      "bg-white rounded-lg border",
      compact ? "p-3" : "p-4 sm:p-6"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Skeleton width="70%" height={compact ? 20 : 24} className="mb-2" />
          <Skeleton width="50%" height={compact ? 16 : 20} />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton variant="circular" width={32} height={32} />
          <Skeleton variant="circular" width={32} height={32} />
        </div>
      </div>
      {!compact && (
        <div className="mt-4 pt-4 border-t">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton variant="circular" width={16} height={16} />
                <div>
                  <Skeleton width={40} height={16} />
                  <Skeleton width={30} height={12} className="mt-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Table Skeleton
export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="text-left py-3 px-4">
                <Skeleton width={`${60 + Math.random() * 40}%`} height={16} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={colIndex} className="py-3 px-4">
                  <Skeleton width={`${40 + Math.random() * 60}%`} height={16} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Dashboard Skeleton
export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Skeleton width={200} height={32} className="mb-2" />
        <Skeleton width={300} height={20} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <CardSkeleton key={i} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <Skeleton width={150} height={24} className="mb-4" />
          <Skeleton variant="rectangular" height={300} />
        </div>
        <div className="bg-white rounded-lg border p-6">
          <Skeleton width={150} height={24} className="mb-4" />
          <Skeleton variant="rectangular" height={300} />
        </div>
      </div>
    </div>
  );
}