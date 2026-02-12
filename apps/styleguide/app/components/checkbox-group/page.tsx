'use client';
import { CheckboxGroup, Checkbox } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function CheckboxGroupPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Checkbox Group</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Group of related checkboxes.</p>
      <Section title="Default">
        <ComponentPreview>
          <CheckboxGroup>
            <Checkbox label="Option A" name="options" value="a" />
            <Checkbox label="Option B" name="options" value="b" />
            <Checkbox label="Option C" name="options" value="c" />
          </CheckboxGroup>
        </ComponentPreview>
      </Section>
    </div>
  );
}
