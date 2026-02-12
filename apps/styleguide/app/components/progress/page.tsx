'use client';
import { useState, useEffect } from 'react';
import { Progress, Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

function AnimatedProgress() {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setValue((prev) => (prev >= 100 ? 0 : prev + 10));
    }, 800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <p className="text-sm mb-2">Uploading... {value}%</p>
      <Progress value={value} />
    </div>
  );
}

function InteractiveProgress() {
  const [value, setValue] = useState(60);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm font-medium">Progress</p>
        <span className="text-sm text-[var(--color-muted-foreground)]">{value}%</span>
      </div>
      <Progress value={value} />
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => setValue(0)}>0%</Button>
        <Button size="sm" variant="outline" onClick={() => setValue(Math.max(0, value - 10))}>-10</Button>
        <Button size="sm" variant="outline" onClick={() => setValue(Math.min(100, value + 10))}>+10</Button>
        <Button size="sm" variant="outline" onClick={() => setValue(25)}>25%</Button>
        <Button size="sm" variant="outline" onClick={() => setValue(50)}>50%</Button>
        <Button size="sm" variant="outline" onClick={() => setValue(75)}>75%</Button>
        <Button size="sm" variant="outline" onClick={() => setValue(100)}>100%</Button>
      </div>
    </div>
  );
}

export default function ProgressPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Progress</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Displays the completion progress of a task or operation as a horizontal bar. Progress
        indicators provide visual feedback to help users understand how much work has been completed
        and how much remains.
      </p>

      <Section title="Static Values" description="Progress bars at various fixed values. Use these to represent known, stable states like profile completion or quota usage.">
        <ComponentPreview>
          <div className="max-w-md space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <p className="text-sm font-medium">Empty</p>
                <span className="text-sm text-[var(--color-muted-foreground)]">0%</span>
              </div>
              <Progress value={0} />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <p className="text-sm font-medium">Quarter</p>
                <span className="text-sm text-[var(--color-muted-foreground)]">25%</span>
              </div>
              <Progress value={25} />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <p className="text-sm font-medium">Half</p>
                <span className="text-sm text-[var(--color-muted-foreground)]">50%</span>
              </div>
              <Progress value={50} />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <p className="text-sm font-medium">Three Quarters</p>
                <span className="text-sm text-[var(--color-muted-foreground)]">75%</span>
              </div>
              <Progress value={75} />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <p className="text-sm font-medium">Complete</p>
                <span className="text-sm text-[var(--color-muted-foreground)]">100%</span>
              </div>
              <Progress value={100} />
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Progress value={0} />
<Progress value={25} />
<Progress value={50} />
<Progress value={75} />
<Progress value={100} />`} />
      </Section>

      <Section title="Animated Progress" description="A progress bar that updates automatically over time, simulating a real upload or processing task. The bar resets to 0 after reaching 100%.">
        <ComponentPreview>
          <div className="max-w-md">
            <AnimatedProgress />
          </div>
        </ComponentPreview>
        <CodeBlock code={`const [value, setValue] = useState(0);

useEffect(() => {
  const timer = setInterval(() => {
    setValue((prev) => prev >= 100 ? 0 : prev + 10);
  }, 800);
  return () => clearInterval(timer);
}, []);

