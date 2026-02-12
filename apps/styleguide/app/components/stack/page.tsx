'use client';
import { Stack, HStack, VStack } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-2 border-[var(--color-border)] rounded-md px-4 py-2 bg-[var(--color-muted)] text-sm font-medium">
      {children}
    </div>
  );
}

export default function StackPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Stack</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Layout component for arranging children in a vertical or horizontal stack with consistent spacing.
      </p>

      <Section title="Vertical Stack" description="Default column direction with gap.">
        <ComponentPreview>
          <VStack gap={3}>
            <Box>Item 1</Box>
            <Box>Item 2</Box>
            <Box>Item 3</Box>
          </VStack>
        </ComponentPreview>
        <CodeBlock code={`<VStack gap={3}>
  <Box>Item 1</Box>
  <Box>Item 2</Box>
  <Box>Item 3</Box>
</VStack>`} />
      </Section>

      <Section title="Horizontal Stack" description="Row direction with alignment options.">
        <ComponentPreview>
          <HStack gap={3} align="center">
            <Box>Left</Box>
            <Box>Center</Box>
            <Box>Right</Box>
          </HStack>
        </ComponentPreview>
        <CodeBlock code={`<HStack gap={3} align="center">
  <Box>Left</Box>
  <Box>Center</Box>
  <Box>Right</Box>
</HStack>`} />
      </Section>

      <Section title="Justify Content" description="Distribute items along the main axis.">
        <ComponentPreview>
          <VStack gap={4}>
            <div>
              <label className="text-sm font-medium mb-1 block">space-between</label>
              <HStack justify="between">
                <Box>A</Box><Box>B</Box><Box>C</Box>
              </HStack>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">center</label>
              <HStack justify="center" gap={3}>
                <Box>A</Box><Box>B</Box><Box>C</Box>
              </HStack>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">end</label>
              <HStack justify="end" gap={3}>
                <Box>A</Box><Box>B</Box><Box>C</Box>
              </HStack>
            </div>
          </VStack>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'direction', type: "'row' | 'column'", default: "'column'", description: 'Stack direction. Use HStack/VStack shortcuts.' },
          { name: 'gap', type: 'number | string', default: '3', description: 'Gap between items. Numbers use 0.25rem units.' },
          { name: 'align', type: "'start' | 'center' | 'end' | 'stretch' | 'baseline'", default: '-', description: 'Cross-axis alignment.' },
          { name: 'justify', type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'", default: '-', description: 'Main-axis distribution.' },
          { name: 'wrap', type: 'boolean', default: 'false', description: 'Allow items to wrap to next line.' },
        ]} />
      </Section>
    </div>
  );
}
