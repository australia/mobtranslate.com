import { Section } from '../../../components/section';
import { CodeBlock } from '../../../components/code-block';

export default function GettingStartedPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Getting Started</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Set up Mobtranslate UI in your project in under 5 minutes.
      </p>

      <Section title="Installation" description="Install the package from the workspace.">
        <CodeBlock language="bash" code={`pnpm add @mobtranslate/ui`} />
      </Section>

      <Section title="Import Tokens" description="Add the token CSS to your global styles.">
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          In your app{"'"}s <code className="font-mono bg-[var(--color-muted)] px-1 rounded">globals.css</code>, import the token and component stylesheets:
        </p>
        <CodeBlock language="css" code={`@import "@mobtranslate/ui/tokens/tokens.css";
@import "@mobtranslate/ui/components/components.css";`} />
      </Section>

      <Section title="Use Components" description="Import and use any component from the library.">
        <CodeBlock code={`import { Button, Input, Dialog } from '@mobtranslate/ui';

export function LoginForm() {
  return (
    <form>
      <Input placeholder="Email" type="email" />
      <Input placeholder="Password" type="password" />
      <Button variant="primary">Sign In</Button>
    </form>
  );
}`} />
      </Section>

      <Section title="TypeScript Support" description="Full type safety out of the box.">
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          All components export typed prop interfaces. Token values are available as TypeScript types for building custom components.
        </p>
        <CodeBlock code={`import type { ButtonProps, InputProps } from '@mobtranslate/ui';
import { colors, spacing } from '@mobtranslate/ui';

// Token values are fully typed
const primary = colors.blue[600]; // type-safe access`} />
      </Section>

      <Section title="Dark Mode" description="Enable dark mode with a single class.">
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          Add the <code className="font-mono bg-[var(--color-muted)] px-1 rounded">dark</code> class to your <code className="font-mono bg-[var(--color-muted)] px-1 rounded">&lt;html&gt;</code> element. All tokens automatically switch to their dark variants.
        </p>
        <CodeBlock code={`// Toggle dark mode
document.documentElement.classList.toggle('dark');`} />
      </Section>

      <Section title="Project Structure">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 font-mono text-sm space-y-1">
          <p>packages/ui/</p>
          <p className="pl-4">src/tokens/ &mdash; Design token system (primitives, semantic, component)</p>
          <p className="pl-4">src/components/ &mdash; 50 styled components built on Base UI</p>
          <p className="pl-4">src/utils/ &mdash; Utility functions (cn, etc.)</p>
        </div>
      </Section>
    </div>
  );
}
