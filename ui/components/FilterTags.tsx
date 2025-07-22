'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface FilterTag {
  id: string;
  label: string;
  active?: boolean;
}

export interface FilterTagsProps {
  tags: FilterTag[];
  onTagClick?: (tagId: string) => void;
  className?: string;
}

const FilterTags = React.forwardRef<HTMLDivElement, FilterTagsProps>(
  ({ tags, onTagClick, className }, ref) => {
    return (
      <div ref={ref} className={cn('flex flex-wrap gap-2', className)}>
        {tags.map((tag) => (
          <button
            key={tag.id}
            onClick={() => onTagClick?.(tag.id)}
            className={cn(
              'px-3 py-1 rounded-full text-sm font-medium transition-colors',
              tag.active 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            )}
          >
            {tag.label}
          </button>
        ))}
      </div>
    );
  }
);

FilterTags.displayName = 'FilterTags';

export { FilterTags };