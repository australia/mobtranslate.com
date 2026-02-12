import React from 'react';

export function ColorSwatch({ name, value, textColor }: { name: string; value: string; textColor?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-16 h-16 rounded-lg border-2 border-[var(--color-border)]"
        style={{ backgroundColor: value }}
      />
      <span className="text-xs font-mono">{name}</span>
      <span className="text-xs font-mono text-[var(--color-muted-foreground)]">{value}</span>
    </div>
  );
}

export function ColorPaletteRow({ name, shades }: { name: string; shades: Record<string, string> }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold mb-3 capitalize">{name}</h3>
      <div className="flex flex-wrap gap-3">
        {Object.entries(shades).map(([shade, value]) => (
          <ColorSwatch key={shade} name={`${shade}`} value={value} />
        ))}
      </div>
    </div>
  );
}
