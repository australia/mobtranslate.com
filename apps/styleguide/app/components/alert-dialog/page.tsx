'use client';
import { AlertDialog, AlertDialogTrigger, AlertDialogPortal, AlertDialogBackdrop, AlertDialogPopup, AlertDialogTitle, AlertDialogDescription, AlertDialogClose, Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function AlertDialogPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Alert Dialog</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        An interruptive modal dialog that requires a response before the user can continue.
      </p>

      <Section title="Destructive Action" description="Confirm before an irreversible action.">
        <ComponentPreview>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive">Delete Item</Button>} />
            <AlertDialogPortal>
              <AlertDialogBackdrop />
              <AlertDialogPopup>
                <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone. The item and all its data will be permanently removed.</AlertDialogDescription>
                <div className="mt-6 flex justify-end gap-2">
                  <AlertDialogClose render={<Button variant="outline">Cancel</Button>} />
                  <AlertDialogClose render={<Button variant="destructive">Delete</Button>} />
                </div>
              </AlertDialogPopup>
            </AlertDialogPortal>
          </AlertDialog>
        </ComponentPreview>
        <CodeBlock code={`<AlertDialog>
  <AlertDialogTrigger render={<Button variant="destructive">Delete</Button>} />
  <AlertDialogPortal>
    <AlertDialogBackdrop />
    <AlertDialogPopup>
      <AlertDialogTitle>Delete this item?</AlertDialogTitle>
      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
      <AlertDialogClose render={<Button variant="outline">Cancel</Button>} />
      <AlertDialogClose render={<Button variant="destructive">Delete</Button>} />
    </AlertDialogPopup>
  </AlertDialogPortal>
</AlertDialog>`} />
      </Section>

      <Section title="Information Alert" description="Alert with a single acknowledgement action.">
        <ComponentPreview>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline">Show Notice</Button>} />
            <AlertDialogPortal>
              <AlertDialogBackdrop />
              <AlertDialogPopup>
                <AlertDialogTitle>Session Expiring</AlertDialogTitle>
                <AlertDialogDescription>Your session will expire in 5 minutes. Please save your work.</AlertDialogDescription>
                <div className="mt-6 flex justify-end">
                  <AlertDialogClose render={<Button>Got it</Button>} />
                </div>
              </AlertDialogPopup>
            </AlertDialogPortal>
          </AlertDialog>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'AlertDialog', type: 'Root', default: '-', description: 'Root component managing open state.' },
          { name: 'AlertDialogTrigger', type: 'Trigger', default: '-', description: 'Button that opens the alert dialog.' },
          { name: 'AlertDialogBackdrop', type: 'Backdrop', default: '-', description: 'Semi-transparent overlay.' },
          { name: 'AlertDialogPopup', type: 'Popup', default: '-', description: 'The alert dialog container.' },
          { name: 'AlertDialogTitle', type: 'Title', default: '-', description: 'Heading text (aria-labelledby).' },
          { name: 'AlertDialogDescription', type: 'Description', default: '-', description: 'Body text (aria-describedby).' },
          { name: 'AlertDialogClose', type: 'Close', default: '-', description: 'Button that closes the alert.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Role:</strong> Uses role=alertdialog which announces urgently to screen readers.</p>
          <p className="text-sm"><strong>Focus trap:</strong> Focus is trapped within the dialog. Clicking outside does NOT close it.</p>
          <p className="text-sm"><strong>Escape:</strong> Escape key does NOT close an alert dialog (unlike regular Dialog).</p>
          <p className="text-sm"><strong>Focus management:</strong> Initial focus goes to the first focusable element (typically Cancel).</p>
        </div>
      </Section>

      <Section title="Dialog vs Alert Dialog">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Dialog:</strong> For general content. Closes on backdrop click and Escape. Use for forms, info, settings.</p>
          <p className="text-sm"><strong>Alert Dialog:</strong> For critical actions. Does NOT close on backdrop click or Escape. Use for deletions, data loss warnings.</p>
        </div>
      </Section>
    </div>
  );
}
