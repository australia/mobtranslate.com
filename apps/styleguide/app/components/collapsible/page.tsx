'use client';
import { useState } from 'react';
import { Collapsible, CollapsibleTrigger, CollapsiblePanel, Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';

export default function CollapsiblePage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Collapsible</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A component that toggles the visibility of its content.
      </p>

      <Section title="Default" description="Click the trigger to show/hide content.">
        <ComponentPreview>
          <Collapsible>
            <CollapsibleTrigger className="mt-btn mt-btn-outline mt-btn-sm">Toggle Content</CollapsibleTrigger>
            <CollapsiblePanel>
              <div className="mt-3 p-4 border-2 border-[var(--color-border)] rounded-lg">
                <p className="text-sm">This content can be hidden or shown by clicking the trigger above.</p>
              </div>
            </CollapsiblePanel>
          </Collapsible>
        </ComponentPreview>
      </Section>

      <Section title="File Tree Pattern" description="A collapsible file tree.">
        <ComponentPreview>
          <div className="max-w-sm space-y-1">
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium cursor-pointer hover:text-[var(--color-primary)]">
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                src/
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <div className="ml-4 space-y-1 mt-1">
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1 text-sm cursor-pointer hover:text-[var(--color-primary)]">
                      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                      components/
                    </CollapsibleTrigger>
                    <CollapsiblePanel>
                      <div className="ml-4 space-y-0.5 mt-0.5">
                        <p className="text-sm text-[var(--color-muted-foreground)]">Button.tsx</p>
                        <p className="text-sm text-[var(--color-muted-foreground)]">Input.tsx</p>
                        <p className="text-sm text-[var(--color-muted-foreground)]">Dialog.tsx</p>
                      </div>
                    </CollapsiblePanel>
                  </Collapsible>
                  <p className="text-sm text-[var(--color-muted-foreground)] ml-4">index.ts</p>
                </div>
              </CollapsiblePanel>
            </Collapsible>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'defaultOpen', type: 'boolean', default: 'false', description: 'Initially open (uncontrolled).' },
          { name: 'open', type: 'boolean', default: '-', description: 'Controlled open state.' },
          { name: 'onOpenChange', type: '(open: boolean) => void', default: '-', description: 'Called when state changes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>ARIA:</strong> Trigger has aria-expanded and aria-controls linking to the panel.</p>
          <p className="text-sm"><strong>Keyboard:</strong> Enter/Space to toggle the panel.</p>
        </div>
      </Section>
    </div>
  );
}
