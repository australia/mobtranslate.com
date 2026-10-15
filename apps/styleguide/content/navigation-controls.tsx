import type { GuideDocumentData } from '../components/guide-document';
import { NavigationTabsExample } from '../examples/navigation-tabs';
import { NavigationToolbarExample } from '../examples/navigation-toolbar';
import snippets from './examples.json';

const shared = ['className / style / render / native props', 'Installed state callbacks are preserved. Custom rendered elements must retain supplied roles, handlers, attributes and refs. Check actual DOM and keyboard behavior after composition.'];
const verification = {title:'Verification and release scope',bullets:['Check actual values/content, names, roles, relations, focus order and unavailable activation with pointer and keyboard. Change callbacks alone do not prove a working task.','Test 320px reflow, long labels, both themes, text spacing/zoom, live orientation/RTL, reduced motion and forced colors. Hardware touch and spoken announcements need their own device/browser evidence.','Run test:navigation-controls, source/token freshness, lint, typechecks, production build and route checks. Family tests are scoped evidence, not whole-library accessibility certification.','English-only examples use local page state. They establish no persistent save, source authority, consent, cultural permission, language correctness or remote review.']};

export const tabsDocument: GuideDocumentData = {
  title:'Tabs', description:'Related task views with distinct focus and selection, retained drafts and explicit activation behavior.',
  sections:[
    {title:'Choose tabs for related views',paragraphs:['Use tabs for a small set of related panels occupying one place. Labels should tell users what each view contains. Use real links for independently addressable destinations, toggle groups for setting values and accordions when several sections should remain visible.','Manual activation is the installed default: arrows move focus; Enter or Space selects. Automatic activation suits content ready without noticeable delay. Loading on every focus movement can make exploration costly and confusing.'],bullets:['Name the tab list for its task. Keep labels short, distinct and meaningful; an icon still needs an accessible name.','Explain unavailable views outside their hidden panel. If an active view becomes unavailable, choose a surviving selection and handle focus deliberately.','A tab root label does not replace the tab-list name. Tabs supply no URL/history synchronization, persistence, authorization or data-loading policy.']},
    {title:'Anatomy, dimensions and visual states',table:{headings:['Part','Actual contract'],rows:[['Tabs','Default div; horizontal column of list/panel. Vertical mode places list beside panel with 16px gap.'],['TabsList','Default div with tablist role; caller supplies name. A neutral outer scroller contains the horizontal list within available width; the inner list retains stable indicator coordinates. Size/selection changes keep the focused or selected tab visible after label metrics change. Vertical list occupies at most 45% and labels wrap.'],['TabsTrigger','Default button, minimum 44px height/width and 8px × 16px padding. Horizontal labels retain width within contained scrolling.'],['Selected / focused','Installed data-active marks selection: foreground/bold text and position indicator. Keyboard focus has an independent 2px inset outline.'],['Indicator','Automatically included by TabsList. Horizontal left/width and vertical top/height consume installed --active-tab-* variables; 2px edge follows selection.'],['TabsContent','Default div with tabpanel role; 16px top spacing, flexible width and wrapping. Inactive panels unmount by default; keepMounted retains hidden content.'],['Disabled / alternate modes','Disabled triggers expose unavailable state and remain arrow-focusable for discovery while rejecting selection. Reduced motion removes transitions; forced colors use system highlight/disabled text. Platform verification remains required.']]}},
    {
  "title": "Material primary, secondary and scrollable tabs",
  "paragraphs": [
    "Primary tabs identify peer content under an app bar; secondary tabs subdivide related content below them. They do not represent sequential required steps. The native variants differ mainly in indicator emphasis, while the installed Tabs has its own documented visual/API contract. Keep optional icons consistent across a set and preserve clear text labels."
  ],
  "table": {
    "headings": [
      "Reference decision",
      "Local web contract and application choice"
    ],
    "rows": [
      [
        "Native geometry",
        "Reference label-only tabs are 48dp, icon/label 64dp with 24dp icons,3dp primary or 2dp secondary indicators,24dp minimum indicator length and 2dp inset. A52dp leading offset signals native scrollable content. Those are reference values; the local 44px targets, contained scroller and indicator variables are the implemented geometry."
      ],
      [
        "Fixed versus scrollable",
        "The source describes equal full-width fixed sections, then widest-tab/fluid-margin placement; apply that advice to the actual pane rather than one universal width rule. Prefer a small fixed set (native advice up to four); long or larger sets need contained horizontal scrolling, reachable endpoints and full labels. Local enlarged text preserves names instead of truncation."
      ],
      [
        "Focus, selection and loading",
        "The reference uses navigation/menu language; installed web tablist/tab/tabpanel relations remain authoritative. Manual activation is the pin’s default, separating focus from selected content; automatic activation is suitable only for ready content. A roving keyboard loop is different from an endlessly scrolling visual strip."
      ],
      [
        "Badges and state",
        "If a tab has an unread badge, own its count and clear/update it when the relevant content is actually viewed. Color alone is insufficient: retain an indicator and semantic selection, with independent focus. No automatic unread service or badge-reset behavior is implied by Tabs."
      ],
      [
        "Scrolling and gesture scope",
        "A pinned set should move consistently with its app bar and never disappear behind it. This lab uses a bounded in-flow tab set. Native content swiping, scroll-to-hide/reappear and container transitions are not installed; do not add competing swipe gestures over maps or independently scrollable panels."
      ],
      [
        "Density and accessibility",
        "The reference recommends 48 CSS px targets and no default density reduction. Local target sizes are specified separately; a consumer choosing denser presentation needs an accessible independent way to undo it. Check offscreen focus/selection, full labels at 200% text, both themes, RTL and actual panel lifecycle."
      ]
    ]
  }
},
  {title:'Working views and retained recovery',paragraphs:['Edit the local draft, switch to Preview and request a local check. Completion, failure and cancellation preserve text. Outcome controls return focus to their surviving preview panel before disappearing. Orientation, direction, activation and mounting changes retain parent-owned task state.'],example:<NavigationTabsExample />,code:{language:'tsx',value:snippets['examples/navigation-tabs.tsx']}},
    {title:'API reference for the installed version',paragraphs:['Contracts describe @base-ui-components/react 1.0.0-rc.0 installed here. Current upstream documentation can describe newer APIs. Styled parts preserve state callback classes.'],table:{headings:['Export / prop','Contract and default'],rows:[['Tabs value / defaultValue','Controlled/uncontrolled selection. Installed defaultValue is 0; explicitly match string trigger values. null means no active tab.'],['Tabs onValueChange','Selected value plus event details, including activationDirection. Application loading/saving remains caller-owned.'],['Tabs orientation','horizontal default; vertical alternative. DirectionProvider and DOM dir supply matching keyboard/layout direction.'],['TabsList activateOnFocus','false default; true selects on arrow focus. Verify readiness/latency.'],['TabsList loopFocus','true default; false bounds arrow focus at ends.'],['TabsTrigger value / disabled / nativeButton','Match panel value; installed button interaction/availability. Default element is button; custom render must preserve semantics. Ref type Element reflects possible custom nodes.'],['TabsContent value / keepMounted','Matched view; keepMounted false default. Retained hidden DOM does not establish persistence or stop effects.'],shared]}},
    {title:'Keyboard, focus and announcements',bullets:['Tab enters the composite and leaves for the active panel/content. Arrows move among triggers according to orientation and direction; unavailable triggers remain discoverable but do not select. Check Home/End and first/last wrapping.','Manual focus and selection can differ. Enter/Space selects the focused trigger; automatic arrow focus also selects. Do not add a second independent selection handler.','The active tab has aria-selected; panels have aria-labelledby. Inspect tab/panel relations in the chosen mount strategy, including hidden/unmounted views.','A panel without a meaningful first focusable control needs a reading stop. The installed panel supplies focusability; preserve it with custom rendering. Selecting a tab should not unexpectedly focus an input. Keep narrow panel actions wrapping within available width; the checked source explicitly supplies that responsive button composition.','Selected view and requested task outcome are distinct. Give pending/error/result status its own announcement boundary; avoid making every keystroke an intrusive live region. Check spoken output with a named screen-reader/browser pair.']},
    {title:'State ownership, loading and failure',table:{headings:['Situation','Decision'],rows:[['Unmounted draft','Own durable text above panels or in an appropriate store. An uncontrolled input inside an unmounted panel can lose its value.'],['keepMounted','Retains DOM and possibly effects/subscriptions. Hidden controls must stay outside active focus order.'],['Pending resource','Retain useful task context and supply loading, cancellation and retry without blocking unrelated views. This lab waits for explicit outcomes.'],['Failure / cancellation','Retain entered values; distinguish a rejected request from a retained draft. Restore focus when the outcome control disappears.'],['Dynamic removal / permission change','Select a valid surviving panel and move focus deliberately when removing a trigger/content. Business fallback and permission policy remain caller-owned.'],['Deep links / history','Use validated route state and back/forward tests when required; the primitive does not supply history synchronization.']]}},
    {title:'Composition and common failures',bullets:['Use data-active, not data-selected, for this installed tab primitive. A plausible unsupported selector can leave selection visually unchanged.','Indicator CSS must use supplied geometry variables. An absolutely positioned empty span without width/position is not a visible selection cue.','Do not claim all inactive content is always removed: keepMounted retains it. Verify hidden actions and visibility.','Avoid wrapping tabs across rows while promising one-dimensional spatial navigation. Prefer contained scrolling, fewer categories or a different content structure.','Keep actual list/trigger/panel primitives and matching values. Generic divs with roles alone do not implement the interaction.']},verification,
  ],related:[{label:'Navigation patterns',href:'/patterns/navigation'},{label:'Toggle groups',href:'/components/toggle-group'},{label:'Toolbar',href:'/components/toolbar'},{label:'Layout',href:'/foundations/layout'},{label:'Accessibility',href:'/guides/accessibility'},{label:'W3C tabs pattern',href:'https://www.w3.org/WAI/ARIA/apg/patterns/tabs/'},{label:'Material tabs coverage reference',href:'https://m3.material.io/components/tabs/overview'}],
};

