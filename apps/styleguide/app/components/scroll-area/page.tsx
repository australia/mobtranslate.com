'use client';
import { ScrollArea } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function ScrollAreaPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Scroll Area</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Custom scrollable container.</p>
      <Section title="Default">
        <ComponentPreview>
          <ScrollArea className="h-48 w-full border-2 border-[var(--color-border)] rounded-lg">
            <div className="p-4 space-y-4">
              {Array.from({ length: 20 }, (_, i) => (
                <p key={i}>Scrollable content item {i + 1}</p>
              ))}
            </div>
          </ScrollArea>
        </ComponentPreview>
      </Section>
    </div>
  );
}
