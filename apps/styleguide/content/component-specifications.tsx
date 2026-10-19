import type { GuideDocumentData } from '../components/guide-document';
import { componentTokenSpecifications } from '@mobtranslate/ui';
import { ComponentSpecificationsExample } from '../examples/component-specifications';
import snippets from './examples.json';

export const componentSpecificationGuide: GuideDocumentData = {
  title: 'Component Specifications',
  description: 'Trace typed sizing presets to their source and inspect actual rendered parts, content-driven dimensions and scoped overrides.',
  sections: [
    { title: 'Choose a specification and inspect its part', paragraphs: ['Choose a component preset and field. The live specimen uses the exported component, while the inspector names the exact selector and source declaration behind that field. Open a popup with its own trigger when its selected part is absent. Keyboard interaction and dismissal remain the component’s normal behavior.', 'The authored value, browser-resolved property and host rectangle answer different questions. A var() expression describes a dependency; a resolved value reflects this instance; a rectangle describes the rendered border box. For a pseudo-element, the rectangle belongs to its host, while the resolved property belongs to the pseudo-element.', 'Modal behavior makes the background inspector unavailable while a dialog is open. Close normally to read the last captured observation for that field. Its timestamp, viewport, theme and local options remain explicit; the live status still reports that the closed part is not rendered. Captures are local page-memory observations, not persisted benchmarks.'], example: <ComponentSpecificationsExample /> },
    { title: 'Preset contract and source ownership', paragraphs: ['The nineteen existing component preset exports are descriptive specifications, not component props or complete React style objects. Their original field names remain exported; values that contradicted the actual CSS have been corrected. Additions name previously hidden constraints such as minimum height, list bounds, the painted Slider marker and reserved Toast close space.', 'components.css owns authored styling. component-bindings.json binds each public field to an explicit selector/property, including a shorthand extraction where needed. The generator takes the last matching direct declaration in an unlayered rule. Nested selectors and at-rules are excluded from this source contract. This is a source-binding contract, not an implementation of selector specificity, inheritance or the full cascade. The live browser is the authority for a particular rendered instance.', 'When a default has no component declaration, the binding records its initial value or the Tailwind preflight inheritance contract explicitly. It does not fabricate a source line. A missing required declaration or an unsupported asymmetric shorthand makes generation fail rather than silently retaining an older number.'] },
    { title: 'Understand contextual dimensions', table: { headings: ['Specification', 'What it describes', 'What to verify'], rows: [
      ['Button sm/md/lg height', 'Minimum height with content-driven growth; legacy height token keys retained', 'Labels may wrap at enlarged text sizes. The recorded CSS property is min-height, while the measured geometry remains actual height. Icon geometry stays fixed.'],
      ['Select triggerHeight: auto', 'Content-driven control; triggerMinHeight is 44px', 'Long selected labels may grow; measure the trigger and keep popup bounds inside the real viewport.'],
      ['Tabs listHeight: auto', 'A list sized by its triggers, borders and orientation', 'Horizontal height includes the dividing border; vertical tabs have a different layout.'],
      ['Slider thumbSize / visibleThumbSize', '44px target and 20px painted marker', 'Inspect the native input’s host and the ::after marker separately; test dragging and keyboard changes.'],
      ['Scroll Area scrollbarSize', '24px authored vertical track', 'Horizontal track is separate; proportional thumb length comes from actual overflow.'],
      ['Toast padding / paddingInlineEnd', 'Base padding and logical end space for its close action', 'The resolved shorthand includes the end override; inspect both directions and actual notification stacking.'],
      ['Popup maxWidth / maxHeight', 'Viewport- and available-space expressions', 'Open near viewport edges, change the actual window size and check internal scrolling.'],
      ['Accordion contentPadding: 0px', 'No default panel padding', 'Spacing supplied by nested content is separate from the panel’s own padding.'],
    ] } },
    { title: 'Defaults corrected by this audit', table: { headings: ['Older preset', 'Current contract'], rows: [
      ['Input sm paddingX: 0.625rem', '0.5rem, matching the size class'],
      ['Select fixed 2.75rem height and 16rem popup', 'auto height, 44px minimum and the actual available-height expression'],
      ['Select item padding: 0.5rem / 0.375rem', '12px horizontally and 8px vertically'],
      ['Slider thumbSize: 1.25rem', '44px interactive target; separate 20px painted marker'],
      ['Scroll Area 0.5rem track / full radius', '24px track / radius-sm thumb'],
      ['Tabs fixed list height / rounded list', 'Content-driven height / unrounded list'],
      ['Accordion 1rem panel padding / rounded root', 'Unpadded panel / unrounded root'],
      ['Unbounded Tooltip/Popover width presets', 'Actual min() viewport bounds'],
      ['Icon button fontSize: 1rem', 'Inherited text size from the consumer’s preflight/style context'],
    ] }, paragraphs: ['These corrections change exported metadata, while preserving the component CSS behavior. Review consumers that use presets to draw external assets or manually style unrelated elements. A descriptive preset cannot be applied wholesale as though its keys were CSS properties.'] },
    { title: 'Complete public preset register', table: { headings: ['Export and field', 'Authored value', 'Source binding'], rows: componentTokenSpecifications.map(row => [
      `${row.exportName}.${row.path}`, row.value,
      `${row.selector} { ${row.property} } — ${row.origin === 'declaration' ? `CSS line ${row.line}` : row.origin}${row.note ? `; ${row.note}` : ''}`,
    ]) } },
    { title: 'Generate and check the contract', paragraphs: ['Edit component CSS deliberately, then regenerate the named presets. Bind new public fields to their real parts rather than copying dimensional literals into TypeScript. The shared tokens:generate/check commands cover both the CSS token exports and this component register. UI build/typecheck and styleguide dev/build reject stale output.', 'The source binding is explicit API schema for this library. It is not a synonym map or a classifier for arbitrary content. State/media overrides, consuming classes and portals must still be verified in their actual browser context.'], code: { language: 'bash', value: 'pnpm --filter @mobtranslate/ui component-tokens:generate\npnpm --filter @mobtranslate/ui component-tokens:check\npnpm --filter styleguide tokens:check\npnpm --filter @mobtranslate/ui typecheck\npnpm --filter web typecheck\npnpm --filter styleguide build\n# Start the production preview, then:\npnpm --filter styleguide test:component-specifications' } },
    { title: 'Checked inspector implementation', paragraphs: ['This exact compiled source powers the live inspector. Resize/mutation observation updates the selected part; active animations are sampled with animation frames, and animation/transition completion or cancellation triggers a final read. Unmount and selection changes cancel scheduled reads and remove listeners. Hidden or unmounted popups have explicit unavailable status. Import componentPresets to obtain the typed grouped values and componentTokenSpecifications to inspect each field’s provenance.'], code: { language: 'tsx', value: snippets['examples/component-specifications.tsx'] } },
    { title: 'Failures and verification', bullets: ['A generated file passing its drift check proves source agreement, not every selector combination or consuming style.', 'Do not compare authored rem, var(), auto or min() strings directly with a pixel result. Inspect the constraint, actual instance and expected layout behavior.', 'Do not treat a small painted checkbox/radio/Slider marker as its complete interaction target. Verify associated labels and keyboard alternatives.', 'Test real overlays while open, confirm closing clears their measurement and preserve normal Escape/focus behavior.', 'Test all preset families, both themes, long labels, scoped variables, narrow reflow and direction changes where dimensions are logical.', 'A copied size does not prove contrast, accessible names, announcements, real task persistence or language authority. Continue the component’s behavior and accessibility checks.'] },
  ],
  related: [
    { label: 'Theming', href: '/guides/theming' }, { label: 'Contribution and Testing', href: '/guides/contribution' },
    { label: 'Select', href: '/components/select' }, { label: 'Slider', href: '/components/slider' },
    { label: 'CSS property value processing', href: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Property_value_processing' },
    { label: 'Browser resolved values', href: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle' },
    { label: 'Element bounding rectangles', href: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect' },
  ],
};
