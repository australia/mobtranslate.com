'use client';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, Input, Switch } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function TabsPage() {
  const [activeTab, setActiveTab] = useState('account');

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Tabs</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Organize content into separate views that users can switch between. Tabs
        provide a way to navigate between related content panels without leaving the page.
      </p>

      {/* ------------------------------------------------------------------ */}
      <Section title="Basic Usage" description="A tab list with content panels. Only the active panel is displayed.">
        <ComponentPreview>
          <Tabs defaultValue="account">
            <TabsList>
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="password">Password</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
            </TabsList>
            <TabsContent value="account">
              <div className="p-4">
                <h3 className="font-semibold mb-2">Account Settings</h3>
                <p className="text-sm text-[var(--color-muted-foreground)]">Make changes to your account here. Click save when you are done.</p>
              </div>
            </TabsContent>
            <TabsContent value="password">
              <div className="p-4">
                <h3 className="font-semibold mb-2">Password</h3>
                <p className="text-sm text-[var(--color-muted-foreground)]">Change your password here. After saving, you will be logged out.</p>
              </div>
            </TabsContent>
            <TabsContent value="notifications">
              <div className="p-4">
                <h3 className="font-semibold mb-2">Notifications</h3>
                <p className="text-sm text-[var(--color-muted-foreground)]">Configure how you receive notifications.</p>
              </div>
            </TabsContent>
          </Tabs>
        </ComponentPreview>
        <CodeBlock code={`<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
    <TabsTrigger value="notifications">Notifications</TabsTrigger>
  </TabsList>
  <TabsContent value="account">
    <p>Account settings content.</p>
  </TabsContent>
  <TabsContent value="password">
    <p>Password settings content.</p>
  </TabsContent>
</Tabs>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Controlled Tabs" description="Use value and onValueChange to control the active tab externally.">
        <ComponentPreview>
          <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="billing">Billing</TabsTrigger>
                <TabsTrigger value="team">Team</TabsTrigger>
              </TabsList>
              <TabsContent value="account">
                <div className="p-4">
                  <p className="text-sm text-[var(--color-muted-foreground)]">Manage your account details and preferences.</p>
                </div>
              </TabsContent>
              <TabsContent value="billing">
                <div className="p-4">
                  <p className="text-sm text-[var(--color-muted-foreground)]">View and manage your billing information.</p>
                </div>
              </TabsContent>
              <TabsContent value="team">
                <div className="p-4">
                  <p className="text-sm text-[var(--color-muted-foreground)]">Invite and manage team members.</p>
                </div>
              </TabsContent>
            </Tabs>
            <div className="flex gap-2">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Active: <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">{activeTab}</code>
              </p>
            </div>
            <div className="flex gap-2">
              {['account', 'billing', 'team'].map((tab) => (
                <button
                  key={tab}
                  className="text-sm text-[var(--color-primary)] underline"
                  onClick={() => setActiveTab(tab)}
                >
                  Go to {tab}
                </button>
              ))}
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`const [activeTab, setActiveTab] = useState('account');

<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="billing">Billing</TabsTrigger>
    <TabsTrigger value="team">Team</TabsTrigger>
  </TabsList>
  <TabsContent value="account">...</TabsContent>
  <TabsContent value="billing">...</TabsContent>
  <TabsContent value="team">...</TabsContent>
</Tabs>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Disabled Tab" description="Individual tabs can be disabled to prevent selection.">
        <ComponentPreview>
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="disabled" disabled>Disabled</TabsTrigger>
              <TabsTrigger value="other">Other</TabsTrigger>
            </TabsList>
            <TabsContent value="active"><p className="p-4 text-sm text-[var(--color-muted-foreground)]">This tab is active and selectable.</p></TabsContent>
            <TabsContent value="other"><p className="p-4 text-sm text-[var(--color-muted-foreground)]">This tab is also selectable. The middle tab is disabled.</p></TabsContent>
          </Tabs>
        </ComponentPreview>
        <CodeBlock code={`<Tabs defaultValue="active">
  <TabsList>
    <TabsTrigger value="active">Active</TabsTrigger>
    <TabsTrigger value="disabled" disabled>Disabled</TabsTrigger>
    <TabsTrigger value="other">Other</TabsTrigger>
  </TabsList>
  ...
</Tabs>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Two Tabs" description="Simple two-tab layout for binary content switching.">
        <ComponentPreview>
          <Tabs defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
            </TabsList>
            <TabsContent value="preview">
              <div className="p-4 border-2 border-[var(--color-border)] border-t-0 rounded-b-lg">
                <div className="bg-[var(--color-muted)] rounded-lg p-8 text-center">
                  <p className="text-sm font-medium">Component Preview Area</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Your component renders here</p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="code">
              <div className="p-4 border-2 border-[var(--color-border)] border-t-0 rounded-b-lg">
                <pre className="bg-[var(--color-foreground)] text-[var(--color-background)] p-4 rounded text-sm font-mono">
                  {'<Button variant="primary">Click me</Button>'}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </ComponentPreview>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Many Tabs" description="When there are many tabs, the tab list scrolls horizontally.">
        <ComponentPreview>
          <Tabs defaultValue="tab-1">
            <TabsList>
              {Array.from({ length: 8 }, (_, i) => (
                <TabsTrigger key={i} value={`tab-${i + 1}`}>
                  Tab {i + 1}
                </TabsTrigger>
              ))}
            </TabsList>
            {Array.from({ length: 8 }, (_, i) => (
              <TabsContent key={i} value={`tab-${i + 1}`}>
                <p className="p-4 text-sm text-[var(--color-muted-foreground)]">
                  Content for Tab {i + 1}. This demonstrates horizontal scrolling when there are many tab triggers.
                </p>
              </TabsContent>
            ))}
          </Tabs>
        </ComponentPreview>
        <CodeBlock code={`<Tabs defaultValue="tab-1">
  <TabsList>
    {Array.from({ length: 8 }, (_, i) => (
      <TabsTrigger key={i} value={\`tab-\${i + 1}\`}>
        Tab {i + 1}
      </TabsTrigger>
    ))}
  </TabsList>
  {Array.from({ length: 8 }, (_, i) => (
    <TabsContent key={i} value={\`tab-\${i + 1}\`}>
      <p>Content for Tab {i + 1}</p>
    </TabsContent>
  ))}
</Tabs>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Rich Content Panels" description="Tab panels can contain any content including forms, lists, and other components.">
        <ComponentPreview>
          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="preferences">Preferences</TabsTrigger>
              <TabsTrigger value="danger">Danger Zone</TabsTrigger>
            </TabsList>
            <TabsContent value="profile">
              <div className="p-4 space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="mt-field-label">Display Name</label>
                  <Input defaultValue="John Doe" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="mt-field-label">Email</label>
                  <Input type="email" defaultValue="john@example.com" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="mt-field-label">Bio</label>
                  <Input defaultValue="Software developer" />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="preferences">
              <div className="p-4 space-y-0">
                {['Dark mode', 'Compact layout', 'Show avatars', 'Enable sounds'].map((label, i) => (
                  <div key={label} className="flex items-center justify-between py-3 border-b border-[var(--color-border)]">
                    <span className="text-sm font-medium">{label}</span>
                    <Switch defaultChecked={i % 2 === 0} aria-label={label} />
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="danger">
              <div className="p-4">
                <div className="mt-alert mt-alert-error">
                  <h4 className="mt-alert-title">Delete Account</h4>
                  <p className="mt-alert-description">
                    Once you delete your account, there is no going back. This action is permanent.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </ComponentPreview>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Settings Page Pattern" description="A full settings page layout using tabs for navigation between sections.">
        <ComponentPreview>
          <div className="max-w-2xl">
            <h3 className="font-semibold text-lg mb-1">Settings</h3>
            <p className="text-sm text-[var(--color-muted-foreground)] mb-4">Manage your account settings and preferences.</p>
            <Tabs defaultValue="general">
              <TabsList>
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
                <TabsTrigger value="integrations">Integrations</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>
              <TabsContent value="general">
                <div className="p-4 space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="mt-field-label">Workspace Name</label>
                    <Input defaultValue="My Workspace" />
                    <p className="mt-field-description">This is the name displayed across your workspace.</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="mt-field-label">Workspace URL</label>
                    <Input defaultValue="my-workspace" />
                    <p className="mt-field-description">Used in your workspace URL: app.example.com/my-workspace</p>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="security">
                <div className="p-4">
                  <p className="text-sm text-[var(--color-muted-foreground)]">Configure security settings including two-factor authentication and session management.</p>
                </div>
              </TabsContent>
              <TabsContent value="integrations">
                <div className="p-4">
                  <p className="text-sm text-[var(--color-muted-foreground)]">Connect third-party services and manage API access.</p>
                </div>
              </TabsContent>
              <TabsContent value="advanced">
                <div className="p-4">
                  <p className="text-sm text-[var(--color-muted-foreground)]">Advanced configuration options for power users.</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ComponentPreview>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="API Reference">
        <h3 className="font-semibold mt-4 mb-2">Tabs</h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          The root container that manages tab state. Built on Base UI Tabs.
        </p>
        <PropsTable props={[
          { name: 'defaultValue', type: 'string', default: '-', description: 'The value of the initially active tab for uncontrolled usage.' },
          { name: 'value', type: 'string', default: '-', description: 'Controlled active tab value. Use with onValueChange for full control.' },
          { name: 'onValueChange', type: '(value: string) => void', default: '-', description: 'Callback fired when the active tab changes. Receives the new tab value.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the tabs container.' },
          { name: 'ref', type: 'React.Ref<HTMLDivElement>', default: '-', description: 'Forwarded ref to the tabs root element.' },
        ]} />

        <h3 className="font-semibold mt-8 mb-2">TabsList</h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          Contains the tab triggers. Renders an animated indicator under the active tab.
        </p>
        <PropsTable props={[
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'TabsTrigger components to render as tab buttons.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the tab list container.' },
          { name: 'ref', type: 'React.Ref<HTMLDivElement>', default: '-', description: 'Forwarded ref to the tab list element.' },
        ]} />

        <h3 className="font-semibold mt-8 mb-2">TabsTrigger</h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          An individual tab button within the TabsList.
        </p>
        <PropsTable props={[
          { name: 'value', type: 'string', default: '-', description: 'Unique identifier for this tab. Must match a corresponding TabsContent value.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables this tab trigger. Users cannot click or keyboard-navigate to it.' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'The content of the tab trigger (typically text).' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the tab trigger.' },
          { name: 'ref', type: 'React.Ref<HTMLButtonElement>', default: '-', description: 'Forwarded ref to the tab trigger button element.' },
        ]} />

        <h3 className="font-semibold mt-8 mb-2">TabsContent</h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          The content panel associated with a tab trigger. Only the active panel is rendered.
        </p>
        <PropsTable props={[
          { name: 'value', type: 'string', default: '-', description: 'The value that links this panel to its corresponding TabsTrigger.' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'The content to display when this tab is active.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the content panel.' },
          { name: 'ref', type: 'React.Ref<HTMLDivElement>', default: '-', description: 'Forwarded ref to the content panel element.' },
        ]} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-1">ARIA Pattern</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Implements the WAI-ARIA Tabs pattern. TabsList uses <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">role="tablist"</code>, each TabsTrigger uses <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">role="tab"</code>, and each TabsContent uses <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">role="tabpanel"</code>. The <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-selected</code>, <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-controls</code>, and <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-labelledby</code> attributes are managed automatically.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Keyboard Interaction</h3>
            <ul className="text-sm text-[var(--color-muted-foreground)] list-disc list-inside space-y-1">
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Tab</kbd> moves focus into the tab list (onto the active tab) and then into the active panel.</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Arrow Left</kbd> / <kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Arrow Right</kbd> navigates between tab triggers.</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Home</kbd> moves focus to the first tab trigger.</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">End</kbd> moves focus to the last tab trigger.</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Space</kbd> / <kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Enter</kbd> activates the focused tab.</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Animated Indicator</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              The active tab indicator animates its position and width when switching between tabs. The animation is purely visual and does not affect screen reader announcements or keyboard behavior.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Focus Management</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Uses roving tabindex within the tab list. Only the active tab trigger is in the tab order. Disabled tabs are skipped during keyboard navigation. Focus indicators meet WCAG 2.1 SC 2.4.7 (Focus Visible).
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Content Visibility</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Inactive panels are hidden from the DOM using the Base UI panel rendering strategy. This ensures screen readers only announce the active panel content. Use <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-label</code> on the Tabs root if the tab context is not clear from surrounding content.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
