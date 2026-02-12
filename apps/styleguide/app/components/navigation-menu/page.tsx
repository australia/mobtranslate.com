'use client';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function NavigationMenuPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Navigation Menu</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Site navigation with dropdown content.</p>
      <Section title="Default">
        <ComponentPreview>
          <p className="text-[var(--color-muted-foreground)]">Navigation Menu wraps Base UI NavigationMenu primitives. See the Navigation pattern page for composed examples.</p>
        </ComponentPreview>
      </Section>
    </div>
  );
}
