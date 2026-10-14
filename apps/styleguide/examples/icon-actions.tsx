'use client';
import { useState, useRef } from 'react';
import { IconButton, TooltipProvider, Tooltip, TooltipTrigger, TooltipPortal, TooltipPositioner, TooltipPopup } from '@mobtranslate/ui';

export function IconActionsExample() {
  const portalContainer=useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);
  return <div ref={portalContainer} data-icon-action className="space-y-3">
    <TooltipProvider><Tooltip><TooltipTrigger render={<IconButton aria-label="Save example entry" aria-pressed={saved} onClick={() => setSaved(!saved)}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M6 4h12v16l-6-4-6 4z" /></svg>
    </IconButton>} /><TooltipPortal container={portalContainer}><TooltipPositioner sideOffset={8}><TooltipPopup>Toggle saved state for this example.</TooltipPopup></TooltipPositioner></TooltipPortal></Tooltip></TooltipProvider>
    <p role="status">{saved ? 'Example saved locally.' : 'Example is not saved.'} No dictionary record is changed.</p>
  </div>;
}
