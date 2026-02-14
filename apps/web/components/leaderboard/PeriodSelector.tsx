'use client';

import React from 'react';
import { Button } from '@mobtranslate/ui';
import { Calendar, Star } from 'lucide-react';

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
  { value: 'day', label: 'Today', icon: Calendar },
  { value: 'week', label: 'This Week', icon: Calendar },
  { value: 'month', label: 'This Month', icon: Calendar },
  { value: 'year', label: 'This Year', icon: Calendar },
  { value: 'all', label: 'All Time', icon: Star }
];

export default function PeriodSelector({
  selectedPeriod,
  onPeriodChange,
  className = ''
}: PeriodSelectorProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {PERIOD_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant={selectedPeriod === option.value ? 'primary' : 'outline'}
          size="sm"
          onClick={() => onPeriodChange(option.value)}
          className="flex items-center"
        >
          <option.icon className="h-4 w-4 mr-1" />
          {option.label}
        </Button>
      ))}
    </div>
  );
}