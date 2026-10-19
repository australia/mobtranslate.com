import { readFile } from 'node:fs/promises';
import postcss from 'postcss';

/** Read authored defaults and explicit dark overrides, excluding the system fallback. */
export async function readTokens(source) {
  const tree = postcss.parse(await readFile(source, 'utf8'), { from: source });
  const tokens = new Map();
  tree.walkDecls((declaration) => {
    if (!declaration.prop.startsWith('--')) return;
    let explicitDark = false;
    let systemDark = false;
    for (let parent = declaration.parent; parent; parent = parent.parent) {
      if (parent.type === 'rule' && parent.selector === '.dark') explicitDark = true;
      if (parent.type === 'atrule' && parent.name === 'media' && parent.params.includes('prefers-color-scheme: dark')) systemDark = true;
    }
    if (systemDark && !explicitDark) return;
    const token = tokens.get(declaration.prop) ?? { name: declaration.prop, value: '', dark: null };
    if (explicitDark) token.dark = declaration.value;
    else token.value = declaration.value;
    tokens.set(declaration.prop, token);
  });
  const result = [...tokens.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const token of result) {
    if (!token.value) throw new Error(`Missing default for ${token.name}`);
  }
  return result;
}
