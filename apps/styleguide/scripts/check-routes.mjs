import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const source = await readFile(new URL('../content/navigation.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('navigation.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const paths = [];
function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'href' && ts.isStringLiteral(node.initializer)) paths.push(node.initializer.text);
  ts.forEachChild(node, visit);
}
visit(tree);
if (!paths.length || new Set(paths).size !== paths.length) throw new Error('Navigation must contain unique documentation routes.');
const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
const session = `mobtranslate-route-check-${process.pid}`;
const browser = (...args) => {
  let output;
  try { output = execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 150_000 }); }
  catch (error) { if (!error.stdout) throw error; output = error.stdout; }
  const response = JSON.parse(output);
  if (!response.success) throw new Error(response.error);
  return response.data;
};
try {
  browser('open', base);
  browser('wait', 'main h1');
  const origin = browser('eval', 'location.origin').result;
  const routes = [];
  // Keep each browser evaluation bounded. Validate against every collected route below.
  for (let start = 0; start < paths.length; start += 3) {
    const batch = paths.slice(start, start + 3);
    const collected = browser('eval', `(async () => Promise.all(${JSON.stringify(batch)}.map(async path => {
      try {
        const response = await fetch(path);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        return { path, status: response.status, main: doc.querySelectorAll('main').length,
          h1: doc.querySelectorAll('h1').length, ids: [...doc.querySelectorAll('[id]')].map(node => node.id),
          links: [...doc.querySelectorAll('a[href]')].map(node => node.getAttribute('href')) };
      } catch (error) { return { path, error: String(error) }; }
    })))()`).result;
    if (!Array.isArray(collected) || collected.length !== batch.length || collected.some((document, index) => document.path !== batch[index])) throw new Error('Route batch returned incomplete or unrelated documents.');
    routes.push(...collected);
  }
  if (routes.length !== paths.length) throw new Error('Route collection is incomplete.');
  const documents = new Map(routes.map(document => [document.path, document]));
  const findings = [];
  for (const document of routes) {
    if (document.status !== 200 || document.main !== 1 || document.h1 !== 1) findings.push({ path: document.path, reason: 'Route must return 200 with one main and h1', result: document });
    for (const href of document.links ?? []) {
      const target = new URL(href, origin + document.path);
      if (target.origin !== origin) continue;
      const destination = documents.get(target.pathname);
      if (!destination) findings.push({ from: document.path, href, reason: 'Missing documentation destination' });
      else if (target.hash && !destination.ids?.includes(decodeURIComponent(target.hash.slice(1)))) findings.push({ from: document.path, href, reason: 'Missing fragment target' });
    }
  }
  const result = { base: origin, routes, findings };
  if (process.env.STYLEGUIDE_REPORT) await writeFile(process.env.STYLEGUIDE_REPORT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${result.routes.length} routes checked; ${result.findings.length} findings.`);
  if (result.findings.length) throw new Error(JSON.stringify(result.findings, null, 2));
} finally { browser('close'); }
