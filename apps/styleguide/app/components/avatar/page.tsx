'use client';
import { Avatar } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function AvatarPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Avatar</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A visual representation of a user or entity, showing an image or fallback initials.
      </p>

      <Section title="Sizes" description="Four size options.">
        <ComponentPreview>
          <div className="flex items-center gap-4">
            <Avatar size="sm" fallback="SM" />
            <Avatar size="md" fallback="MD" />
            <Avatar size="lg" fallback="LG" />
            <Avatar size="xl" fallback="XL" />
          </div>
        </ComponentPreview>
      </Section>

      <Section title="With Image" description="Displays an image when src is provided.">
        <ComponentPreview>
          <div className="flex items-center gap-4">
            <Avatar size="md" src="https://api.dicebear.com/7.x/initials/svg?seed=JD" alt="John Doe" />
            <Avatar size="md" src="https://api.dicebear.com/7.x/initials/svg?seed=AS" alt="Alice Smith" />
            <Avatar size="md" src="https://api.dicebear.com/7.x/initials/svg?seed=BW" alt="Bob Wilson" />
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Fallback" description="Shows initials when no image is available or image fails to load.">
        <ComponentPreview>
          <div className="flex items-center gap-4">
            <Avatar fallback="JD" />
            <Avatar alt="Alice Smith" />
            <Avatar fallback="?" />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Avatar fallback="JD" />
<Avatar alt="Alice Smith" /> {/* Shows 'A' */}
<Avatar fallback="?" />`} />
      </Section>

      <Section title="Avatar Group" description="Multiple avatars stacked together.">
        <ComponentPreview>
          <div className="flex -space-x-2">
            {['A', 'B', 'C', 'D', '+3'].map((letter) => (
              <Avatar key={letter} size="md" fallback={letter} className="border-2 border-[var(--color-background)]" />
            ))}
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'size', type: "'sm' | 'md' | 'lg' | 'xl'", default: "'md'", description: 'Avatar size (2rem to 4rem).' },
          { name: 'src', type: 'string', default: '-', description: 'Image URL.' },
          { name: 'alt', type: 'string', default: '-', description: 'Alt text for the image.' },
          { name: 'fallback', type: 'string', default: '-', description: 'Text shown when no image (usually initials).' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Alt text:</strong> Always provide alt text for image avatars.</p>
          <p className="text-sm"><strong>Fallback:</strong> Fallback initials are aria-hidden; the alt text conveys the identity.</p>
        </div>
      </Section>
    </div>
  );
}
