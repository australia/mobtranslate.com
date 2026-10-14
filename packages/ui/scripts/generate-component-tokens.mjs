import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { readTokens } from './read-tokens.mjs';

const source = fileURLToPath(new URL('../src/components/components.css', import.meta.url));
const tree = postcss.parse(await readFile(source, 'utf8'), { from: source });
const bindings = JSON.parse(await readFile(new URL('../src/tokens/component-bindings.json', import.meta.url), 'utf8'));
const primitiveValues = new Map((await readTokens(fileURLToPath(new URL('../src/tokens/tokens.css', import.meta.url)))).map(({ name, value }) => [name, value]));
const specifications = [];

function readDeclaration(binding) {
  let found;
  tree.walkRules((rule) => {
    // This contract describes direct declarations in unlayered rules, not cascade evaluation.
    for (let parent = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule') return;
    if (!rule.selectors.includes(binding.selector)) return;
    for (const declaration of rule.nodes) {
      if (declaration.type === 'decl' && declaration.prop === binding.property) found = declaration;
    }
  });
  if (found) return { value: found.value, line: found.source.start.line, origin: 'declaration' };
  if (binding.initial === undefined) throw new Error(`Missing ${binding.selector} { ${binding.property} }`);
  return { value: binding.initial, line: null, origin: binding.origin ?? 'initial' };
}
function extract(value, mode) {
  if (!mode) return value;
  const parts = postcss.list.space(value);
  if (mode === 'padding-x') {
    if (parts.length === 4 && parts[1] !== parts[3]) throw new Error(`Asymmetric horizontal padding needs separate bindings: ${value}`);
    return parts[1] ?? parts[0];
  }
  if (mode === 'padding-y') {
    if (parts.length >= 3 && parts[0] !== parts[2]) throw new Error(`Asymmetric vertical padding needs separate bindings: ${value}`);
    return parts[0];
  }
  if (mode === 'border-width') return parts[0];
  if (mode === 'alpha') {
    if (!value.startsWith('rgba(') || !value.endsWith(')')) throw new Error(`Unsupported backdrop alpha syntax: ${value}`);
    const channels = postcss.list.comma(value.slice(5, -1));
    if (channels.length !== 4 || !/^\d*\.?\d+$/.test(channels[3])) throw new Error(`Invalid backdrop alpha: ${value}`);
    return channels[3];
  }
  throw new Error(`Unknown CSS extraction: ${mode}`);
}
function resolvePrimitive(value) {
  const visited = new Set();
  while (value.startsWith('var(')) {
    const name = value.slice(4, -1);
    if (!primitiveValues.has(name) || visited.has(name)) throw new Error(`Unresolved primitive: ${value}`);
    visited.add(name); value = primitiveValues.get(name);
  }
  return value;
}
function generate(node, exportName, keys = []) {
  if (!node.selector) return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, generate(child, exportName, [...keys, key])]));
  const declaration = readDeclaration(node);
  let value = extract(declaration.value, node.extract);
  if (node.resolve) value = resolvePrimitive(value);
  specifications.push({ exportName, path: keys.join('.'), selector: node.selector, property: node.property,
    computedProperty: node.computed ?? node.property, sourceValue: declaration.value, value,
    source: 'packages/ui/src/components/components.css', line: declaration.line, origin: declaration.origin,
    note: node.note ?? '' });
  return value;
}
const presets = Object.fromEntries(Object.entries(bindings).map(([name, node]) => [name, generate(node, name)]));
const output = '// Generated from component-bindings.json and components.css. Do not hand-edit.\n'
  + '// Authored specifications are not live geometry, per-instance overrides or a full CSS cascade engine.\n\n'
  + Object.entries(presets).map(([name, values]) => `export const ${name} = ${JSON.stringify(values, null, 2)} as const;\n`).join('\n')
  + `\nexport const componentPresets = { ${Object.keys(presets).join(', ')} } as const;\n`
  + `\nexport const componentTokenSpecifications = ${JSON.stringify(specifications, null, 2)} as const;\n`;
const destination = new URL('../src/tokens/components.ts', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== output) throw new Error('Component presets are stale. Run pnpm --filter @mobtranslate/ui component-tokens:generate.');
} else await writeFile(destination, output);
console.log(`${Object.keys(presets).length} component presets and ${specifications.length} fields ${process.argv.includes('--check') ? 'verified' : 'generated'}.`);
