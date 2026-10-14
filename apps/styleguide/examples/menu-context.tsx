'use client';
import { useRef, useState } from 'react';
import { Button, ContextMenu, ContextMenuItem, ContextMenuPopup, ContextMenuPortal, ContextMenuPositioner, ContextMenuSeparator, ContextMenuTrigger, Menu, MenuItem, MenuPopup, MenuPortal, MenuPositioner, MenuTrigger } from '@mobtranslate/ui';

export function ContextCommandsExample() {
  const [bookmarked, setBookmarked] = useState(false);
  const [result, setResult] = useState('No local context action run.');
  const record = useRef<HTMLDivElement>(null);
  function toggleBookmark() { setBookmarked(current => !current); setResult('Local bookmark toggled. No remote request occurred.'); }
  return <div data-context-lab className="space-y-4">
    <ContextMenu>
      <ContextMenuTrigger ref={record} data-context-target role="group" tabIndex={0} aria-label="Local reading example context" className="rounded-lg border-2 border-[var(--color-border)] p-4">
        <p>Local reading example</p><p data-context-bookmark>Local bookmark: {bookmarked ? 'included' : 'not included'}.</p><p>Right-click this region, or use the visible button below. Long press is an installed touch behavior that needs device verification.</p>
      </ContextMenuTrigger>
      <ContextMenuPortal><ContextMenuPositioner sideOffset={4}><ContextMenuPopup aria-label="Local reading context actions" finalFocus={record}>
        <ContextMenuItem onClick={toggleBookmark}>{bookmarked ? 'Remove local bookmark' : 'Add local bookmark'}</ContextMenuItem>
        <ContextMenuSeparator /><ContextMenuItem disabled onClick={() => setResult('Unexpected unavailable context activation.')}>Share externally (unavailable)</ContextMenuItem>
      </ContextMenuPopup></ContextMenuPositioner></ContextMenuPortal>
    </ContextMenu>
    <Menu><MenuTrigger render={<Button variant="outline">Open local context actions</Button>} /><MenuPortal><MenuPositioner sideOffset={8}><MenuPopup aria-label="Visible local context actions" finalFocus={record}>
      <MenuItem onClick={toggleBookmark}>{bookmarked ? 'Remove local bookmark' : 'Add local bookmark'}</MenuItem><MenuItem disabled>Share externally (unavailable)</MenuItem>
    </MenuPopup></MenuPositioner></MenuPortal></Menu>
    <p role="status">{result} The visible button offers the same local action with keyboard and single-pointer access.</p>
  </div>;
}
