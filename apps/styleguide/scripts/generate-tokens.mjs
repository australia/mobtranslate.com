import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../../../packages/ui/src/tokens/tokens.css');
const css = await readFile(source, 'utf8');
const tree = postcss.parse(css, { from: source });
const tokens = new Map();
tree.walkDecls((declaration) => {
  if (!declaration.prop.startsWith('--')) return;
  let explicitDark = false;
  let systemDark = false;
  for (let parent = declaration.parent; parent; parent = parent.parent) {
    if (parent.type === 'rule' && parent.selector === '.dark') explicitDark = true;
    if (parent.type === 'atrule' && parent.name === 'media' && parent.params.includes('prefers-color-scheme: dark')) systemDark = true;
  }
  // The explicit class is the user-selected theme. Its declarations are
  // authoritative if the system fallback contains the same token.
  if (systemDark && !explicitDark) return;
  const token = tokens.get(declaration.prop) ?? { name: declaration.prop, value: '', dark: null };
  if (explicitDark) token.dark = declaration.value;
  else token.value = declaration.value;
  tokens.set(declaration.prop, token);
});
const catalogue = {
  source: 'packages/ui/src/tokens/tokens.css',
  tokens: [...tokens.values()].sort((a, b) => a.name.localeCompare(b.name, 'en')),
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
