'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface RatingProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value?: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  readOnly?: boolean;
  onChange?: (value: number) => void;
}

export const Rating = React.forwardRef<HTMLDivElement, RatingProps>(
  ({ className, value = 0, max = 5, size = 'md', readOnly = false, onChange, ...props }, ref) => {
    const [hoverValue, setHoverValue] = React.useState(0);
    const displayValue = hoverValue || value;

    return (
      <div
        ref={ref}
        className={cn('mt-rating', `mt-rating-${size}`, readOnly && 'mt-rating-readonly', className)}
        role="radiogroup"
        aria-label="Rating"
        onMouseLeave={() => !readOnly && setHoverValue(0)}
        {...props}
      >
        {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
          <button
            key={star}
            type="button"
            className={cn('mt-rating-star', star <= displayValue && 'mt-rating-star-filled')}
            onClick={() => !readOnly && onChange?.(star)}
            onMouseEnter={() => !readOnly && setHoverValue(star)}
            disabled={readOnly}
            role="radio"
            aria-checked={star === value}
            aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          >
            <svg viewBox="0 0 24 24" fill={star <= displayValue ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        ))}
      </div>
    );
  }
);
Rating.displayName = 'Rating';
