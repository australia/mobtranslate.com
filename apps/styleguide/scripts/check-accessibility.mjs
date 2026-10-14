import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const axeSource = await readFile(axePath, 'utf8');
const source = await readFile(new URL('../content/navigation.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('navigation.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const paths = [];
function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'href' && ts.isStringLiteral(node.initializer)) paths.push(node.initializer.text);
  ts.forEachChild(node, visit);
}
visit(tree);
const selected = process.env.STYLEGUIDE_A11Y_ROUTES?.split(',') ?? paths;
for (const route of selected) if (!paths.includes(route)) throw new Error(`Unknown documentation route: ${route}`);
const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
const session = `mobtranslate-axe-${process.pid}`;
function browser(args, input) {
  let output;
  try { output = execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', input, maxBuffer: 20 * 1024 * 1024, timeout: 150_000, killSignal: 'SIGKILL',
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '120000' },
  }); } catch (error) { if (typeof error.stdout !== 'string' || !error.stdout.trim()) throw error; output = error.stdout; }
  const response = JSON.parse(output);
  if (!response.success) throw new Error(response.error);
  return response.data;
}
const report = {
  base, engine: `axe-core ${require('axe-core/package.json').version}`,
  scope: 'Hydrated initial documentation states, all default enabled axe rules; closed/unmounted interactive content requires separate state checks. Automated results are not complete WCAG conformance evidence.',
  created: new Date().toISOString(), cases: [],
};
const destination = process.env.STYLEGUIDE_A11Y_REPORT;
const stream = process.env.STYLEGUIDE_A11Y_STREAM;
try {
  for (const appearance of [{ theme: 'light', width: 1440, height: 1000 }, { theme: 'dark', width: 320, height: 812 }]) {
    browser(['set', 'viewport', String(appearance.width), String(appearance.height)]);
    for (const path of selected) {
      browser(['open', `${base}${path}`]); browser(['wait', 'main h1']);
      browser(['eval', `localStorage.setItem('mt-theme', ${JSON.stringify(appearance.theme)}); window.dispatchEvent(new Event('storage'));`]);
      browser(['wait', `html.${appearance.theme}`]);
      // Wait for complete load and a paint; fonts and client effects can affect checks.
      browser(['wait', '--fn', 'document.readyState === "complete"']);
      const result = browser(['eval', '--stdin'], `${axeSource}\n;(async () => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const results = await axe.run(document);
        const detail = rule => ({ id: rule.id, impact: rule.impact, description: rule.description,
          help: rule.help, helpUrl: rule.helpUrl, tags: rule.tags,
          nodes: rule.nodes.map(node => ({ target: node.target, html: node.html, failureSummary: node.failureSummary,
            checks: [...node.any, ...node.all, ...node.none].map(check => ({id:check.id,impact:check.impact,message:check.message,data:check.data})) })) });
        return { title: document.title, href: location.href, violations: results.violations.map(detail),
          incomplete: results.incomplete.map(detail), passes: results.passes.map(rule => ({id:rule.id,nodes:rule.nodes.length})),
          inapplicable: results.inapplicable.map(rule => rule.id),
          overflow: document.documentElement.scrollWidth > innerWidth };
      })()` ).result;
      const entry = { path, ...appearance, ...result }; report.cases.push(entry);
      if (stream) await appendFile(stream, `${JSON.stringify(entry)}\n`);
      if (destination) await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`${report.cases.length}/${selected.length * 2} ${appearance.theme} ${path}: ${result.violations.length} rule violations, ${result.incomplete.length} review items, overflow=${result.overflow}`);
    }
  }
} finally { browser(['close']); }
const failures = report.cases.filter(entry => entry.violations.length || entry.overflow);
console.log(`${report.cases.length} rendered cases checked; ${failures.length} cases require fixes. Review items retained separately.`);
if (failures.length) process.exitCode = 1;
