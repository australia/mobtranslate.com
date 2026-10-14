import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTokens } from '../../../packages/ui/scripts/read-tokens.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../../../packages/ui/src/tokens/tokens.css');
const tokens = await readTokens(source);
const catalogue = {
  source: 'packages/ui/src/tokens/tokens.css',
  tokens: tokens,
};
const destination = path.resolve(here, '../content/tokens.json');
await mkdir(path.dirname(destination), { recursive: true });
const output = `${JSON.stringify(catalogue, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const existing = await readFile(destination, 'utf8');
  if (existing !== output) throw new Error('Token catalogue is stale. Run pnpm --filter styleguide tokens:generate.');
} else {
  await writeFile(destination, output);
}
console.log(`${catalogue.tokens.length} CSS tokens ${process.argv.includes('--check') ? 'verified' : 'generated'}.`);
