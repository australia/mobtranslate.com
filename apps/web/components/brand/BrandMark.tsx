import React from 'react';

/**
 * The MobTranslate mark: a bold "M" (Mob) whose two strokes meet at a centre
 * node — two voices meeting, the meaning in the middle. Gold on a deep warm tile.
 */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Mob Translate"
      className={className}
    >
      <defs>
        <linearGradient id="mt-g" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#6E2C18" />
          <stop offset="1" stopColor="#241310" />
        </linearGradient>
        <linearGradient id="mt-m" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#F0BC63" />
          <stop offset="1" stopColor="#D2691E" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#mt-g)" />
      <path
        d="M120 388 L120 150 L256 300 L392 150 L392 388"
        fill="none"
        stroke="url(#mt-m)"
        strokeWidth="56"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="256" cy="300" r="25" fill="#FBE7C2" />
    </svg>
  );
}

export default BrandMark;
