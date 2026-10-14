import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readTokens } from './read-tokens.mjs';

const source = fileURLToPath(new URL('../src/tokens/tokens.css', import.meta.url));
const tokens = await readTokens(source);
const defaults = Object.fromEntries(tokens.map(({ name, value }) => [name, value]));
const dark = Object.fromEntries(tokens.map(({ name, value, dark }) => [name, dark ?? value]));
const group = (prefix, values = defaults, transform = (key) => key) => Object.fromEntries(
  Object.entries(values).filter(([name]) => name.startsWith(prefix)).map(([name, value]) => [transform(name.slice(prefix.length)), value]),
);
const palettes = {};
const roles = {};
const darkRoles = {};
for (const token of tokens.filter(({ name }) => name.startsWith('--color-'))) {
  const name = token.name.slice('--color-'.length);
  const shade = name.match(/^(.+)-(50|100|200|300|400|500|600|700|800|900|950)$/);
  if (shade) (palettes[shade[1]] ??= {})[shade[2]] = token.value;
  else {
    roles[name] = token.value;
    darkRoles[name] = token.dark ?? token.value;
  }
}
// Neutral constants remain available for data visualization and non-role uses.
palettes.white = '#ffffff';
palettes.black = '#000000';
const exports = {
  cssTokens: defaults, darkCssTokens: dark,
  colors: palettes, semanticColorValues: roles, darkColorValues: darkRoles,
  spacing: group('--spacing-', defaults, (key) => key.replaceAll('-', '.')),
  textSizes: group('--text-'), fontFamily: group('--font-'), borderRadius: group('--radius-'),
  shadows: group('--shadow-'), darkShadows: group('--shadow-', dark),
  motion: { duration: group('--duration-'), easing: group('--ease-') },
  zIndex: group('--z-'), breakpoints: group('--breakpoint-'), containers: group('--container-'),
  opacity: Object.fromEntries(Object.entries(group('--opacity-')).map(([key, value]) => {
    if (!/^\d+(?:\.\d+)?%$/.test(value)) throw new Error(`Expected percentage opacity for ${key}`);
    return [key, String(parseFloat(value) / 100)];
  })),
  focusRing: group('--ring-'), transitionValues: group('--transition-'),
};
const output = '// Generated from tokens.css. Run pnpm --filter @mobtranslate/ui tokens:generate.\n'
  + '// These are authored values, not live computed styles or automatic theme selection.\n\n'
  + Object.entries(exports).map(([name, values]) => `export const ${name} = ${JSON.stringify(values, null, 2).replace(/"(\d+(?:\.\d+)?)":/g, '$1:')} as const;\n`).join('\n');
const destination = new URL('../src/tokens/generated.ts', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== output) throw new Error('TypeScript tokens are stale. Run pnpm --filter @mobtranslate/ui tokens:generate.');
} else await writeFile(destination, output);
console.log(`${tokens.length} CSS declarations ${process.argv.includes('--check') ? 'verified against' : 'generated as'} TypeScript tokens.`);
