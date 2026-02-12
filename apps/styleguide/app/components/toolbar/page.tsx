'use client';
import { Toolbar, ToolbarButton, ToolbarSeparator, ToolbarGroup } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function ToolbarPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Toolbar</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Grouping of action buttons.</p>
      <Section title="Default">
        <ComponentPreview>
          <Toolbar>
            <ToolbarGroup>
              <ToolbarButton>B</ToolbarButton>
              <ToolbarButton>I</ToolbarButton>
              <ToolbarButton>U</ToolbarButton>
            </ToolbarGroup>
            <ToolbarSeparator />
            <ToolbarGroup>
              <ToolbarButton>L</ToolbarButton>
              <ToolbarButton>C</ToolbarButton>
              <ToolbarButton>R</ToolbarButton>
            </ToolbarGroup>
          </Toolbar>
        </ComponentPreview>
      </Section>
    </div>
  );
}
