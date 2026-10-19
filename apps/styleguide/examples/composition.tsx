'use client';

import { useState } from 'react';
import { Button, Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@mobtranslate/ui';

export function CompositionExample() {
  const [open, setOpen] = useState(false);
  return <Collapsible open={open} onOpenChange={setOpen}>
    <CollapsibleTrigger render={<Button variant="outline" type="button" />}>
      Example source details
    </CollapsibleTrigger>
    <CollapsiblePanel>
      <p className="mt-4">This is interface placeholder text, not an attested source record.</p>
    </CollapsiblePanel>
    <p role="status" className="mt-3 text-sm">Example details {open ? 'expanded' : 'collapsed'}.</p>
  </Collapsible>;
}
