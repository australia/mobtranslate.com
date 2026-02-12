import { VisuallyHidden } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function VisuallyHiddenPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Visually Hidden</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Hides content visually while keeping it accessible to screen readers.
      </p>

      <Section title="Usage" description="The text below is invisible but announced by screen readers.">
        <ComponentPreview>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button className="border-2 border-[var(--color-border)] rounded-md p-2" aria-label="Close dialog">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
                <VisuallyHidden>Close dialog</VisuallyHidden>
              </button>
              <span className="text-sm text-[var(--color-muted-foreground)]">
                The button has a VisuallyHidden label {"\""}Close dialog{"\""}
              </span>
            </div>
            <div>
              <p className="text-sm">
                Items in cart: 3
                <VisuallyHidden> items currently in your shopping cart</VisuallyHidden>
              </p>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Screen readers hear: {"\""}Items in cart: 3 items currently in your shopping cart{"\""}
              </p>
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<button aria-label="Close">
  <CloseIcon />
  <VisuallyHidden>Close dialog</VisuallyHidden>
</button>

<p>
  Items in cart: {count}
  <VisuallyHidden> items currently in your shopping cart</VisuallyHidden>
</p>`} />
      </Section>

      <Section title="How It Works">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm">Uses CSS to visually hide the element while keeping it in the accessibility tree:</p>
          <ul className="text-sm list-disc pl-5 space-y-1 text-[var(--color-muted-foreground)]">
            <li>Position absolute, 1x1 pixel size</li>
            <li>Overflow hidden, clip to zero</li>
            <li>Not display:none (which removes from a11y tree)</li>
            <li>Not visibility:hidden (also removes from a11y tree)</li>
          </ul>
        </div>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'Content to hide visually but expose to screen readers.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>
    </div>
  );
}
