'use client';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function PreviewCardPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Preview Card</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Hoverable link preview that shows a card with additional content on hover.
      </p>

      <Section title="Default" description="Hover over the link to see the preview card.">
        <ComponentPreview>
          <div className="flex items-center gap-2">
            <span className="text-sm">Visit</span>
            <span className="relative group inline-block">
              <a href="#" className="text-[var(--color-primary)] underline underline-offset-4 text-sm">Mobtranslate Documentation</a>
              <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-10">
                <div className="mt-preview-card-popup">
                  <p className="font-semibold text-sm mb-1">Mobtranslate Documentation</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">Comprehensive guide to the Mobtranslate design system, components, and tokens.</p>
                </div>
              </div>
            </span>
            <span className="text-sm">for details.</span>
          </div>
        </ComponentPreview>
        <CodeBlock code={`import { PreviewCard, PreviewCardTrigger, PreviewCardPopup } from '@mobtranslate/ui';

<PreviewCard>
  <PreviewCardTrigger>
    <a href="/docs">Documentation</a>
  </PreviewCardTrigger>
  <PreviewCardPopup>
    <p>Preview content shown on hover.</p>
  </PreviewCardPopup>
</PreviewCard>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'PreviewCard', type: 'Root', default: '-', description: 'Root container.' },
          { name: 'PreviewCardTrigger', type: 'Trigger', default: '-', description: 'The link element that triggers the preview on hover.' },
          { name: 'PreviewCardPopup', type: 'Popup', default: '-', description: 'The card content shown on hover.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Hover intent:</strong> The card appears after a brief delay to avoid accidental triggers.</p>
          <p className="text-sm"><strong>Keyboard:</strong> The card can be triggered via focus on the link element.</p>
          <p className="text-sm"><strong>Dismiss:</strong> Escape closes the preview card. Moving focus or pointer away also dismisses it.</p>
        </div>
      </Section>
    </div>
  );
}
