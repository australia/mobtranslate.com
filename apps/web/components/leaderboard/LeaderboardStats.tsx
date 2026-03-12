'use client';

import React from 'react';
import {
  Users,
  Globe,
  Brain,
  Target
} from 'lucide-react';

interface LeaderboardStatsProps {
  totalLanguages: number;
  totalParticipants: number;
  totalQuestions: number;
  averageAccuracy: number;
  className?: string;
}

export default function LeaderboardStats({
  totalLanguages,
  totalParticipants,
  totalQuestions,
  averageAccuracy,
  className = ''
}: LeaderboardStatsProps) {
  const stats = [
    {
      label: 'Active Languages',
      value: totalLanguages,
      icon: Globe,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Total Learners',
      value: totalParticipants.toLocaleString(),
      icon: Users,
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-600 dark:text-orange-400',
    },
    {
      label: 'Questions Answered',
      value: totalQuestions.toLocaleString(),
      icon: Brain,
      iconBg: 'bg-rose-100 dark:bg-rose-900/30',
      iconColor: 'text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Global Accuracy',
      value: `${averageAccuracy.toFixed(1)}%`,
      icon: Target,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ];

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="relative bg-card rounded-xl border border-border/60 p-5 lg:p-6 overflow-hidden group hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2.5 rounded-lg ${stat.iconBg}`}>
              <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
            </div>
          </div>
          <p className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
            {stat.value}
          </p>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            {stat.label}
          </p>
          {/* Subtle warm accent line at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400/40 via-orange-400/40 to-transparent" />
        </div>
      ))}
    </div>
  );
}
