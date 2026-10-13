import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = ['examples/entry-form.tsx', 'examples/composition.tsx', 'examples/local-theme.tsx', 'lib/theme.ts', 'examples/button-actions.tsx', 'examples/button-composition.tsx', 'examples/icon-actions.tsx', 'examples/floating-actions.tsx', 'examples/accessible-request.tsx', 'examples/communication-status.tsx', 'examples/communication-progress.tsx', 'examples/communication-skeleton.tsx', 'examples/communication-toast.tsx', 'examples/containment-card.tsx', 'examples/containment-dialog.tsx', 'examples/containment-drawer.tsx', 'examples/containment-confirmation.tsx', 'examples/selection-checkbox.tsx', 'examples/selection-choice.tsx', 'examples/selection-chip.tsx', 'examples/selection-slider.tsx', 'examples/selection-toggle.tsx', 'examples/input-native.tsx', 'examples/input-field.tsx', 'examples/input-form.tsx', 'examples/input-number.tsx', 'examples/menu-commands.tsx', 'examples/menu-context.tsx', 'examples/menu-menubar.tsx', 'examples/navigation-tabs.tsx', 'examples/navigation-toolbar.tsx', 'examples/navigation-destinations.tsx', 'examples/navigation-breadcrumbs.tsx', 'examples/navigation-pagination.tsx'];
const snippets = Object.fromEntries(await Promise.all(sources.map(async source => [source, await readFile(path.join(app, source), 'utf8')])));
const output = `${JSON.stringify(snippets, null, 2)}\n`;
const destination = path.join(app, 'content/examples.json');
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== output) throw new Error('Developer examples are stale. Run pnpm --filter styleguide examples:generate.');
} else await writeFile(destination, output);
console.log(`${sources.length} checked example sources ${process.argv.includes('--check') ? 'verified' : 'generated'}.`);
