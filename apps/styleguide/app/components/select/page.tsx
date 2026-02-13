'use client';
import { Select, SelectTrigger, SelectValue, SelectPortal, SelectPositioner, SelectPopup, SelectItem, SelectGroup, SelectGroupLabel, SelectSeparator } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function SelectPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Select</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A dropdown control for selecting a single value from a list of options. Select menus
        are ideal when the user needs to choose from a predefined set of mutually exclusive options.
      </p>

      <Section title="Basic Select" description="A simple select with a flat list of options. The trigger displays the currently selected value or a placeholder.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Select defaultValue="apple">
              <SelectTrigger>
                <SelectValue>Select a fruit</SelectValue>
              </SelectTrigger>
              <SelectPortal>
                <SelectPositioner>
                  <SelectPopup>
                    <SelectItem value="apple">Apple</SelectItem>
                    <SelectItem value="banana">Banana</SelectItem>
                    <SelectItem value="cherry">Cherry</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="elderberry">Elderberry</SelectItem>
                  </SelectPopup>
                </SelectPositioner>
              </SelectPortal>
            </Select>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Select defaultValue="apple">
  <SelectTrigger>
    <SelectValue>Select a fruit</SelectValue>
  </SelectTrigger>
  <SelectPortal>
    <SelectPositioner>
      <SelectPopup>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="cherry">Cherry</SelectItem>
      </SelectPopup>
    </SelectPositioner>
  </SelectPortal>
</Select>`} />
      </Section>

      <Section title="With Placeholder" description="When no default value is provided, the trigger shows a placeholder text prompting the user to make a selection.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Select>
              <SelectTrigger>
                <SelectValue>Choose a language...</SelectValue>
              </SelectTrigger>
              <SelectPortal>
                <SelectPositioner>
                  <SelectPopup>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                  </SelectPopup>
                </SelectPositioner>
              </SelectPortal>
            </Select>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Select>
  <SelectTrigger>
    <SelectValue>Choose a language...</SelectValue>
  </SelectTrigger>
  ...
</Select>`} />
      </Section>

      <Section title="Grouped Options" description="Organize options into labeled groups using SelectGroup and SelectGroupLabel. Use SelectSeparator to add visual dividers between groups.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Select>
              <SelectTrigger>
                <SelectValue>Select a timezone</SelectValue>
              </SelectTrigger>
              <SelectPortal>
                <SelectPositioner>
                  <SelectPopup>
                    <SelectGroup>
                      <SelectGroupLabel>North America</SelectGroupLabel>
                      <SelectItem value="est">Eastern (EST)</SelectItem>
                      <SelectItem value="cst">Central (CST)</SelectItem>
                      <SelectItem value="mst">Mountain (MST)</SelectItem>
                      <SelectItem value="pst">Pacific (PST)</SelectItem>
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectGroupLabel>Europe</SelectGroupLabel>
                      <SelectItem value="gmt">Greenwich (GMT)</SelectItem>
                      <SelectItem value="cet">Central European (CET)</SelectItem>
                      <SelectItem value="eet">Eastern European (EET)</SelectItem>
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectGroupLabel>Asia Pacific</SelectGroupLabel>
                      <SelectItem value="aest">Australian Eastern (AEST)</SelectItem>
                      <SelectItem value="jst">Japan (JST)</SelectItem>
                      <SelectItem value="ist">India (IST)</SelectItem>
                    </SelectGroup>
                  </SelectPopup>
                </SelectPositioner>
              </SelectPortal>
            </Select>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Select>
  <SelectTrigger>
    <SelectValue>Select a timezone</SelectValue>
  </SelectTrigger>
  <SelectPortal>
    <SelectPositioner>
      <SelectPopup>
        <SelectGroup>
          <SelectGroupLabel>North America</SelectGroupLabel>
          <SelectItem value="est">Eastern (EST)</SelectItem>
          <SelectItem value="pst">Pacific (PST)</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectGroupLabel>Europe</SelectGroupLabel>
          <SelectItem value="gmt">Greenwich (GMT)</SelectItem>
        </SelectGroup>
      </SelectPopup>
    </SelectPositioner>
  </SelectPortal>
