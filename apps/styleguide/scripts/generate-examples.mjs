import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = ['examples/entry-form.tsx', 'examples/composition.tsx', 'examples/local-theme.tsx', 'lib/theme.ts', 'examples/button-actions.tsx', 'examples/button-composition.tsx', 'examples/icon-actions.tsx', 'examples/floating-actions.tsx', 'examples/accessible-request.tsx'];
const snippets = Object.fromEntries(await Promise.all(sources.map(async source => [source, await readFile(path.join(app, source), 'utf8')])));
const output = `${JSON.stringify(snippets, null, 2)}\n`;
const destination = path.join(app, 'content/examples.json');
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== output) throw new Error('Developer examples are stale. Run pnpm --filter styleguide examples:generate.');
} else await writeFile(destination, output);
console.log(`${sources.length} checked example sources ${process.argv.includes('--check') ? 'verified' : 'generated'}.`);
