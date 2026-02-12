'use client';
import { useState } from 'react';
import { Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

function ToastDemo() {
  const [toasts, setToasts] = useState<{ id: number; title: string; description: string; variant?: string }[]>([]);
  const addToast = (title: string, description: string, variant?: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, description, variant }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => addToast('Event Created', 'Your event has been created successfully.')}>Default Toast</Button>
        <Button variant="outline" onClick={() => addToast('Success!', 'Your changes have been saved.', 'success')}>Success</Button>
        <Button variant="outline" onClick={() => addToast('Error', 'Something went wrong. Please try again.', 'error')}>Error</Button>
        <Button variant="outline" onClick={() => addToast('Warning', 'Your trial ends in 3 days.', 'warning')}>Warning</Button>
      </div>
      <div className="fixed bottom-4 right-4 z-[700] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div key={t.id} className={`mt-toast ${t.variant ? `mt-toast-${t.variant}` : ''}`}>
            <span className="mt-toast-title">{t.title}</span>
            <span className="mt-toast-description">{t.description}</span>
            <button className="mt-toast-close" onClick={() => setToasts(prev => prev.filter(toast => toast.id !== t.id))}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ToastPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Toast</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Brief, non-intrusive notifications that appear temporarily to inform users of events.
      </p>

      <Section title="Interactive Demo" description="Click buttons to trigger toast notifications. They auto-dismiss after 4 seconds.">
        <ComponentPreview>
          <ToastDemo />
        </ComponentPreview>
      </Section>

      <Section title="Variants" description="Visual variants to communicate different types of feedback.">
        <ComponentPreview>
          <div className="space-y-3 max-w-sm">
            <div className="mt-toast"><span className="mt-toast-title">Default</span><span className="mt-toast-description">A neutral notification.</span></div>
            <div className="mt-toast mt-toast-success"><span className="mt-toast-title">Success</span><span className="mt-toast-description">Action completed successfully.</span></div>
            <div className="mt-toast mt-toast-error"><span className="mt-toast-title">Error</span><span className="mt-toast-description">Something went wrong.</span></div>
            <div className="mt-toast mt-toast-warning"><span className="mt-toast-title">Warning</span><span className="mt-toast-description">Action may have consequences.</span></div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'title', type: 'string', default: '-', description: 'Toast heading text.' },
          { name: 'description', type: 'string', default: '-', description: 'Toast body text.' },
          { name: 'variant', type: "'default' | 'success' | 'error' | 'warning'", default: "'default'", description: 'Visual variant.' },
          { name: 'duration', type: 'number', default: '4000', description: 'Auto-dismiss time in ms.' },
          { name: 'onClose', type: '() => void', default: '-', description: 'Called when toast is dismissed.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Live region:</strong> Toasts use aria-live="polite" to announce to screen readers.</p>
          <p className="text-sm"><strong>Dismiss:</strong> Close button is keyboard accessible.</p>
          <p className="text-sm"><strong>Duration:</strong> Auto-dismiss gives users enough time to read content.</p>
          <p className="text-sm"><strong>Stacking:</strong> Multiple toasts stack vertically with newest at the bottom.</p>
        </div>
      </Section>
    </div>
  );
}
