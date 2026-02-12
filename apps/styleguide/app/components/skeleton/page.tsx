'use client';
import { Skeleton } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function SkeletonPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Skeleton</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Placeholder loading indicators that mimic the shape of content before it loads.
      </p>

      <Section title="Variants" description="Four shape variants for different content types.">
        <ComponentPreview>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Text (default)</label>
              <div className="space-y-2">
                <Skeleton variant="text" />
                <Skeleton variant="text" width="80%" />
                <Skeleton variant="text" width="60%" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Circular</label>
              <Skeleton variant="circular" width={48} height={48} />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Rectangular</label>
              <Skeleton variant="rectangular" width="100%" height={120} />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Rounded</label>
              <Skeleton variant="rounded" width="100%" height={120} />
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Skeleton variant="text" />
<Skeleton variant="circular" width={48} height={48} />
<Skeleton variant="rectangular" width="100%" height={120} />
<Skeleton variant="rounded" width="100%" height={120} />`} />
      </Section>

      <Section title="Card Loading State" description="A skeleton mimicking a card layout during loading.">
        <ComponentPreview>
          <div className="max-w-sm border-2 border-[var(--color-border)] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" width={40} height={40} />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="40%" />
              </div>
            </div>
            <Skeleton variant="rounded" width="100%" height={160} />
            <div className="space-y-2">
              <Skeleton variant="text" />
              <Skeleton variant="text" />
              <Skeleton variant="text" width="75%" />
            </div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="List Loading State" description="Skeleton rows for list or table data.">
        <ComponentPreview>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton variant="circular" width={32} height={32} />
                <div className="flex-1 space-y-1">
                  <Skeleton variant="text" width="30%" />
                  <Skeleton variant="text" width="50%" />
                </div>
                <Skeleton variant="rounded" width={60} height={24} />
              </div>
            ))}
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Custom Sizes" description="Use width and height props for custom dimensions.">
        <ComponentPreview>
          <div className="flex items-end gap-3">
            <Skeleton variant="rounded" width={40} height={40} />
            <Skeleton variant="rounded" width={80} height={60} />
            <Skeleton variant="rounded" width={120} height={80} />
            <Skeleton variant="rounded" width={160} height={100} />
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'variant', type: "'text' | 'circular' | 'rectangular' | 'rounded'", default: "'text'", description: 'Shape of the skeleton placeholder.' },
          { name: 'width', type: 'string | number', default: '-', description: 'Width of the skeleton. Strings used for percentages, numbers for pixels.' },
          { name: 'height', type: 'string | number', default: '-', description: 'Height of the skeleton. Text variant has a default height.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes merged via cn().' },
        ]} />
      </Section>

      <Section title="Accessibility" description="Built-in accessibility features.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Animation:</strong> Uses a subtle pulse animation. Respects prefers-reduced-motion automatically via CSS.</p>
          <p className="text-sm"><strong>Screen readers:</strong> Add aria-busy="true" on the parent container and aria-label for context.</p>
        </div>
      </Section>
    </div>
  );
}