export const toolbarDocument: GuideDocumentData = {
  title:'Toolbar', description:'Frequent task actions in one named composite, with actual effects and discoverable unavailable controls.',
  sections:[
    {title:'Choose direct task actions',paragraphs:['Use a toolbar for several frequent controls acting on the current task. A command bar with menus is a menubar; site destinations belong in navigation. A toolbar reduces repeated Tab stops while arrows explore controls.','Use meaningful labels rather than unexplained letters. Icon actions need useful names and discoverable explanations. Toggle actions expose aria-pressed and change actual state; ordinary commands should not pretend to be toggles.'],bullets:['Provide a task-specific toolbar name and subgroup labels when grouping matters.','Avoid controls whose arrow-key operation conflicts with toolbar navigation. Complex composition needs its own interaction design and tests.','A disabled control may remain arrow-focusable for discovery. Explain unavailability and reject activation independently from focusability.']},
    {title:'Anatomy, specifications and variants',table:{headings:['Part','Actual contract'],rows:[['Toolbar','Default div with toolbar role; horizontal wrapping flex, 4px gap/padding, 2px border and medium radius. Vertical orientation makes a column.'],['ToolbarButton','Default button, minimum 44px target and 8px padding. Muted hover fill and independent 2px inset keyboard outline.'],['Pressed state','Caller-owned aria-pressed drives actual setting and foreground/background pressed treatment. ToolbarButton is not automatically a toggle.'],['ToolbarGroup','Groups controls and can disable contained buttons. Orientation follows root; installed primitive supplies grouping semantics.'],['ToolbarSeparator','Presentation division perpendicular to toolbar direction: 1px line with 4px margin. No action name.'],['ToolbarLink','Default anchor; underlined foreground text and minimum 44px target. Real href supplies destination behavior. Root disabled does not disable links.'],['Adaptive / alternate modes','Narrow horizontal controls wrap in DOM order. Prefer fewer actions/verified menu when labels dominate. Reduced-motion/forced-color rules are supplied.']]}},
    {
  "title": "Material docked and floating toolbar choices",
  "paragraphs": [
    "The expressive docked toolbar replaces the native baseline bottom app bar recommendation; floating toolbars add contextual horizontal/vertical placement and optional separately composed FABs. Standard surface colors keep attention on content; vibrant roles or one emphasized action increase control emphasis. These are native layout/visual variants, not additional props of this web Toolbar composite."
  ],
  "table": {
    "headings": [
      "Reference decision",
      "Local web contract and application choice"
    ],
    "rows": [
      [
        "Dimensions and shape",
        "Native defaults include 64dp height,16dp outside padding/margin (24dp for vertical floating placement),48dp targets and configurable item spacing. Native docked corners are normally straight, but later web/large-screen guidance permits rounding and other placement. The local wrapping border/radius/gap and 44px controls are the actual contract; avoid claiming a native fixed bottom surface."
      ],
      [
        "Hierarchy and navigation",
        "Avoid two competing controls occupying the same bottom navigation space. A document sidebar plus a local command toolbar is a different relationship. Keep site destinations as links/navigation, tab categories as Tabs and command composites as Toolbar. One primary action/FAB is clearer than several competing emphasized controls."
      ],
      [
        "Slots and overflow",
        "Toolbar slots can contain actions or text inputs, but each keeps its semantic and keyboard contract. This fixture supplies formatting, duplication, an unavailable command and a context link. Extra actions can use an actually implemented Menu composition; no automatic overflow menu or keyboard shortcut manager is exported."
      ],
      [
        "Responsive and floating placement",
        "Native floating surfaces stay within their pane, with essential actions visible and trailing overflow when needed. Vertical floating is generally unsuitable for complex compact layouts, and larger layouts may place it opposite a rail. This lab demonstrates live orientation and direction in flow, without covering content or advertising FAB-collapse physics."
      ],
      [
        "Container and keyboard",
        "Native mobile containers may be generic and have no independent interactions; web uses toolbar. The installed primitive is a roving-focus composite with its pinned arrow, disabled-discovery and link behavior, rather than a role added to a div of ordinary Tab buttons. Embedded editing controls must preserve their own input keys when composed."
      ],
      [
        "Scrolling and lifecycle",
        "Native choices stay, hide or collapse on scroll; do not collapse and move offscreen together. The local toolbar remains in document flow. A product adding sticky/floating behavior must preserve all commands, focus and recovery during scrolling/resizing and mirror only directional meaning in RTL."
      ]
    ]
  }
},
  {title:'Working commands and context',paragraphs:['Bold and Italic change sample style; Duplicate changes the actual local count. Unavailable publish is wired to a detectable invalid outcome but must reject activation. Change orientation/direction/disabled focusability to inspect behavior. The context link remains a real destination while buttons are disabled.'],example:<NavigationToolbarExample />,code:{language:'tsx',value:snippets['examples/navigation-toolbar.tsx']}},
    {title:'API reference for the installed version',table:{headings:['Export / prop','Installed rc.0 contract'],rows:[['Toolbar orientation / loopFocus','horizontal / true defaults. Orientation changes navigation and geometry; false loopFocus stops at ends.'],['Toolbar disabled','Disables contained toolbar buttons. Real ToolbarLink destinations remain available; guard/hide unavailable destinations explicitly.'],['ToolbarButton disabled / focusableWhenDisabled','false / true defaults. Disabled action can remain arrow-discoverable while rejecting activation; false skips it.'],['ToolbarButton type / nativeButton / render','Default button; specify type="button" for commands in forms. Preserve installed handlers/refs when composing a trigger/custom button.'],['ToolbarButton aria-pressed / onClick','Caller-owned setting/action. Change actual value and content; CSS data-pressed alone does not establish semantics.'],['ToolbarGroup disabled','Disables group buttons; neither an authorization gate nor a native fieldset.'],['ToolbarLink href / native anchor props','Anchor/href with installed composite focus integration. No disabled prop.'],['ToolbarSeparator','Installed perpendicular separator orientation. Put meaningful labels on groups, not separators.'],shared]}},
    {title:'Keyboard and alternate input',bullets:['Tab/Shift+Tab enters and leaves the composite. Arrows follow orientation/DirectionProvider. Test live direction changes before the next key.','The installed Toolbar does not enable Home/End; use arrows and verify loopFocus wrapping. Do not assume disabled controls are skipped: this version defaults focusableWhenDisabled to true.','Enter/Space performs button actions. Unavailable controls reject pointer/keyboard activation; links retain native destination behavior.','Wrapped toolbars retain one-dimensional DOM order; do not imply row/column navigation.','Text labels work for touch and keyboard. Tooltips alone are insufficient names. Shortcuts require a documented task boundary and are not supplied here.']},
    {title:'State, recovery and composition',table:{headings:['State / failure','Response'],rows:[['Rest / pressed','Actual formatting/count is authoritative; aria-pressed and visual cue reflect the same value.'],['Unavailable','Readable reason, rejected callbacks and explicit discoverability choice.'],['Root disabled','Explain unavailable buttons and retain independent recovery. Links remain destinations; no whole-subtree disable claim.'],['Pending remote command','Guard duplicate requests, retain task state and show cancel/outcome/retry outside disappearing controls. This lab runs no remote command.'],['Restore','Reset actual styles/count and re-enable controls with an independent button. No destructive data action occurs.'],['Custom rendering','Retain ref, native semantics, composite focus and merged handlers. A generic child with toolbar role is insufficient.'],['Navigation confusion','Do not use toolbar/menubar roles for site destinations. Use named nav, real links and current-page state.']]}},verification,
  ],related:[{label:'Commands and contextual actions',href:'/patterns/commands'},{label:'Menubar',href:'/components/menubar'},{label:'Icon button',href:'/components/icon-button'},{label:'Toggle',href:'/components/toggle'},{label:'Accessibility',href:'/guides/accessibility'},{label:'W3C toolbar pattern',href:'https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/'}],
};
