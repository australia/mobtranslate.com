'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  src?: string;
  alt?: string;
  fallback?: string;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, size = 'md', src, alt, fallback, ...props }, ref) => {
    const [hasError, setHasError] = React.useState(false);
    return (
      <div
        ref={ref}
        className={cn('mt-avatar', `mt-avatar-${size}`, className)}
        {...props}
      >
        {src && !hasError ? (
          <img
            src={src}
            alt={alt || ''}
            className="mt-avatar-image"
            onError={() => setHasError(true)}
          />
        ) : (
          <span className="mt-avatar-fallback">
            {fallback || (alt ? alt[0]?.toUpperCase() : '?')}
          </span>
        )}
      </div>
    );
  }
);
Avatar.displayName = 'Avatar';
