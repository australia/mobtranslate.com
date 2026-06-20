'use client';

import { cn } from '@mobtranslate/ui';

interface LevelMeterProps {
  /** Current input level 0..1. */
  level: number;
  /** Whether the mic is open and reporting. */
  active: boolean;
}

const SEGMENTS = 14;

/**
 * A large, high-contrast input-level meter. Doubles as the "your mic is
 * working" affordance — segments visibly respond to the speaker's voice.
 */
export function LevelMeter({ level, active }: LevelMeterProps) {
  const lit = Math.round(Math.min(1, level) * SEGMENTS);
  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5" role="meter" aria-label="Microphone input level" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const on = active && i < lit;
          // Last few segments warn of clipping (too loud).
          const hot = i >= SEGMENTS - 3;
          return (
            <div
              key={i}
              className={cn(
                'h-6 flex-1 rounded-sm transition-colors duration-75',
                on ? (hot ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-secondary)]') : 'bg-muted',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
