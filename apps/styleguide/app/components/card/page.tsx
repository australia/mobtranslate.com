'use client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function CardPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Card</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A structured content container with header, body, and footer sections.
      </p>

      <Section title="Basic Card" description="A simple card with header, content, and footer.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Card>
              <CardHeader>
                <CardTitle>Card Title</CardTitle>
                <CardDescription>A brief description of the card content.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">This is the main content area of the card. It can contain any content including text, images, or other components.</p>
              </CardContent>
              <CardFooter>
                <Button size="sm">Action</Button>
                <Button size="sm" variant="outline">Cancel</Button>
              </CardFooter>
            </Card>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Content goes here...</p>
  </CardContent>
  <CardFooter>
    <Button size="sm">Action</Button>
  </CardFooter>
</Card>`} />
      </Section>

      <Section title="Content Only" description="A minimal card with just content.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Card>
              <CardContent>
                <p className="text-sm">A simple card with only content, no header or footer.</p>
              </CardContent>
            </Card>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Card Grid" description="Cards arranged in a responsive grid layout.">
        <ComponentPreview>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['Analytics', 'Reports', 'Settings'] as const).map((title) => (
              <Card key={title}>
                <CardHeader>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>Manage your {title.toLowerCase()}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--color-muted-foreground)]">Configure and view your {title.toLowerCase()} dashboard.</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Interactive Card" description="A card used as a clickable surface.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Card className="cursor-pointer transition-shadow hover:shadow-lg">
              <CardHeader>
                <CardTitle>Clickable Card</CardTitle>
                <CardDescription>Hover to see the elevated shadow effect.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">Cards can be made interactive with hover effects and click handlers.</p>
              </CardContent>
            </Card>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'Card', type: 'HTMLDivElement', default: '-', description: 'Root container. Accepts all div props.' },
          { name: 'CardHeader', type: 'HTMLDivElement', default: '-', description: 'Header section with vertical flex layout.' },
          { name: 'CardTitle', type: 'HTMLHeadingElement', default: '-', description: 'h3 element for the card title.' },
          { name: 'CardDescription', type: 'HTMLParagraphElement', default: '-', description: 'Muted text below the title.' },
          { name: 'CardContent', type: 'HTMLDivElement', default: '-', description: 'Main content area with padding.' },
          { name: 'CardFooter', type: 'HTMLDivElement', default: '-', description: 'Footer with horizontal flex layout.' },
        ]} />
      </Section>

      <Section title="Accessibility" description="Built-in accessibility features.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Structure:</strong> Uses semantic HTML with heading hierarchy (h3 for title).</p>
          <p className="text-sm"><strong>Interactive cards:</strong> When used as a clickable surface, wrap in a link or add role="button" and keyboard handlers.</p>
          <p className="text-sm"><strong>Color contrast:</strong> Card background and text maintain WCAG AA contrast ratios.</p>
        </div>
      </Section>
    </div>
  );
}
