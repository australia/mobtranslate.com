import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';

const rootRequire = createRequire(new URL('../../../package.json', import.meta.url));
const { JSDOM } = rootRequire('jsdom');
const source = await readFile(new URL('../content/navigation.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { sections } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const paths = sections.flatMap(section => section.items.map(item => item.href));
const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
const inventoryPath = process.env.STYLEGUIDE_API_REPORT;
const destination = process.env.STYLEGUIDE_DOC_REPORT;
if (!inventoryPath || !destination) throw new Error('Set STYLEGUIDE_API_REPORT and STYLEGUIDE_DOC_REPORT to mounted output paths.');
const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
const documents = [];
for (let offset = 0; offset < paths.length; offset += 3) {
  documents.push(...await Promise.all(paths.slice(offset, offset + 3).map(async path => {
    const response = await fetch(new URL(path, base));
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    const dom = new JSDOM(await response.text());
    const main = dom.window.document.querySelector('main');
    if (!main) throw new Error(`${path}: missing main`);
    main.querySelectorAll('script,style,template,[aria-hidden="true"],.code-toolbar,.copy-status,[data-api-ready]').forEach(node => node.remove());
    const headings = [...main.querySelectorAll('h1,h2,h3')].map(node => ({ text: node.textContent.trim(), id: node.id, level: Number(node.tagName.slice(1)) }));
    const walker = dom.window.document.createTreeWalker(main, dom.window.NodeFilter.SHOW_TEXT);
    const fragments = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) fragments.push(node.textContent);
    const text = fragments.join(' ').replace(/\s+/g, ' ');
    const result = { path, title: headings[0]?.text, headings, text };
    dom.window.close(); return result;
  })));
}
const components = inventory.exports.filter(entry => entry.kind === 'callable component').map(entry => {
  const pattern = new RegExp(`(?<![\\w])${entry.name}(?![\\w])`);
  const mentions = documents.filter(document => pattern.test(document.text)).map(document => document.path);
  const localProps = entry.props.filter(property => property.locallyDeclared).map(property => ({ name: property.name,
    mentionRoutes: documents.filter(document => pattern.test(document.text) && document.text.includes(property.name)).map(document => document.path) }));
  return { name: entry.name, sites: entry.sites, mentionRoutes: mentions, localProps };
});
const report = { base, created: new Date().toISOString(),
  scope: 'Rendered authored documentation text and compiler-export mentions; generated API explorer is excluded so it cannot mask authored topic omissions. A mention in code/prose is not proof of a complete API contract, behavior, examples or accessibility. Use this inventory to find omissions, then inspect actual topic sections.',
  documents: documents.map(({text,...rest}) => rest), components,
  unmentionedComponents: components.filter(entry => !entry.mentionRoutes.length).map(entry => entry.name),
};
await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${documents.length} routes inspected; ${components.length} callable exports; ${report.unmentionedComponents.length} absent from rendered documentation text.`);
