'use client';
import { Dialog, DialogTrigger, DialogPortal, DialogBackdrop, DialogPopup, DialogTitle, DialogDescription, DialogClose, Button, Input } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function DialogPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Dialog</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A modal overlay that demands user attention for critical information or actions.
        Dialogs interrupt the current workflow and require the user to acknowledge or
        interact before returning to the underlying content.
      </p>

      <Section title="Basic Dialog" description="The simplest dialog with a title, description, and action buttons. This is the most common pattern for confirmations and informational messages.">
        <ComponentPreview>
          <Dialog>
            <DialogTrigger render={<Button>Open Dialog</Button>} />
            <DialogPortal>
              <DialogBackdrop />
              <DialogPopup>
                <DialogTitle>Edit Profile</DialogTitle>
                <DialogDescription>Make changes to your profile here. Click save when you are done.</DialogDescription>
                <div className="mt-4 space-y-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="mt-field-label">Name</label>
                    <Input defaultValue="John Doe" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="mt-field-label">Username</label>
                    <Input defaultValue="@johndoe" />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <DialogClose render={<Button variant="outline">Cancel</Button>} />
                  <DialogClose render={<Button>Save Changes</Button>} />
                </div>
              </DialogPopup>
            </DialogPortal>
          </Dialog>
        </ComponentPreview>
        <CodeBlock code={`<Dialog>
  <DialogTrigger render={<Button>Open Dialog</Button>} />
  <DialogPortal>
    <DialogBackdrop />
    <DialogPopup>
      <DialogTitle>Edit Profile</DialogTitle>
      <DialogDescription>
        Make changes to your profile here.
      </DialogDescription>
      <div className="mt-4 space-y-3">
        <Input defaultValue="John Doe" />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <DialogClose render={<Button variant="outline">Cancel</Button>} />
        <DialogClose render={<Button>Save Changes</Button>} />
      </div>
    </DialogPopup>
  </DialogPortal>
</Dialog>`} />
      </Section>

      <Section title="Sizes" description="Four size options control the maximum width of the dialog to accommodate different amounts of content. Use sm for simple confirmations, md for forms, lg for complex content, and xl for wide layouts.">
        <ComponentPreview>
          <div className="flex flex-wrap gap-3">
            {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
              <Dialog key={size}>
                <DialogTrigger render={<Button variant="outline">{size.toUpperCase()}</Button>} />
                <DialogPortal>
                  <DialogBackdrop />
                  <DialogPopup size={size}>
                    <DialogTitle>{size.toUpperCase()} Dialog</DialogTitle>
                    <DialogDescription>
                      This dialog uses the <strong>{size}</strong> size variant with a max-width of{' '}
                      {size === 'sm' ? '24rem (384px)' : size === 'md' ? '32rem (512px)' : size === 'lg' ? '42rem (672px)' : '56rem (896px)'}.
                    </DialogDescription>
                    <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.
                    </p>
                    <div className="mt-4 flex justify-end">
                      <DialogClose render={<Button>Close</Button>} />
                    </div>
                  </DialogPopup>
                </DialogPortal>
              </Dialog>
            ))}
          </div>
        </ComponentPreview>
        <CodeBlock code={`<DialogPopup size="sm">  {/* max-width: 24rem */}
<DialogPopup size="md">  {/* max-width: 32rem (default) */}
<DialogPopup size="lg">  {/* max-width: 42rem */}
<DialogPopup size="xl">  {/* max-width: 56rem */}`} />
      </Section>

      <Section title="Confirmation Dialog" description="A common pattern for destructive or irreversible actions. Uses a sm size dialog with a clear warning message and prominent destructive action button.">
        <ComponentPreview>
          <Dialog>
            <DialogTrigger render={<Button variant="destructive">Delete Account</Button>} />
            <DialogPortal>
              <DialogBackdrop />
              <DialogPopup size="sm">
                <DialogTitle>Are you absolutely sure?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. This will permanently delete your account and remove all associated data from our servers.
                </DialogDescription>
                <div className="mt-6 flex justify-end gap-2">
                  <DialogClose render={<Button variant="outline">Cancel</Button>} />
                  <DialogClose render={<Button variant="destructive">Delete Account</Button>} />
                </div>
              </DialogPopup>
            </DialogPortal>
          </Dialog>
        </ComponentPreview>
        <CodeBlock code={`<Dialog>
  <DialogTrigger render={<Button variant="destructive">Delete Account</Button>} />
  <DialogPortal>
    <DialogBackdrop />
    <DialogPopup size="sm">
      <DialogTitle>Are you absolutely sure?</DialogTitle>
      <DialogDescription>
        This action cannot be undone.
      </DialogDescription>
      <div className="mt-6 flex justify-end gap-2">
        <DialogClose render={<Button variant="outline">Cancel</Button>} />
        <DialogClose render={<Button variant="destructive">Delete Account</Button>} />
      </div>
    </DialogPopup>
  </DialogPortal>
</Dialog>`} />
      </Section>

      <Section title="Simple Informational" description="A dialog with just a title, description, and a single close action. Useful for alerts and notifications that require acknowledgement.">
        <ComponentPreview>
          <Dialog>
            <DialogTrigger render={<Button variant="outline">Show Notice</Button>} />
            <DialogPortal>
              <DialogBackdrop />
              <DialogPopup size="sm">
                <DialogTitle>Scheduled Maintenance</DialogTitle>
                <DialogDescription>
                  The system will be undergoing maintenance on Saturday, March 15 from 2:00 AM to 6:00 AM UTC. During this time, some features may be temporarily unavailable.
                </DialogDescription>
                <div className="mt-6 flex justify-end">
                  <DialogClose render={<Button>Got it</Button>} />
                </div>
              </DialogPopup>
            </DialogPortal>
          </Dialog>
        </ComponentPreview>
      </Section>

      <Section title="Form Dialog" description="Dialogs are commonly used to collect user input through forms. Combine with Input and other form components for structured data entry.">
        <ComponentPreview>
          <Dialog>
            <DialogTrigger render={<Button>Create New Project</Button>} />
            <DialogPortal>
              <DialogBackdrop />
              <DialogPopup size="md">
                <DialogTitle>Create Project</DialogTitle>
                <DialogDescription>
                  Add a new project to your workspace. Fill in the details below.
                </DialogDescription>
                <div className="mt-4 space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="mt-field-label">Project Name</label>
                    <Input placeholder="My new project" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="mt-field-label">Description</label>
                    <Input placeholder="A brief description of your project" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="mt-field-label">Repository URL</label>
                    <Input placeholder="https://github.com/..." />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <DialogClose render={<Button variant="outline">Cancel</Button>} />
                  <DialogClose render={<Button>Create Project</Button>} />
                </div>
              </DialogPopup>
            </DialogPortal>
          </Dialog>
        </ComponentPreview>
      </Section>

      <Section title="Scrollable Content" description="When dialog content exceeds the viewport height, the dialog body becomes scrollable while keeping the header and footer actions visible.">
        <ComponentPreview>
          <Dialog>
            <DialogTrigger render={<Button variant="outline">Terms of Service</Button>} />
            <DialogPortal>
              <DialogBackdrop />
              <DialogPopup size="md">
                <DialogTitle>Terms of Service</DialogTitle>
                <DialogDescription>Please read and accept the terms of service to continue.</DialogDescription>
                <div className="mt-4 max-h-48 overflow-y-auto border border-[var(--color-border)] rounded p-3 text-sm text-[var(--color-muted-foreground)] space-y-3">
                  <p><strong>1. Acceptance of Terms</strong></p>
                  <p>By accessing and using this service, you accept and agree to be bound by the terms and provision of this agreement.</p>
                  <p><strong>2. Use License</strong></p>
                  <p>Permission is granted to temporarily use this service for personal, non-commercial transitory viewing only.</p>
                  <p><strong>3. Disclaimer</strong></p>
                  <p>The materials on this service are provided on an as is basis. We make no warranties, expressed or implied, and hereby disclaim all other warranties.</p>
                  <p><strong>4. Limitations</strong></p>
                  <p>In no event shall we or our suppliers be liable for any damages arising out of the use or inability to use the materials on our service.</p>
                  <p><strong>5. Revisions</strong></p>
                  <p>We may revise these terms of service at any time without notice. By using this service you are agreeing to be bound by the then current version of these terms.</p>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <DialogClose render={<Button variant="outline">Decline</Button>} />
                  <DialogClose render={<Button>Accept</Button>} />
                </div>
              </DialogPopup>
            </DialogPortal>
          </Dialog>
        </ComponentPreview>
      </Section>

      <Section title="Nested Trigger Variants" description="The dialog trigger can be any interactive element. Use the render prop to customize the trigger appearance.">
        <ComponentPreview>
          <div className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger render={<Button>Primary Trigger</Button>} />
              <DialogPortal>
                <DialogBackdrop />
                <DialogPopup size="sm">
                  <DialogTitle>Triggered by Primary Button</DialogTitle>
                  <DialogDescription>This dialog was opened with a primary button trigger.</DialogDescription>
                  <div className="mt-4 flex justify-end">
                    <DialogClose render={<Button>Close</Button>} />
                  </div>
                </DialogPopup>
              </DialogPortal>
            </Dialog>
            <Dialog>
              <DialogTrigger render={<Button variant="outline">Outline Trigger</Button>} />
              <DialogPortal>
                <DialogBackdrop />
                <DialogPopup size="sm">
                  <DialogTitle>Triggered by Outline Button</DialogTitle>
                  <DialogDescription>This dialog was opened with an outline button trigger.</DialogDescription>
                  <div className="mt-4 flex justify-end">
                    <DialogClose render={<Button>Close</Button>} />
                  </div>
                </DialogPopup>
              </DialogPortal>
            </Dialog>
            <Dialog>
              <DialogTrigger render={<Button variant="ghost">Ghost Trigger</Button>} />
              <DialogPortal>
                <DialogBackdrop />
                <DialogPopup size="sm">
                  <DialogTitle>Triggered by Ghost Button</DialogTitle>
                  <DialogDescription>This dialog was opened with a ghost button trigger.</DialogDescription>
                  <div className="mt-4 flex justify-end">
                    <DialogClose render={<Button>Close</Button>} />
                  </div>
                </DialogPopup>
              </DialogPortal>
            </Dialog>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <h3 className="font-semibold mt-4 mb-2">DialogPopup</h3>
        <PropsTable props={[
          { name: 'size', type: "'sm' | 'md' | 'lg' | 'xl'", default: "'md'", description: 'Controls the maximum width of the dialog popup.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes merged via cn().' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'The dialog content including title, description, and actions.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">DialogBackdrop</h3>
        <PropsTable props={[
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the semi-transparent overlay.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">DialogTitle</h3>
        <PropsTable props={[
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the heading element.' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'The heading text content.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">DialogDescription</h3>
        <PropsTable props={[
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the description paragraph.' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'Descriptive text content below the title.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">All Dialog Parts</h3>
        <PropsTable props={[
          { name: 'Dialog', type: 'Root', default: '-', description: 'Root component that manages the open/closed state of the dialog.' },
          { name: 'DialogTrigger', type: 'Trigger', default: '-', description: 'Element that opens the dialog when clicked. Use render prop for custom triggers.' },
          { name: 'DialogPortal', type: 'Portal', default: '-', description: 'Renders dialog content in a React portal outside the normal DOM hierarchy.' },
          { name: 'DialogBackdrop', type: 'Backdrop', default: '-', description: 'Semi-transparent overlay behind the dialog that prevents interaction with underlying content.' },
          { name: 'DialogPopup', type: 'Popup', default: '-', description: 'The main dialog container with size variants and centered positioning.' },
          { name: 'DialogTitle', type: 'Title', default: '-', description: 'Heading element linked via aria-labelledby to the dialog for screen readers.' },
          { name: 'DialogDescription', type: 'Description', default: '-', description: 'Supplementary text linked via aria-describedby to the dialog.' },
          { name: 'DialogClose', type: 'Close', default: '-', description: 'Button that closes the dialog when clicked. Use render prop for custom close elements.' },
        ]} />
      </Section>

      <Section title="Accessibility" description="The Dialog component follows WAI-ARIA dialog (modal) design pattern.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Focus management:</strong> When opened, focus moves to the first focusable element within the dialog. Focus is trapped and cycles through interactive elements using Tab and Shift+Tab.</p>
          <p className="text-sm"><strong>Escape key:</strong> Pressing Escape closes the dialog and returns focus to the trigger element.</p>
          <p className="text-sm"><strong>Backdrop click:</strong> Clicking the backdrop overlay closes the dialog.</p>
          <p className="text-sm"><strong>ARIA attributes:</strong> The dialog uses role=&quot;dialog&quot; with aria-modal=&quot;true&quot;. The DialogTitle is linked via aria-labelledby and DialogDescription via aria-describedby.</p>
          <p className="text-sm"><strong>Scroll lock:</strong> Background scrolling is disabled when the dialog is open to keep user attention on the modal content.</p>
          <p className="text-sm"><strong>Screen readers:</strong> The dialog title and description are announced automatically when the dialog opens. Use meaningful, concise titles for clarity.</p>
        </div>
      </Section>

      <Section title="Best Practices">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-green-700">Do</p>
            <ul className="text-sm list-disc list-inside space-y-1 mt-1 text-[var(--color-muted-foreground)]">
              <li>Use dialogs sparingly for critical actions that require user attention.</li>
              <li>Always include a clear title and description to provide context.</li>
              <li>Provide a visible way to dismiss the dialog (Cancel button or close action).</li>
              <li>Use the sm size for simple confirmations and md for forms.</li>
              <li>Place the primary action button on the right side of the footer.</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700">Don&apos;t</p>
            <ul className="text-sm list-disc list-inside space-y-1 mt-1 text-[var(--color-muted-foreground)]">
              <li>Nest dialogs within other dialogs &mdash; use a single dialog with step-based content instead.</li>
              <li>Use dialogs for non-essential information that could be shown inline.</li>
              <li>Omit the DialogTitle &mdash; it is required for accessibility.</li>
              <li>Place too many form fields in a dialog; consider a full page for complex forms.</li>
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
