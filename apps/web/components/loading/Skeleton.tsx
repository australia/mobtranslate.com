'use client';

import React from 'react';
import { cn } from '@mobtranslate/ui';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'shimmer' | 'none';
}

export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps) {
  const baseClasses = cn(
    "bg-muted relative overflow-hidden",
    animation === 'pulse' && "animate-pulse",
    variant === 'circular' && "rounded-full",
    variant === 'rounded' && "rounded-lg",
    variant === 'text' && "rounded",
    variant === 'rectangular' && "rounded-sm",
    className
  );

  const style: React.CSSProperties = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1em' : undefined)
  };

  return (
    <div className={baseClasses} style={style} aria-hidden="true">
      {animation === 'shimmer' && (
        <div
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
        />
      )}
    </div>
  );
}

// Text Line Skeleton — for paragraph placeholders
export function TextLineSkeleton({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true" role="presentation">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          height={14}
          width={i === lines - 1 ? '75%' : '100%'}
          animation="shimmer"
        />
      ))}
    </div>
  );
}

// Avatar Skeleton
export function AvatarSkeleton({
  size = 40,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Skeleton
      variant="circular"
      width={size}
      height={size}
      animation="shimmer"
      className={className}
    />
  );
}

// Card Skeleton
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={cn("bg-card rounded-lg border p-6", className)} aria-hidden="true" role="presentation">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton width="60%" height={20} className="mb-2" animation="shimmer" />
          <Skeleton width="40%" height={32} animation="shimmer" />
        </div>
        <Skeleton variant="circular" width={40} height={40} animation="shimmer" />
      </div>
    </div>
  );
}

// Word Card Skeleton
export function WordCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "bg-card rounded-lg border",
        compact ? "p-3" : "p-4 sm:p-6"
      )}
      aria-hidden="true"
      role="presentation"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Skeleton width="70%" height={compact ? 20 : 24} className="mb-2" animation="shimmer" />
          <Skeleton width="50%" height={compact ? 16 : 20} animation="shimmer" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton variant="circular" width={32} height={32} animation="shimmer" />
          <Skeleton variant="circular" width={32} height={32} animation="shimmer" />
        </div>
      </div>
      {!compact && (
        <div className="mt-4 pt-4 border-t">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton variant="circular" width={16} height={16} animation="shimmer" />
                <div>
                  <Skeleton width={40} height={16} animation="shimmer" />
                  <Skeleton width={30} height={12} className="mt-1" animation="shimmer" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Table Row Skeleton
export function TableRowSkeleton({
  columns = 5,
  className = '',
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <tr className={className} aria-hidden="true">
      {Array.from({ length: columns }).map((_, colIndex) => (
        <td key={colIndex} className="py-3 px-4">
          <Skeleton
            width={`${50 + (colIndex % 3) * 15}%`}
            height={16}
            animation="shimmer"
          />
        </td>
      ))}
    </tr>
  );
}

// Table Skeleton
export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden" aria-hidden="true" role="presentation">
      <table className="w-full">
        <thead className="bg-muted border-b">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="text-left py-3 px-4">
                <Skeleton width={`${60 + (i % 3) * 15}%`} height={16} animation="shimmer" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <TableRowSkeleton key={rowIndex} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Dashboard Skeleton
export function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true" role="presentation">
      {/* Header */}
      <div>
        <Skeleton width={200} height={32} className="mb-2" animation="shimmer" />
        <Skeleton width={300} height={20} animation="shimmer" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <CardSkeleton key={i} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border p-6">
          <Skeleton width={150} height={24} className="mb-4" animation="shimmer" />
          <Skeleton variant="rectangular" height={300} animation="shimmer" />
        </div>
        <div className="bg-card rounded-lg border p-6">
          <Skeleton width={150} height={24} className="mb-4" animation="shimmer" />
          <Skeleton variant="rectangular" height={300} animation="shimmer" />
        </div>
      </div>
    </div>
  );
}