<p>Uploading... {value}%</p>
<Progress value={value} />`} />
      </Section>

      <Section title="Interactive" description="Control the progress value manually with buttons. Useful for testing or demonstrating how the progress bar responds to value changes.">
        <ComponentPreview>
          <div className="max-w-md">
            <InteractiveProgress />
          </div>
        </ComponentPreview>
      </Section>

      <Section title="With Contextual Labels" description="Pair progress bars with descriptive labels and percentage values to give users clear context about what is being measured.">
        <ComponentPreview>
          <div className="max-w-md space-y-6">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Storage Used</span>
                <span className="text-sm text-[var(--color-muted-foreground)]">7.2 GB of 10 GB</span>
              </div>
              <Progress value={72} />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Profile Completion</span>
                <span className="text-sm text-[var(--color-muted-foreground)]">4 of 6 steps</span>
              </div>
              <Progress value={66} />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Course Progress</span>
                <span className="text-sm text-[var(--color-muted-foreground)]">3 of 12 lessons</span>
              </div>
              <Progress value={25} />
            </div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Multi-Step Workflow" description="Use progress bars to indicate position within a multi-step process like onboarding, checkout, or wizard flows.">
        <ComponentPreview>
          <div className="max-w-lg space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Step 1 of 4: Account Details</span>
                <span className="text-sm text-[var(--color-muted-foreground)]">25%</span>
              </div>
              <Progress value={25} />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Step 2 of 4: Preferences</span>
                <span className="text-sm text-[var(--color-muted-foreground)]">50%</span>
              </div>
              <Progress value={50} />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Step 3 of 4: Review</span>
                <span className="text-sm text-[var(--color-muted-foreground)]">75%</span>
              </div>
              <Progress value={75} />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Step 4 of 4: Complete</span>
                <span className="text-sm text-[var(--color-muted-foreground)]">100%</span>
              </div>
              <Progress value={100} />
            </div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Stacked Comparison" description="Multiple progress bars stacked together for comparing values across categories. Useful for dashboards, analytics, and reports.">
        <ComponentPreview>
          <div className="max-w-md space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm w-20 text-right">Chrome</span>
              <Progress value={65} className="flex-1" />
              <span className="text-sm text-[var(--color-muted-foreground)] w-10 text-right">65%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm w-20 text-right">Safari</span>
              <Progress value={19} className="flex-1" />
              <span className="text-sm text-[var(--color-muted-foreground)] w-10 text-right">19%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm w-20 text-right">Firefox</span>
              <Progress value={8} className="flex-1" />
              <span className="text-sm text-[var(--color-muted-foreground)] w-10 text-right">8%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm w-20 text-right">Edge</span>
              <Progress value={5} className="flex-1" />
              <span className="text-sm text-[var(--color-muted-foreground)] w-10 text-right">5%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm w-20 text-right">Other</span>
              <Progress value={3} className="flex-1" />
              <span className="text-sm text-[var(--color-muted-foreground)] w-10 text-right">3%</span>
            </div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'value', type: 'number', default: '0', description: 'Current progress value. Should be between 0 and 100. Values outside this range are clamped.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes merged via cn() on the root element.' },
        ]} />
        <h3 className="font-semibold mt-6 mb-2">Internal Structure</h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-3">
          The Progress component composes three Base UI primitives internally:
        </p>
        <PropsTable props={[
          { name: 'Progress.Root', type: 'Root', default: '-', description: 'The root container that manages the progress state and ARIA attributes.' },
          { name: 'Progress.Track', type: 'Track', default: '-', description: 'The background track element representing the full range (0-100).' },
          { name: 'Progress.Indicator', type: 'Indicator', default: '-', description: 'The filled portion of the track representing the current value. Width is set automatically.' },
        ]} />
      </Section>

      <Section title="Accessibility" description="The Progress component implements the WAI-ARIA progressbar pattern.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>ARIA attributes:</strong> Uses role=&quot;progressbar&quot; with aria-valuenow, aria-valuemin (0), and aria-valuemax (100). Screen readers announce the current progress percentage.</p>
          <p className="text-sm"><strong>Screen reader announcements:</strong> Screen readers automatically announce progress value changes. For frequently updating values, consider using aria-live=&quot;polite&quot; on a container to avoid overwhelming announcements.</p>
          <p className="text-sm"><strong>Labels:</strong> Add aria-label or aria-labelledby to provide context about what the progress bar represents (e.g., &quot;File upload progress&quot;).</p>
          <p className="text-sm"><strong>Color contrast:</strong> The indicator and track colors meet WCAG 2.1 AA contrast requirements for graphical objects (3:1 minimum).</p>
          <p className="text-sm"><strong>Non-interactive:</strong> Progress bars are display-only and are not included in the tab order. They are not focusable or operable via keyboard.</p>
        </div>
      </Section>

      <Section title="Best Practices">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-green-700">Do</p>
            <ul className="text-sm list-disc list-inside space-y-1 mt-1 text-[var(--color-muted-foreground)]">
              <li>Always pair the progress bar with a text label describing what is in progress.</li>
              <li>Show the numeric percentage or step count alongside the bar for precision.</li>
              <li>Use determinate progress (with a value) when the total amount of work is known.</li>
              <li>Update the progress value smoothly to avoid jarring visual jumps.</li>
              <li>Add descriptive aria-label when the visual label does not adequately describe the progress.</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700">Don&apos;t</p>
            <ul className="text-sm list-disc list-inside space-y-1 mt-1 text-[var(--color-muted-foreground)]">
              <li>Show a progress bar without any label &mdash; users need to know what it represents.</li>
              <li>Use a progress bar for unknown durations &mdash; consider a spinner or indeterminate indicator instead.</li>
              <li>Rapidly update the value on every render &mdash; debounce updates for smooth animation.</li>
              <li>Set the value above 100 or below 0 &mdash; keep values within the valid range.</li>
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
