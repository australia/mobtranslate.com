import React from 'react';

/**
 * The MobTranslate mark: an ochre tile with two overlapping speech bubbles —
 * two voices meeting (translation/dialogue). Scalable, theme-independent.
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
        <linearGradient id="mt-tile" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#C56A30" />
          <stop offset="1" stopColor="#A04A1A" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#mt-tile)" />
      <rect x="78" y="126" width="300" height="172" rx="46" fill="#FFFFFF" />
      <path d="M150 286 L132 356 L196 290 Z" fill="#FFFFFF" />
      <rect x="246" y="232" width="190" height="150" rx="50" fill="#A04A1A" />
      <path d="M386 372 L406 432 L346 376 Z" fill="#A04A1A" />
      <rect x="262" y="248" width="158" height="118" rx="40" fill="#F3A64B" />
      <path d="M388 358 L402 402 L352 362 Z" fill="#F3A64B" />
    </svg>
  );
}

export default BrandMark;
