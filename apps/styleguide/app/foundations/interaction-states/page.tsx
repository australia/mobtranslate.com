import Link from 'next/link';
import { Section } from '../../../components/section';
import { CodeBlock } from '../../../components/code-block';
import { StateLab } from '../../../components/foundation-labs';
import snippets from '../../../content/examples.json';

const states = [
  ['Enabled', 'Available for input or activation.', 'Use the ordinary component appearance and descriptive label.'],
  ['Hovered', 'A pointer rests over the control.', 'Add emphasis; never put required information only on hover.'],
  ['Focused', 'The control receives keyboard input.', 'Use :focus-visible with a visible ring; focus is not selection.'],
  ['Pressed', 'A pointer or key is actively held.', 'Use the active token; complete the action on the expected native event.'],
  ['Dragged', 'An item is being moved.', 'Distinguish the moving item, preserve identity, and provide cancellation and non-drag controls.'],
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
    <Section title="State explorer" description="Try an empty search, a valid search, a pending request, success, error and cancellation. The simulated request stays pending until you choose its outcome; no network request or language generation occurs."><StateLab /></Section>
    <Section title="Container, state layer and content">
      <p className="mb-4">Material’s reference places one translucent state overlay between the container and its content. Its color follows the content role: a secondary-container surface uses on-secondary-container; a surface with primary-colored content uses primary. Keep the content opaque and independently legible. Whole-control and circular layers are presentation choices, separate from the interactive target.</p>
      <p className="mb-4">The captured reference specifies hover 8%, focus 10%, press 10% and drag 16% overlay opacity, with a 40dp layer illustration inside a 48dp target. These are reference values, not this library’s state tokens or a conversion into CSS pixels. A 10% overlay does not independently prove foreground or boundary contrast. Check the full transition as well as its endpoints; interpolating a foreground and background separately can temporarily erase the state indicator.</p>
      <p>MobTranslate’s primary button instead changes its background to --color-primary-hover or --color-primary-active; focus has an independent ring. Its disabled/data-disabled selectors suppress hover and active styling. Review the actual component stylesheet and color pairs rather than applying a second Material overlay over an existing recipe.</p>
    </Section>
    <Section title="Combined states and visual precedence">
      <p className="mb-4">Persistent selection can coexist with hover, focus or active input. Material depicts one transient state layer at a time; combining translucent overlays can produce an unintended fill. Define the family’s precedence explicitly, retain selection semantics, and preserve the focus indicator throughout. Do not remove error text when a field gains focus.</p>
      <p>Browser :hover can match nested ancestors, multiple pointers can exist, and focus may be delegated inside a composite widget. Inspect the actionable part rather than asserting a universal one-hover-element rule. aria-pressed is persistent toggle state; :active is transient activation styling. Neither proves that a remote action completed.</p>
    </Section>
    <Section title="Apply states to actionable parts">
      <p className="mb-4">A container does not acquire every state of its children. An app bar’s buttons can hover/focus/press while the bar stays structurally stable; a badge communicates information rather than becoming an action. A draggable row can use a boundary or lift without making its move buttons draggable controls. Match the state to the actual interaction owner.</p>
      <p className="mb-4">Material distinguishes which families inherit disabled, hover, focused, pressed and dragged treatments, and advises hiding an unavailable FAB. This React library may expose disabled members in a family with a different native reference policy. Follow the installed API and task requirements; do not globally hide tabs, navigation or recovery controls because of that reference rule.</p>
      <p>Native disabled controls prevent activation and normally leave sequential focus. aria-disabled preserves discoverability only when the implementation also blocks the action. Inactive-control contrast exceptions do not justify low-contrast prerequisite explanations or status text. Focus, disabled, read-only and pending remain separate contracts.</p>
    </Section>
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
      <p className="mt-4">The local explorer marks only an empty term invalid. A simulated request failure retains a valid term and offers retry; cancellation also retains it. Resolving the simulated pending controls restores focus to the surviving field rather than leaving it on an unmounted result button.</p>
    </Section>
    <Section title="Announcements and accessible state">
      <ul className="guidance-list"><li>Use <code>role="status"</code> for ordinary progress and completion. Reserve assertive alerts for urgent failures needing immediate attention.</li><li>Use <code>aria-invalid</code> for invalid fields, <code>aria-expanded</code> for disclosure triggers and <code>aria-current="page"</code> for navigation.</li><li>Use <code>aria-pressed</code> only for toggle buttons. A Save button is an action, not a persistent pressed choice.</li><li>Keep status truthful: a citation, an internal review flag and community endorsement are distinct. A green success treatment must not imply authority that has not been recorded.</li><li>Respect reduced motion and forced colors. A border or text label must still show state if animation and colors disappear.</li></ul>
    </Section>
    <Section title="Do and avoid">
      <div className="doc-table" role="region" aria-label="Interaction decisions table" tabIndex={0}><table><thead><tr><th scope="col">Do</th><th scope="col">Avoid</th></tr></thead><tbody><tr><td>Keep text labels alongside error or success icons.</td><td>Red or green alone as the only signal.</td></tr><tr><td>Explain why a prerequisite blocks an action.</td><td>An unexplained grey button that people cannot activate.</td></tr><tr><td>Confirm a completed write after the server succeeds.</td><td>Success feedback on click before persistence is known.</td></tr><tr><td>Keep pending controls stable and provide recovery.</td><td>A spinner that hides all content and never offers cancellation.</td></tr></tbody></table></div>
    </Section>
    <Section title="Compiled state explorer"><CodeBlock language="tsx" code={snippets['components/foundation-labs.tsx']} /><CodeBlock language="css" code={snippets['components/foundation-labs.css']} /><p>This checked source also contains the layout lab and shape export. The state example’s outcome controls are explicit local simulation; persistence belongs to the consuming application.</p></Section>
    <Section title="Verification and related guidance">
      <p className="mb-4">Exercise each applicable state with pointer, touch and keyboard. Check combined states, repeated activation, network failure, cancellation and unmount during pending work. Inspect accessible names and state attributes, then check actual announcements with a screen reader.</p>
      <div className="doc-links"><Link href="/components/button">Button</Link><Link href="/components/field">Field</Link><Link href="/components/tabs">Tabs</Link><Link href="/foundations/input-gestures">Drag, input and cancellation</Link><Link href="/foundations/motion">Motion</Link><a href="https://m3.material.io/foundations/interaction/states/overview">Material interaction reference</a><a href="https://m3.material.io/foundations/interaction/states/state-layers">State layers</a><a href="https://m3.material.io/foundations/interaction/states/applying-states">Applying states</a></div>
    </Section>
  </div>;
}
