import Link from 'next/link';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { CodeBlock } from '../../../components/code-block';
import { StateLab } from '../../../components/foundation-labs';

const states = [
  ['Enabled', 'Available for input or activation.', 'Use the ordinary component appearance and descriptive label.'],
  ['Hovered', 'A pointer rests over the control.', 'Add emphasis; never put required information only on hover.'],
  ['Focused', 'The control receives keyboard input.', 'Use :focus-visible with a visible ring; focus is not selection.'],
  ['Pressed', 'A pointer or key is actively held.', 'Use the active token; complete the action on the expected native event.'],
  ['Selected', 'A choice or current destination persists.', 'Use checked/selected/current semantics appropriate to the control.'],
  ['Disabled', 'A control is unavailable.', 'Prevent activation and explain prerequisites nearby.'],
  ['Loading', 'An action is in progress.', 'Preserve its label and layout; announce progress and prevent duplicates.'],
  ['Error', 'Input or an action needs recovery.', 'State the problem and a concrete next step beside the affected input.'],
  ['Success', 'The requested operation completed.', 'Confirm the actual outcome with text; do not announce success before persistence.'],
];

export default function InteractionStatesPage() {
  return <div>
    <h1 className="text-4xl font-bold mb-2">Interaction states</h1>
    <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Communicate what a control can do, what is happening, and what happened. Visual styling, browser behavior and accessible state must tell the same story.</p>
    <Section title="State specifications">
      <div className="doc-table" role="region" aria-label="State specifications table" tabIndex={0}><table><thead><tr><th scope="col">State</th><th scope="col">Meaning</th><th scope="col">Required behavior</th></tr></thead><tbody>{states.map(([name, meaning, behavior]) => <tr key={name}><th scope="row">{name}</th><td>{meaning}</td><td>{behavior}</td></tr>)}</tbody></table></div>
      <p className="mt-4">States can coexist: a selected tab may also be focused or hovered. Error is not a reason to remove focus styling. Disabled controls must never show a pressed response that implies activation.</p>
    </Section>
    <Section title="State explorer" description="Try an empty search, a valid search, a pending request, success, error and cancellation. The simulated request stays pending until you choose its outcome; no network request or language generation occurs."><ComponentPreview><StateLab /></ComponentPreview></Section>
    <Section title="State anatomy and tokens">
      <p className="mb-4">Separate the label, visual surface, focus indicator and feedback message. Hover and active colors come from semantic tokens such as <code>--color-primary-hover</code> and <code>--color-primary-active</code>. A loading spinner supports the label; it does not replace it. Error messages describe the recovery and link to the input through <code>aria-describedby</code>.</p>
      <CodeBlock code={`const [pending, setPending] = useState(false);
const [message, setMessage] = useState('');

async function save() {
  if (pending) return;
  setPending(true);
  setMessage('Saving changes…');
  try {
    await persistChanges(); // implement your real persistence boundary
    setMessage('Changes saved.');
  } catch {
    setMessage('Changes were not saved. Check your connection and retry.');
  } finally {
    setPending(false);
  }
}

<Button loading={pending} onClick={save}>Save changes</Button>
<p role="status">{message}</p>`} />
      <p className="mt-4">Use the library’s real props rather than styling a disabled-looking div. Native <code>disabled</code> removes a button from Tab order. If a control must remain discoverable, <code>aria-disabled</code> can be appropriate, but the application must also prevent activation and explain why.</p>
    </Section>
    <Section title="Input, focus and gestures">
      <ul className="guidance-list"><li>Buttons activate with Enter or Space; links navigate with Enter. Use native elements so pointer and keyboard follow those conventions.</li><li>Focus identifies where the next key goes. Selection identifies a persistent choice. Tabs therefore need both their selected state and an independently visible focus indicator.</li><li>Touch has no dependable hover. Put essential labels, explanations and actions in visible content.</li><li>Provide a button alternative for drag, swipe or long-press operations. Never make a gesture the only way to perform an essential task.</li><li>When dismissing an overlay, restore focus to its trigger unless the workflow deliberately moved to a new destination.</li></ul>
    </Section>
    <Section title="Pending, error and recovery">
      <p className="mb-4">Preserve user input through request failures. Disable the submitting action while pending to prevent duplicate writes; keep cancellation or another safe escape available for long work. Show progress only when it is measured. For unknown duration, use indeterminate feedback with a plain-language status.</p>
      <p>Validate a field after an appropriate user interaction or submission, not before someone has had a chance to answer. Keep the field label and error message visible together. After a failed submission, move focus to an error summary or the first invalid field when it helps locate the problem. Do not reset the form or move focus for every keystroke.</p>
    </Section>
    <Section title="Announcements and accessible state">
      <ul className="guidance-list"><li>Use <code>role="status"</code> for ordinary progress and completion. Reserve assertive alerts for urgent failures needing immediate attention.</li><li>Use <code>aria-invalid</code> for invalid fields, <code>aria-expanded</code> for disclosure triggers and <code>aria-current="page"</code> for navigation.</li><li>Use <code>aria-pressed</code> only for toggle buttons. A Save button is an action, not a persistent pressed choice.</li><li>Keep status truthful: a citation, an internal review flag and community endorsement are distinct. A green success treatment must not imply authority that has not been recorded.</li><li>Respect reduced motion and forced colors. A border or text label must still show state if animation and colors disappear.</li></ul>
    </Section>
    <Section title="Do and avoid">
      <div className="doc-table" role="region" aria-label="Interaction decisions table" tabIndex={0}><table><thead><tr><th scope="col">Do</th><th scope="col">Avoid</th></tr></thead><tbody><tr><td>Keep text labels alongside error or success icons.</td><td>Red or green alone as the only signal.</td></tr><tr><td>Explain why a prerequisite blocks an action.</td><td>An unexplained grey button that people cannot activate.</td></tr><tr><td>Confirm a completed write after the server succeeds.</td><td>Success feedback on click before persistence is known.</td></tr><tr><td>Keep pending controls stable and provide recovery.</td><td>A spinner that hides all content and never offers cancellation.</td></tr></tbody></table></div>
    </Section>
    <Section title="Verification and related guidance">
      <p className="mb-4">Exercise each applicable state with pointer, touch and keyboard. Check combined states, repeated activation, network failure, cancellation and unmount during pending work. Inspect accessible names and state attributes, then check actual announcements with a screen reader.</p>
      <div className="doc-links"><Link href="/components/button">Button</Link><Link href="/components/field">Field</Link><Link href="/components/tabs">Tabs</Link><Link href="/foundations/motion">Motion</Link><a href="https://m3.material.io/foundations/interaction/states/overview">Material interaction reference</a></div>
    </Section>
  </div>;
}
