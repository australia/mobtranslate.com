'use client';
import { Menubar } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function MenubarPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Menubar</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Horizontal menu bar container.</p>
      <Section title="Default">
        <ComponentPreview>
          <Menubar>
            <button className="mt-btn mt-btn-ghost mt-btn-sm">File</button>
            <button className="mt-btn mt-btn-ghost mt-btn-sm">Edit</button>
            <button className="mt-btn mt-btn-ghost mt-btn-sm">View</button>
            <button className="mt-btn mt-btn-ghost mt-btn-sm">Help</button>
          </Menubar>
        </ComponentPreview>
      </Section>
    </div>
  );
}
