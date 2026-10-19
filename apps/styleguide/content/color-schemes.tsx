import type { GuideDocumentData } from '../components/guide-document';
import { ColorProposalExample } from '../examples/color-proposal';
import snippets from './examples.json';

export const colorSchemesGuide: GuideDocumentData = {
  title: 'Color schemes, tones and customization',
  description:
    'Choose a source and scheme deliberately, inspect realized HCT and role relationships, and verify scoped changes before adopting them.',
  sections: [
    {
      title: 'Source, palette, role and application',
      table: {
        headings: ['Layer', 'Responsibility', 'Failure'],
        rows: [
          [
            'Source color',
            'A deliberate input to generation',
            'Treating a wallpaper or photograph as automatically permitted product identity',
          ],
          [
            'Key colors',
            'Starting colors for related palette families',
            'Assuming every family reproduces the original seed',
          ],
          [
            'Tonal palettes',
            'A range of realizable colors at chosen tones',
            'Calling an HSL lightness ramp an HCT palette',
          ],
          [
            'Semantic roles',
            'Purpose, pairings, theme and contrast relationships',
            'Using one attractive swatch for every foreground/state',
          ],
          [
            'Application',
            'Map the agreed roles to actual components and surfaces',
            'Declaring a generated palette a complete accessible theme',
          ],
        ],
      },
      paragraphs: [
        'Generation does not decide which task is important or establish review authority. Record source, algorithm/version, scheme choices, role mappings and the actual surfaces/states that were verified. Keep a captured scheme distinguishable from a draft setting and a deployed product theme.',
      ],
    },
    {
      title: 'Hue, chroma, tone and gamut',
      paragraphs: [
        'HCT combines hue, chroma and perceptual tone to support related colors and contrast-aware roles. Tone is based on CIE lightness; it is not interchangeable with the lightness slider in HSL. A request for high chroma at a very light or dark tone may exceed the available sRGB gamut.',
        'Report what was requested and what the algorithm actually produced. Hue can wrap around its circular domain, and near-neutral colors do not preserve the same chromatic identity as a saturated request. Keep the realized hex/HCT values alongside the request instead of silently calling both exact.',
      ],
      table: {
        headings: ['Coordinate', 'Tool contract', 'Inspection'],
        rows: [
          ['Hue', '0–360° request', 'Compare realized hue and circular wrap'],
          [
            'Chroma',
            '0–150 bounded experiment',
            'Inspect actual gamut-limited chroma',
          ],
          [
            'Tone',
            '0–100 request',
            'Inspect realized lightness and pair contrast',
          ],
          [
            'Output',
            'Opaque sRGB #RRGGBB',
            'No alpha, image composition or wide-gamut claim',
          ],
        ],
      },
      code: {
        language: 'typescript',
        value:
          'import {Hct, hexFromArgb} from "@material/material-color-utilities";\nconst requested = {hue: 49, chroma: 80, tone: 95};\nconst realized = Hct.from(requested.hue, requested.chroma, requested.tone);\nconst hex = hexFromArgb(realized.toInt());\n// Inspect realized.hue/chroma/tone; requested chroma may not be achieved.',
      },
    },
    {
      title: 'Static, brand and dynamic scheme selection',
      table: {
        headings: ['Choice', 'Use when', 'Review'],
        rows: [
          [
            'Static baseline',
            'A stable authored scheme fits the product and tasks',
            'Verify role/state pairs in both themes',
          ],
          [
            'Custom brand',
            'An established identity needs deliberate palette/role choices',
            'Keep legibility and role relationships ahead of exact brand shade reproduction',
          ],
          [
            'User-generated source',
            'People explicitly choose personalization or a supported platform supplies it',
            'Keep preference ownership, fallback and task meaning clear',
          ],
          [
            'Content-based source',
            'Relevant, permitted content can guide a contextual accent',
            'Verify the actual pixels, selection algorithm and scope',
          ],
          [
            'Multiple sources/schemes',
            'Different contextual regions need a documented relationship',
            'Keep coherent role pairs inside each scope and avoid conflicting primary emphasis',
          ],
        ],
      },
      paragraphs: [
        'The shared MobTranslate theme is an authored Earth palette, not a generated Material baseline. This explorer produces local proposals without replacing those tokens. A manual hex/HCT choice is an explicit source input; the browser cannot automatically read a person’s wallpaper through this tool.',
        'Use stable source selection and fallbacks when content changes or a platform cannot provide a color. A source-derived accent should not change permission, error or review meaning. Content attribution and cultural use permissions remain separate from pixel selection.',
      ],
    },
    {
      title: 'Working source-to-role explorer',
      example: <ColorProposalExample />,
      paragraphs: [
        'Capture a proposal and inspect the SDK’s role collection, declared backgrounds/contrast targets, tonal key colors, sampled tones and full JSON. Draft edits do not rewrite the captured output. Requested/effective specification versions expose SDK fallback rather than presenting unsupported variant parity.',
        'Tonal spot, Expressive and Fidelity are actual SDK constructors. This tool pins Material Color Utilities 0.4.0, requests the selected 2021/2025 specification and uses its phone algorithm parameter. Those choices are captured; they are not device detection, OS personalization or native-theme installation.',
        'The original SVG fixture has four equal-area bands. Extraction decodes its actual image, quantizes pixels and asks the SDK to rank a suitable seed. It does not merely choose the largest area, and it does not classify the image’s cultural meaning. The result populates the draft only.',
      ],
    },
    {
      title: 'Role families and pairing',
      table: {
        headings: ['Material role family', 'Purpose', 'Local treatment'],
        rows: [
          [
            'Primary / on-primary',
            'Main accent and readable content on its fill',
            'Explorer action specimen maps this pair locally',
          ],
          [
            'Secondary / tertiary',
            'Supporting accents with their own paired content',
            'Available in generated roles/palettes; no automatic mapping to a source status',
          ],
          [
            'Containers / on-container',
            'Less dominant accent surfaces',
            'Keep the matching pair and contained task relationship',
          ],
          [
            'Error / on-error',
            'Error emphasis and readable content',
            'A generated error color does not supply an error message',
          ],
          [
            'Surface / on-surface',
            'Ordinary reading and component surfaces',
            'Explorer uses this opaque pair for its scoped specimen',
          ],
          [
            'Surface containers',
            'Low through high containment layers',
            'Tone-based differentiation is separate from shadow/stacking',
          ],
          [
            'Bright / dim surfaces',
            'Surface adaptations for the chosen scheme',
            'Inspect actual theme/contrast output',
          ],
          [
            'Inverse surface/content/primary',
            'Contrasting contextual treatment',
            'Verify its local background and duration',
          ],
          [
            'Outline / outline variant',
            'Required or supporting boundaries',
            'Do not treat every outline variant as a required 3:1 control boundary',
          ],
          [
            'Fixed accents / on-fixed variants',
            'Accent treatments with defined cross-theme relationships',
            'Inspect the SDK’s actual fixed/dim backgrounds and paired foregrounds',
          ],
          [
            'Shadow / scrim / tint',
            'Layering and treatment inputs',
            'Opaque role values alone do not prove a composited overlay’s contrast',
          ],
        ],
      },
      paragraphs: [
        'These families are guidance and generated data, not a claim that every Material role already exists as a MobTranslate token. The explorer’s allColors collection is read from the pinned SDK; background associations are derived from each role’s declarations instead of a hand-maintained synonym/pairing dictionary. Palettes also expose their actual key colors.',
      ],
    },
    {
      title: 'Contrast levels and honest measurements',
      paragraphs: [
        'Contrast level is an algorithm input, not a WCAG certificate. Standard, medium and high can change tone assignments while preserving relationships. The SDK also allows lower-contrast experimentation; it may produce pairs unsuitable for normal text.',
        'Measure realized opaque role values and distinguish the SDK’s curve target from the criterion that applies to the final use. Normal-text AA uses 4.5:1; large text and required non-text information have their own definitions and contexts. A displayed rounded ratio must not be rounded into a pass.',
      ],
      bullets: [
        'The explorer checks both declared backgrounds when a role supplies them. An absent relationship remains absent.',
        'The opaque ratio uses realized lightness/relative luminance through the SDK’s contrast utility, with black/white and reference-pair tests.',
        'Unsafe normal-text preview pairs suppress the specimen while preserving role values in the neutral interface.',
        'Images, gradients, opacity, overlays and state changes need their actual composed background assessed.',
        'Keep color-independent names and state information, including failure/recovery messages.',
      ],
    },
    {
      title: 'Combine and remap colors deliberately',
      paragraphs: [
        'Keep each contextual scheme in an explicit scope. A brand header and content-derived panel can coexist when their primary emphasis, surfaces, text and focus treatment have coherent boundaries. A portalled surface needs the intended values in its own rendered scope; inheritance from an unrelated trigger is not sufficient.',
        'Remap a role because the element’s purpose warrants it, then inspect its foreground, surrounding surface, state and adjacent controls. Do not choose a different token for every isolated screenshot. Retain an auditable mapping from generated roles to the library/application contract.',
        'The specimen maps only primary/foreground plus an opaque surface and focus treatment. Hover/pressed deliberately retain the same fill. Its CSS export uses a separate proposal namespace; it is not a complete production theme or an automatic migration.',
      ],
      table: {
        headings: ['Operation', 'Required evidence'],
        rows: [
          [
            'Local proposal',
            'Actual computed surface/action colors and unchanged root tokens',
          ],
          [
            'Semantic remap',
            'Purpose, old/new role and every affected pair/state',
          ],
          ['Mixed schemes', 'Defined regions and readable boundaries/focus'],
          [
            'Portal',
            'Correct container/theme scope and dismissal/focus behavior',
          ],
          [
            'Adoption',
            'Reviewed mapping, compatibility and verification before replacing shared tokens',
          ],
        ],
      },
    },
    {
      title: 'New static colors and custom roles',
      paragraphs: [
        'Define a custom color when a real product purpose cannot be represented by the existing contract. Name that purpose and its background/foreground, theme behavior, contrast and state responsibilities. A palette sample or culturally significant source color does not automatically become an interface role.',
        'Keep custom-role definition separate from creating a new baseline or dynamic scheme. Record which algorithm or reviewed fixed values supply it, and test all actual contexts. Do not create a color-only vocabulary for source evidence or permission status.',
      ],
    },
    {
      title: 'Baseline adjustment, fidelity and harmonization',
      table: {
        headings: ['Adjustment', 'Meaning', 'Verify'],
        rows: [
          [
            'Own baseline',
            'A reviewed stable set of role assignments',
            'Light/dark/state compatibility and actual consumer output',
          ],
          [
            'Own dynamic scheme',
            'A deliberate algorithm/palette/role policy',
            'Versions, source inputs, fallback and contrast across representative seeds',
          ],
          [
            'Fidelity',
            'A scheme choice intended to retain source character in relevant roles',
            'Inspect actual outputs and effective spec; it is not exact seed reproduction everywhere',
          ],
          [
            'Harmonization',
            'Blend a custom color’s hue relationship toward a source',
            'Original/result values, role meaning and independent contrast',
          ],
          [
            'Direct role override',
            'Replace an agreed role value for a reason',
            'Every associated foreground, surface, focus and state',
          ],
        ],
      },
      paragraphs: [
        'The custom-color control implements an explicit SDK harmonization experiment and preserves original/result coordinates. It does not rewrite generated semantic roles, grant rights to use an asset or guarantee contrast. Keep recognizable error/status meaning rather than harmonizing everything for decoration.',
      ],
    },
    {
      title: 'Design-to-development handoff',
      bullets: [
        'Record the source rationale, original bytes/provenance where applicable, algorithm version, requested/effective scheme and contrast settings.',
        'Share complete role definitions and mappings, rather than screenshots or a few hex values alone.',
        'Use named semantic pairs in the design file and the actual consuming components; inspect the rendered result after export/import.',
        'Make manual/static decisions distinguishable from platform-personalized and content-derived values.',
        'Specify a fallback for unavailable sources and a strategy for updating/changing content without unexpected task-state changes.',
        'Keep a reviewed migration boundary and verify the consumers before changing shared Earth tokens.',
      ],
    },
    {
      title: 'Compiled generation helper',
      code: {
        language: 'typescript',
        value: snippets['lib/color-proposal.ts'],
      },
    },
    {
      title: 'Compiled explorer',
      code: { language: 'tsx', value: snippets['examples/color-proposal.tsx'] },
    },
    {
      title: 'Scoped control CSS',
      code: { language: 'css', value: snippets['examples/color-proposal.css'] },
    },
    {
      title: 'Original extraction fixture',
      code: {
        language: 'svg',
        value: snippets['public/fixtures/color-source.svg'],
      },
      paragraphs: [
        'The 64×64 authored vector is the only image source read by the extraction action. The swatch array and dimensions are explicit, and the chosen seed is reported as an algorithm result rather than a source identity or endorsement.',
      ],
    },
    {
      title: 'Verification and failure cases',
      bullets: [
        'Compare generated role values with the pinned SDK, including light/dark, variants, contrast levels and specification fallback.',
        'Compare requested versus realized high-chroma/light-tone HCT; verify impossible gamut requests are not labelled exact.',
        'Capture, edit the draft and inspect the retained JSON. Blank/invalid active settings must leave the capture unchanged.',
        'Extract from the actual fixture; compare the selected seed with the quantizer/ranking over its known pixels. Exercise image/canvas failure and held extraction with a competing source edit.',
        'Toggle harmonization and verify custom output changes independently of generated roles.',
        'Activate the local specimen and inspect computed colors; confirm root Earth tokens and unrelated controls remain unchanged.',
        'Check both global themes, independently selected proposal theme, 320px, text enlargement, keyboard fields/actions/full exports and accessibility scenes.',
        'Do not claim generated values or nominal SDK targets prove every production state, transparency layer, perceptual need or cultural authority.',
      ],
    },
  ],
  related: [
    { label: 'Colors and contrast', href: '/foundations/colors' },
    { label: 'Theming', href: '/guides/theming' },
    { label: 'Tokens', href: '/tokens' },
    {
      label: 'Component specifications',
      href: '/guides/component-specifications',
    },
    { label: 'Design review', href: '/guides/design-review' },
    {
      label: 'Material color system',
      href: 'https://m3.material.io/styles/color/system/how-the-system-works',
    },
    {
      label: 'Material role guidance',
      href: 'https://m3.material.io/styles/color/roles',
    },
    {
      label: 'Material advanced customization',
      href: 'https://m3.material.io/styles/color/advanced/overview',
    },
    {
      label: 'Material Color Utilities',
      href: 'https://github.com/material-foundation/material-color-utilities',
    },
    {
      label: 'Material color resources',
      href: 'https://m3.material.io/styles/color/resources',
    },
  ],
};
