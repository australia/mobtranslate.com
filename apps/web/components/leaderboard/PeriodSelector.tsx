'use client';

import React from 'react';
import { Calendar, Star, CalendarDays } from 'lucide-react';

interface PeriodOption {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface PeriodSelectorProps {
  selectedPeriod: string;
  onPeriodChange: (_period: string) => void;
  className?: string;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: 'all', label: 'All Time', icon: Star },
  { value: 'month', label: 'This Month', icon: CalendarDays },
  { value: 'week', label: 'This Week', icon: Calendar }
];

export default function PeriodSelector({
  selectedPeriod,
  onPeriodChange,
  className = ''
}: PeriodSelectorProps) {
  return (
    <div className={`inline-flex items-center rounded-xl bg-muted/60 p-1.5 ${className}`}>
      {PERIOD_OPTIONS.map((option) => {
        const isSelected = selectedPeriod === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onPeriodChange(option.value)}
            className={`
              relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
              transition-all duration-200 whitespace-nowrap
              ${isSelected
                ? 'bg-card text-foreground shadow-sm border border-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
              }
            `}
          >
            <option.icon className={`h-3.5 w-3.5 ${isSelected ? 'text-amber-600 dark:text-amber-400' : ''}`} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
