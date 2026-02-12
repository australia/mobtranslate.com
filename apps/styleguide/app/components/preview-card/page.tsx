'use client';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function PreviewCardPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Preview Card</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Hoverable link preview card.</p>
      <Section title="Default">
        <ComponentPreview>
          <p className="text-[var(--color-muted-foreground)]">Preview Card shows content on hover over a link trigger, providing a preview of the linked content.</p>
        </ComponentPreview>
      </Section>
    </div>
  );
}
