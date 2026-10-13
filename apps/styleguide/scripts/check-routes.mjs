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
  const result = browser('eval', `(async () => {
    const paths = ${JSON.stringify(paths)};
    const results = [];
    for (let start = 0; start < paths.length; start += 3) {
      results.push(...await Promise.all(paths.slice(start, start + 3).map(async path => {
        try {
          const response = await fetch(path);
          const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
          return { path, status: response.status, main: doc.querySelectorAll('main').length,
            h1: doc.querySelectorAll('h1').length, ids: [...doc.querySelectorAll('[id]')].map(node => node.id),
            links: [...doc.querySelectorAll('a[href]')].map(node => node.getAttribute('href')) };
        } catch (error) { return { path, error: String(error) }; }
      })));
    }
    const documents = new Map(results.map(result => [result.path, result]));
    const findings = [];
    for (const result of results) {
      if (result.status !== 200 || result.main !== 1 || result.h1 !== 1) findings.push({ path: result.path, reason: 'Route must return 200 with one main and h1', result });
      for (const href of result.links ?? []) {
        const target = new URL(href, location.origin + result.path);
        if (target.origin !== location.origin) continue;
        const document = documents.get(target.pathname);
        if (!document) findings.push({ from: result.path, href, reason: 'Missing documentation destination' });
        else if (target.hash && !document.ids?.includes(decodeURIComponent(target.hash.slice(1)))) findings.push({ from: result.path, href, reason: 'Missing fragment target' });
      }
    }
    return { base: location.origin, routes: results, findings };
  })()`).result;
  if (process.env.STYLEGUIDE_REPORT) await writeFile(process.env.STYLEGUIDE_REPORT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${result.routes.length} routes checked; ${result.findings.length} findings.`);
  if (result.findings.length) throw new Error(JSON.stringify(result.findings, null, 2));
} finally { browser('close'); }
