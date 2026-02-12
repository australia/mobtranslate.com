'use client';
import React from 'react';
import { Stepper, Step, Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

function StepperDemo() {
  const [active, setActive] = React.useState(1);
  return (
    <div className="space-y-6">
      <Stepper activeStep={active}>
        <Step label="Account" description="Create your account" />
        <Step label="Profile" description="Set up your profile" />
        <Step label="Review" description="Review and submit" />
      </Stepper>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setActive(Math.max(0, active - 1))} disabled={active === 0}>
          Back
        </Button>
        <Button onClick={() => setActive(Math.min(3, active + 1))} disabled={active === 3}>
          {active === 2 ? 'Submit' : 'Next'}
        </Button>
      </div>
    </div>
  );
}

export default function StepperPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Stepper</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Multi-step progress indicator for wizards and multi-page forms.
      </p>

      <Section title="Interactive Demo" description="Navigate through steps with the buttons.">
        <ComponentPreview>
          <StepperDemo />
        </ComponentPreview>
        <CodeBlock code={`<Stepper activeStep={1}>
  <Step label="Account" description="Create your account" />
  <Step label="Profile" description="Set up your profile" />
  <Step label="Review" description="Review and submit" />
</Stepper>`} />
      </Section>

      <Section title="Completed State" description="All steps completed.">
        <ComponentPreview>
          <Stepper activeStep={3}>
            <Step label="Upload" />
            <Step label="Process" />
            <Step label="Done" />
          </Stepper>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'activeStep', type: 'number', default: '-', description: 'Zero-indexed active step. Steps before this are completed.' },
          { name: 'orientation', type: "'horizontal' | 'vertical'", default: "'horizontal'", description: 'Layout direction of the stepper.' },
        ]} />
        <h3 className="font-bold mt-6 mb-2">Step Props</h3>
        <PropsTable props={[
          { name: 'label', type: 'string', default: '-', description: 'Step title text.' },
          { name: 'description', type: 'string', default: '-', description: 'Optional step description.' },
        ]} />
      </Section>
    </div>
  );
}
