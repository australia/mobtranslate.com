'use client';
import { useState } from 'react';
import { Slider } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

function normalizeSliderValue(next: number | readonly number[]): number[] {
  return Array.isArray(next) ? [...next] : [next];
}

function SliderWithValue({ defaultValue = [50], min = 0, max = 100, step = 1, disabled = false }: { defaultValue?: number[]; min?: number; max?: number; step?: number; disabled?: boolean }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-[var(--color-muted-foreground)]">Value: {value[0]}</span>
      </div>
      <Slider
        value={value}
        onValueChange={(next) => setValue(normalizeSliderValue(next))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      />
    </div>
  );
}

export default function SliderPage() {
  const [volume, setVolume] = useState([75]);
  const [price, setPrice] = useState([250]);
  const [temperature, setTemperature] = useState([22]);

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Slider</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        An input control for selecting a numeric value within a defined range by dragging
        a thumb along a track. Sliders are ideal when the precise value matters less than
        the relative position within a range.
      </p>

      <Section title="Basic Slider" description="A single-thumb slider with default settings (min: 0, max: 100, step: 1). Drag the thumb or click on the track to set a value.">
        <ComponentPreview>
          <div className="max-w-md space-y-6">
            <Slider defaultValue={[50]} />
            <Slider defaultValue={[25]} />
            <Slider defaultValue={[75]} />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Slider defaultValue={[50]} />
<Slider defaultValue={[25]} />
<Slider defaultValue={[75]} />`} />
      </Section>

      <Section title="Interactive with Value Display" description="A controlled slider that displays the current value. The value updates in real-time as the user drags the thumb.">
        <ComponentPreview>
          <div className="max-w-md">
            <SliderWithValue defaultValue={[50]} />
          </div>
        </ComponentPreview>
        <CodeBlock code={`const [value, setValue] = useState([50]);

<div className="flex justify-between">
  <span>Value: {value[0]}</span>
</div>
<Slider
  value={value}
  onValueChange={setValue}
/>`} />
      </Section>

      <Section title="With Labels" description="Add min and max labels alongside the slider for additional context about the value range.">
        <ComponentPreview>
          <div className="max-w-md space-y-6">
            <div>
              <p className="text-sm font-medium mb-2">Volume</p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--color-muted-foreground)] w-8">0</span>
                <Slider value={volume} onValueChange={(next) => setVolume(normalizeSliderValue(next))} className="flex-1" />
                <span className="text-sm text-[var(--color-muted-foreground)] w-8 text-right">100</span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1 text-center">{volume[0]}%</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Price Range</p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--color-muted-foreground)] w-8">$0</span>
                <Slider value={price} onValueChange={(next) => setPrice(normalizeSliderValue(next))} min={0} max={1000} step={10} className="flex-1" />
                <span className="text-sm text-[var(--color-muted-foreground)] w-12 text-right">$1000</span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1 text-center">${price[0]}</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Temperature</p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--color-muted-foreground)] w-10">16 C</span>
                <Slider value={temperature} onValueChange={(next) => setTemperature(normalizeSliderValue(next))} min={16} max={30} step={1} className="flex-1" />
                <span className="text-sm text-[var(--color-muted-foreground)] w-10 text-right">30 C</span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1 text-center">{temperature[0]} C</p>
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<div className="flex items-center gap-3">
  <span>0</span>
  <Slider value={volume} onValueChange={setVolume} />
  <span>100</span>
</div>`} />
      </Section>

      <Section title="Custom Range and Step" description="Customize the min, max, and step values to match your use case. The step determines the increment between valid values.">
        <ComponentPreview>
          <div className="max-w-md space-y-8">
            <div>
              <p className="text-sm font-medium mb-1">Default (0-100, step 1)</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mb-2">Fine-grained control with single unit steps</p>
              <SliderWithValue defaultValue={[50]} />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Step 10 (0-100)</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mb-2">Coarser control snapping to multiples of 10</p>
              <SliderWithValue defaultValue={[50]} step={10} />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Step 25 (0-100)</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mb-2">Quartile selection: 0, 25, 50, 75, 100</p>
              <SliderWithValue defaultValue={[50]} step={25} />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Custom Range (200-800, step 50)</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mb-2">Non-standard range with custom increments</p>
              <SliderWithValue defaultValue={[500]} min={200} max={800} step={50} />
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Slider defaultValue={[50]} step={10} />
<Slider defaultValue={[50]} step={25} />
<Slider defaultValue={[500]} min={200} max={800} step={50} />`} />
      </Section>

      <Section title="Disabled" description="A disabled slider prevents any interaction. Use this when the value should be visible but not editable.">
        <ComponentPreview>
          <div className="max-w-md space-y-4">
            <div>
              <p className="text-sm text-[var(--color-muted-foreground)] mb-2">Disabled at 40%</p>
              <Slider defaultValue={[40]} disabled />
            </div>
            <div>
              <p className="text-sm text-[var(--color-muted-foreground)] mb-2">Disabled at 80%</p>
              <Slider defaultValue={[80]} disabled />
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Slider defaultValue={[40]} disabled />`} />
      </Section>

      <Section title="Multiple Slider Comparison" description="Multiple sliders arranged together for comparing or setting related values. Each slider operates independently.">
        <ComponentPreview>
          <div className="max-w-md space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm w-12">Bass</span>
              <Slider defaultValue={[60]} className="flex-1" />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm w-12">Mid</span>
              <Slider defaultValue={[45]} className="flex-1" />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm w-12">Treble</span>
              <Slider defaultValue={[70]} className="flex-1" />
            </div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'defaultValue', type: 'number[]', default: '[0]', description: 'Initial value for uncontrolled mode. Must be an array (single-thumb sliders use a 1-element array).' },
          { name: 'value', type: 'number[]', default: '-', description: 'Controlled value. Use with onValueChange for full control.' },
          { name: 'onValueChange', type: '(value: number[]) => void', default: '-', description: 'Callback fired continuously as the thumb is dragged.' },
          { name: 'onValueChangeCommitted', type: '(value: number[]) => void', default: '-', description: 'Callback fired when the thumb is released (drag ends).' },
          { name: 'min', type: 'number', default: '0', description: 'The minimum allowed value.' },
          { name: 'max', type: 'number', default: '100', description: 'The maximum allowed value.' },
          { name: 'step', type: 'number', default: '1', description: 'The step increment between valid values. The thumb snaps to multiples of this value.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'When true, prevents all interaction and shows reduced opacity.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes merged via cn().' },
        ]} />
      </Section>

      <Section title="Accessibility" description="The Slider component implements the WAI-ARIA Slider pattern.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Keyboard navigation:</strong> Left/Down arrow decreases the value by one step. Right/Up arrow increases by one step. Home jumps to the minimum value, End jumps to the maximum. Page Up/Page Down adjust by larger increments (typically 10 steps).</p>
          <p className="text-sm"><strong>ARIA attributes:</strong> The thumb uses role=&quot;slider&quot; with aria-valuemin, aria-valuemax, aria-valuenow, and aria-orientation. Pair with a label element or aria-label for screen reader context.</p>
          <p className="text-sm"><strong>Focus indicator:</strong> The thumb shows a visible focus ring when navigated via keyboard using :focus-visible styling.</p>
          <p className="text-sm"><strong>Touch support:</strong> The slider supports touch and pointer events for mobile interaction, including drag gestures.</p>
          <p className="text-sm"><strong>Disabled state:</strong> Disabled sliders are excluded from the tab order and cannot be adjusted via keyboard or pointer.</p>
        </div>
      </Section>

      <Section title="Best Practices">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-green-700">Do</p>
            <ul className="text-sm list-disc list-inside space-y-1 mt-1 text-[var(--color-muted-foreground)]">
              <li>Display the current value alongside the slider so users know the exact selection.</li>
              <li>Add min/max labels for context when the range is not obvious.</li>
              <li>Use meaningful step values that make sense for the domain (e.g., step 5 for percentages).</li>
              <li>Provide an alternative text input for precise value entry when exact numbers matter.</li>
              <li>Use onValueChangeCommitted for expensive operations (e.g., API calls) rather than onValueChange.</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700">Don&apos;t</p>
            <ul className="text-sm list-disc list-inside space-y-1 mt-1 text-[var(--color-muted-foreground)]">
              <li>Use a slider without visible value feedback &mdash; users need to know the current value.</li>
              <li>Use very large ranges with step 1 &mdash; it makes precise selection nearly impossible.</li>
              <li>Use a slider when only a few discrete options exist &mdash; use Radio or Select instead.</li>
              <li>Forget to add a label or aria-label &mdash; the slider is meaningless without context.</li>
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
