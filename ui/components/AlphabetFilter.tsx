'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface AlphabetFilterProps {
  activeLetter?: string;
  onLetterClick?: (letter: string) => void;
  className?: string;
}

const AlphabetFilter = React.forwardRef<HTMLDivElement, AlphabetFilterProps>(
  ({ activeLetter, onLetterClick, className }, ref) => {
    const letters = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');

    return (
      <div ref={ref} className={cn('flex flex-wrap gap-1', className)}>
        {letters.map((letter) => (
          <button
            key={letter}
            onClick={() => onLetterClick?.(letter)}
            className={cn(
              'w-8 h-8 flex items-center justify-center text-sm font-medium rounded transition-colors',
              activeLetter === letter
                ? 'bg-primary text-primary-foreground'
                : 'border border-border hover:bg-primary hover:text-primary-foreground'
            )}
          >
            {letter}
          </button>
        ))}
      </div>
    );
  }
);

AlphabetFilter.displayName = 'AlphabetFilter';

export { AlphabetFilter };