</Select>`} />
      </Section>

      <Section title="Multiple Selects" description="Multiple select controls used together in a form layout. Each operates independently with its own value state.">
        <ComponentPreview>
          <div className="max-w-md space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Country</label>
              <Select defaultValue="au">
                <SelectTrigger>
                  <SelectValue>Select country</SelectValue>
                </SelectTrigger>
                <SelectPortal>
                  <SelectPositioner>
                    <SelectPopup>
                      <SelectItem value="au">Australia</SelectItem>
                      <SelectItem value="nz">New Zealand</SelectItem>
                      <SelectItem value="us">United States</SelectItem>
                      <SelectItem value="uk">United Kingdom</SelectItem>
                      <SelectItem value="ca">Canada</SelectItem>
                    </SelectPopup>
                  </SelectPositioner>
                </SelectPortal>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Role</label>
              <Select>
                <SelectTrigger>
                  <SelectValue>Select role</SelectValue>
                </SelectTrigger>
                <SelectPortal>
                  <SelectPositioner>
                    <SelectPopup>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="contributor">Contributor</SelectItem>
                    </SelectPopup>
                  </SelectPositioner>
                </SelectPortal>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Status</label>
              <Select defaultValue="active">
                <SelectTrigger>
                  <SelectValue>Select status</SelectValue>
                </SelectTrigger>
                <SelectPortal>
                  <SelectPositioner>
                    <SelectPopup>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="pending">Pending Review</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectPopup>
                  </SelectPositioner>
                </SelectPortal>
              </Select>
            </div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Long Option List" description="Select handles long lists gracefully with a scrollable popup. Users can type characters to quickly jump to matching options.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Select>
              <SelectTrigger>
                <SelectValue>Select a font</SelectValue>
              </SelectTrigger>
              <SelectPortal>
                <SelectPositioner>
                  <SelectPopup>
                    <SelectItem value="arial">Arial</SelectItem>
                    <SelectItem value="calibri">Calibri</SelectItem>
                    <SelectItem value="courier">Courier New</SelectItem>
                    <SelectItem value="georgia">Georgia</SelectItem>
                    <SelectItem value="helvetica">Helvetica</SelectItem>
                    <SelectItem value="impact">Impact</SelectItem>
                    <SelectItem value="inter">Inter</SelectItem>
                    <SelectItem value="lato">Lato</SelectItem>
                    <SelectItem value="monospace">Monospace</SelectItem>
                    <SelectItem value="opensans">Open Sans</SelectItem>
                    <SelectItem value="roboto">Roboto</SelectItem>
                    <SelectItem value="segoe">Segoe UI</SelectItem>
                    <SelectItem value="tahoma">Tahoma</SelectItem>
                    <SelectItem value="times">Times New Roman</SelectItem>
                    <SelectItem value="verdana">Verdana</SelectItem>
                  </SelectPopup>
                </SelectPositioner>
              </SelectPortal>
            </Select>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Side-by-Side" description="Selects placed horizontally for compact form layouts. Useful for related choices like date pickers or filters.">
        <ComponentPreview>
          <div className="flex gap-3 max-w-lg">
            <div className="flex-1">
              <Select defaultValue="2025">
                <SelectTrigger>
                  <SelectValue>Year</SelectValue>
                </SelectTrigger>
                <SelectPortal>
                  <SelectPositioner>
                    <SelectPopup>
                      <SelectItem value="2023">2023</SelectItem>
                      <SelectItem value="2024">2024</SelectItem>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                    </SelectPopup>
                  </SelectPositioner>
                </SelectPortal>
              </Select>
            </div>
            <div className="flex-1">
              <Select defaultValue="03">
                <SelectTrigger>
                  <SelectValue>Month</SelectValue>
                </SelectTrigger>
                <SelectPortal>
                  <SelectPositioner>
                    <SelectPopup>
                      <SelectItem value="01">January</SelectItem>
                      <SelectItem value="02">February</SelectItem>
                      <SelectItem value="03">March</SelectItem>
                      <SelectItem value="04">April</SelectItem>
                      <SelectItem value="05">May</SelectItem>
                      <SelectItem value="06">June</SelectItem>
                      <SelectItem value="07">July</SelectItem>
                      <SelectItem value="08">August</SelectItem>
                      <SelectItem value="09">September</SelectItem>
                      <SelectItem value="10">October</SelectItem>
                      <SelectItem value="11">November</SelectItem>
                      <SelectItem value="12">December</SelectItem>
                    </SelectPopup>
                  </SelectPositioner>
                </SelectPortal>
              </Select>
            </div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <h3 className="font-semibold mt-4 mb-2">Select (Root)</h3>
        <PropsTable props={[
          { name: 'defaultValue', type: 'string', default: '-', description: 'The initially selected value (uncontrolled mode).' },
          { name: 'value', type: 'string', default: '-', description: 'The controlled selected value. Use with onValueChange.' },
          { name: 'onValueChange', type: '(value: string) => void', default: '-', description: 'Callback fired when the selected value changes.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">SelectTrigger</h3>
        <PropsTable props={[
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the trigger button.' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'Should contain a SelectValue component. A chevron icon is automatically appended.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">SelectValue</h3>
        <PropsTable props={[
          { name: 'placeholder', type: 'string', default: '-', description: 'Text displayed when no value is selected.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">SelectItem</h3>
        <PropsTable props={[
          { name: 'value', type: 'string', default: '-', description: 'The value submitted when this item is selected (required).' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'The display label for the option.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the item.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">SelectGroup & SelectGroupLabel</h3>
        <PropsTable props={[
          { name: 'SelectGroup', type: 'Group container', default: '-', description: 'Groups related SelectItem elements together for visual organization.' },
          { name: 'SelectGroupLabel', type: 'Label', default: '-', description: 'Non-interactive label displayed at the top of a group.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">All Select Parts</h3>
        <PropsTable props={[
          { name: 'Select', type: 'Root', default: '-', description: 'Root component managing selection state and open/closed behavior.' },
          { name: 'SelectTrigger', type: 'Trigger', default: '-', description: 'Button that opens the dropdown and displays the selected value.' },
          { name: 'SelectValue', type: 'Value', default: '-', description: 'Renders the selected value text or placeholder inside the trigger.' },
          { name: 'SelectPortal', type: 'Portal', default: '-', description: 'Renders the dropdown outside the DOM hierarchy to avoid overflow issues.' },
          { name: 'SelectPositioner', type: 'Positioner', default: '-', description: 'Positions the dropdown relative to the trigger using Floating UI.' },
          { name: 'SelectPopup', type: 'Popup', default: '-', description: 'Scrollable container for the option list.' },
          { name: 'SelectItem', type: 'Item', default: '-', description: 'An individual selectable option. Shows a checkmark when selected.' },
          { name: 'SelectGroup', type: 'Group', default: '-', description: 'Groups related options under a shared label.' },
          { name: 'SelectGroupLabel', type: 'GroupLabel', default: '-', description: 'Visual label for a group of options (not selectable).' },
          { name: 'SelectSeparator', type: 'Separator', default: '-', description: 'Horizontal divider between groups or sections of options.' },
        ]} />
      </Section>

      <Section title="Accessibility" description="The Select component implements the WAI-ARIA Listbox pattern with combobox trigger.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Keyboard navigation:</strong> Arrow Up/Down keys navigate between options. Enter or Space selects the focused option. Escape closes the dropdown without changing the selection.</p>
          <p className="text-sm"><strong>Type-ahead:</strong> Typing characters while the dropdown is open jumps to the first matching option. This enables fast selection in long lists.</p>
          <p className="text-sm"><strong>ARIA roles:</strong> The trigger uses the combobox role. The popup uses the listbox role. Individual items use the option role. Groups are linked via aria-labelledby to their group labels.</p>
          <p className="text-sm"><strong>Focus management:</strong> When opened, focus moves to the selected option (or the first option if none is selected). Focus returns to the trigger when the dropdown closes.</p>
          <p className="text-sm"><strong>Home/End keys:</strong> Home moves to the first option, End moves to the last option.</p>
        </div>
      </Section>

      <Section title="Best Practices">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-success)]">Do</p>
            <ul className="text-sm list-disc list-inside space-y-1 mt-1 text-[var(--color-muted-foreground)]">
              <li>Use a descriptive placeholder that explains what the user should select.</li>
              <li>Group related options with SelectGroup and SelectGroupLabel for lists of 7+ items.</li>
              <li>Order options logically (alphabetically, by frequency, or by category).</li>
              <li>Provide a default value when there is a sensible default choice.</li>
              <li>Use Select for 5 or more options; use Radio for fewer choices.</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--color-error)]">Don&apos;t</p>
            <ul className="text-sm list-disc list-inside space-y-1 mt-1 text-[var(--color-muted-foreground)]">
              <li>Use a Select for only 2-3 options &mdash; Radio buttons are more accessible.</li>
              <li>Omit the placeholder when there is no default value.</li>
              <li>Put more than 15-20 items in a flat list without grouping.</li>
              <li>Use vague placeholder text like &quot;Select&quot; &mdash; be specific about what is being selected.</li>
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
