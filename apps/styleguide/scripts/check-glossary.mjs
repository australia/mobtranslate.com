import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function moduleFrom(file) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const [{ glossaryEntries, glossaryId }, { sections }, reference] = await Promise.all([
  moduleFrom('../content/glossary.ts'), moduleFrom('../content/navigation.ts'),
  readFile(new URL('../content/material-glossary-index.json', import.meta.url), 'utf8').then(JSON.parse),
]);
const paths = new Set(sections.flatMap(section => section.items.map(item => item.href)));
const material = glossaryEntries.filter(entry => entry.material).map(entry => entry.term).sort();
if (JSON.stringify(material) !== JSON.stringify([...reference.terms].sort())) throw new Error('Glossary reference headings differ from the captured Material inventory.');
const ids = new Set();
for (const entry of glossaryEntries) {
  const id = glossaryId(entry.term);
  if (ids.has(id)) throw new Error(`Duplicate glossary fragment: ${id}`);
  ids.add(id);
  for (const field of ['term', 'category', 'definition', 'decision', 'failure', 'href']) if (!entry[field]?.trim()) throw new Error(`Incomplete glossary ${entry.term}: ${field}`);
  if (!paths.has(entry.href)) throw new Error(`Unknown related glossary route: ${entry.href}`);
}
console.log(`${reference.terms.length} Material headings and ${glossaryEntries.length} authored entries verified, with unique fragments and known related routes.`);
