'use client';
import { AspectRatio } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function AspectRatioPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Aspect Ratio</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Maintain a consistent width-to-height ratio for responsive content.
      </p>

      <Section title="Common Ratios" description="Different aspect ratios for various content types.">
        <ComponentPreview>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">16:9 (Video)</label>
              <AspectRatio ratio={16 / 9}>
                <div className="w-full h-full bg-[var(--color-muted)] rounded-md flex items-center justify-center text-sm text-[var(--color-muted-foreground)]">
                  16:9
                </div>
              </AspectRatio>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">4:3 (Photo)</label>
              <AspectRatio ratio={4 / 3}>
                <div className="w-full h-full bg-[var(--color-muted)] rounded-md flex items-center justify-center text-sm text-[var(--color-muted-foreground)]">
                  4:3
                </div>
              </AspectRatio>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">1:1 (Square)</label>
              <AspectRatio ratio={1}>
                <div className="w-full h-full bg-[var(--color-muted)] rounded-md flex items-center justify-center text-sm text-[var(--color-muted-foreground)]">
                  1:1
                </div>
              </AspectRatio>
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<AspectRatio ratio={16 / 9}>
  <img src="..." alt="..." className="w-full h-full object-cover" />
</AspectRatio>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'ratio', type: 'number', default: '16/9', description: 'Width-to-height ratio (e.g., 16/9, 4/3, 1).' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>
    </div>
  );
}
