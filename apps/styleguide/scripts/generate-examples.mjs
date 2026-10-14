import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = ['examples/entry-form.tsx', 'examples/composition.tsx', 'examples/local-theme.tsx', 'examples/token-contract.tsx', 'examples/component-specifications.tsx', 'examples/glossary-explorer.tsx', 'lib/theme.ts', 'examples/button-actions.tsx', 'examples/button-composition.tsx', 'examples/icon-actions.tsx', 'examples/floating-actions.tsx', 'examples/accessible-request.tsx', 'examples/communication-status.tsx', 'examples/communication-progress.tsx', 'examples/communication-skeleton.tsx', 'examples/communication-toast.tsx', 'examples/containment-card.tsx', 'examples/containment-dialog.tsx', 'examples/containment-drawer.tsx', 'examples/containment-confirmation.tsx', 'examples/selection-checkbox.tsx', 'examples/selection-choice.tsx', 'examples/selection-chip.tsx', 'examples/selection-slider.tsx', 'examples/selection-toggle.tsx', 'examples/input-native.tsx', 'examples/input-field.tsx', 'examples/input-form.tsx', 'examples/input-number.tsx', 'examples/menu-commands.tsx', 'examples/menu-context.tsx', 'examples/menu-menubar.tsx', 'examples/navigation-tabs.tsx', 'examples/navigation-toolbar.tsx', 'examples/navigation-destinations.tsx', 'examples/navigation-breadcrumbs.tsx', 'examples/navigation-pagination.tsx', 'examples/adaptive-navigation.tsx', 'examples/adaptive-navigation.css', 'examples/select-preferences.tsx', 'examples/autocomplete-text.tsx', 'examples/combobox-choice.tsx', 'examples/date-time-window.tsx', 'examples/disclosure-tasks.tsx', 'examples/rating-feedback.tsx', 'examples/stepper-draft.tsx', 'examples/layout-utilities.tsx', 'examples/avatar-source.tsx', 'examples/scroll-records.tsx', 'examples/preview-destination.tsx', 'examples/table-records.tsx', 'examples/action-groups.tsx', 'examples/app-bar.tsx', 'examples/lists-carousel.tsx', 'examples/governed-workspace.tsx', 'public/fixtures/governed-records.json', 'examples/learning-practice.tsx', 'examples/audio-player.tsx', 'examples/offline-draft.tsx', 'scripts/generate-audio-fixture.mjs', 'public/fixtures/interface-lesson.json', 'public/fixtures/ui-tone.json'];
sources.push('examples/watch-display.tsx');
sources.push('examples/xr-geometry.tsx');
sources.push('lib/xr-geometry.ts');
sources.push('examples/alternative-text.tsx', 'public/fixtures/alternative-counts.json', 'public/fixtures/alternative-counts.svg', 'scripts/generate-alternative-fixture.mjs');
sources.push('lib/notice-content.ts', 'examples/notice-content.tsx');
sources.push('examples/layout-compositions.tsx', 'examples/layout-compositions.css');
sources.push('lib/spring-response.ts', 'examples/spring-response.tsx');
sources.push('examples/spring-response.css');
sources.push('lib/color-proposal.ts', 'examples/color-proposal.tsx', 'examples/color-proposal.css', 'public/fixtures/color-source.svg');
sources.push('public/fixtures/color-source.json', 'scripts/generate-color-fixture.mjs');
const snippets = Object.fromEntries(await Promise.all(sources.map(async source => [source, await readFile(path.join(app, source), 'utf8')])));
const output = `${JSON.stringify(snippets, null, 2)}\n`;
const destination = path.join(app, 'content/examples.json');
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== output) throw new Error('Developer examples are stale. Run pnpm --filter styleguide examples:generate.');
} else await writeFile(destination, output);
console.log(`${sources.length} checked example sources ${process.argv.includes('--check') ? 'verified' : 'generated'}.`);
