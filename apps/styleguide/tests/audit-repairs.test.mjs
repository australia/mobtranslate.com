import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
const session = `mobtranslate-audit-repairs-${process.pid}`;
const browser = (...args) => {
  if (args[0] === 'wait' && args[1] === '--fn') new Function(`return (${args[2]});`);
  let output;
  try { output = execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 150_000, killSignal: 'SIGKILL', env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '120000' } }); }
  catch (error) { if (typeof error.stdout !== 'string' || !error.stdout.trim()) throw error; output = error.stdout; }
  const response = JSON.parse(output); assert.equal(response.success, true, response.error); return response.data;
};
const evaluate = code => browser('eval', code).result;
const open = path => { browser('open', `${base}${path}`); browser('wait', 'main h1'); };
before(() => browser('set', 'viewport', '320', '812'));
after(() => browser('close'));

test('mobile banner and named code groups retain native keyboard access', () => {
  open('/components/button');
  assert.equal(evaluate('document.querySelector(".mobile-nav-header").tagName'), 'HEADER');
  assert.ok(evaluate('[...document.querySelectorAll("main pre[aria-label]")].every(node=>node.getAttribute("role")==="group" && node.tabIndex===0)'));
  browser('focus', 'main pre'); browser('press', 'ArrowRight');
  assert.ok(evaluate('document.activeElement.tagName === "PRE"'));
  assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'), false);
});

test('long source paths and state descriptions wrap without page overflow', () => {
  for (const path of ['/tokens', '/guides/contribution']) {
    open(path);
    assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'), false, path);
    assert.ok(evaluate('document.querySelector("main").textContent.includes("packages/ui/src/")'), path);
  }
});

test('named layout and context containers expose valid group or region semantics', () => {
  open('/foundations/layout');
  const layoutSelector = '[aria-label="Scrollable responsive layout example"]';
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(layoutSelector)}).getAttribute("role")`), 'region');
  open('/components/context-menu');
  assert.equal(evaluate('document.querySelector("[data-context-target]").getAttribute("role")'), 'group');
  browser('focus', '[data-context-target]');
  assert.equal(evaluate('document.activeElement.hasAttribute("data-context-target")'), true);
});

test('named foundation tables fit naturally and keyboard-scroll actual overflow', () => {
  let overflowing=0;
  for (const [path, name] of [['/foundations/colors','Live color role pairs table'],['/foundations/layout','Responsive layout specifications table'],['/foundations/shape','Radius specifications table'],['/foundations/interaction-states','State specifications table']]) {
    open(path); const selector = `.doc-table[aria-label=${JSON.stringify(name)}]`;
    assert.equal(evaluate(`document.querySelector(${JSON.stringify(selector)}).tabIndex`), 0);
    browser('focus', selector);
    const extent=evaluate(`(()=>{const region=document.querySelector(${JSON.stringify(selector)});return region.scrollWidth-region.clientWidth;})()`);
    if(extent>1) {
      overflowing++;browser('press','ArrowRight');
      browser('wait','--fn',`document.querySelector(${JSON.stringify(selector)}).scrollLeft>0`);
    } else {
      assert.ok(evaluate(`(()=>{const region=document.querySelector(${JSON.stringify(selector)});return region.querySelector('table').getBoundingClientRect().width<=region.getBoundingClientRect().width+1&&region.scrollLeft===0;})()`));
    }
    assert.equal(evaluate('document.activeElement.getAttribute("role")'), 'region');
    assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'), false);
  }
  assert.ok(overflowing>0,'At least one real table exercises keyboard scrolling');
});

test('Alert defaults to a paragraph lead and explicit heading level changes semantic structure', () => {
  open('/components/alert'); browser('wait', '#alert-title-structure');
  assert.ok(evaluate('[...document.querySelectorAll("[data-alert-lab] .mt-alert-title")].every(node=>node.tagName==="P")'));
  browser('select', '#alert-title-structure', '3');
  browser('wait', '--fn', '[...document.querySelectorAll("[data-alert-lab] .mt-alert-title")].every(node=>node.tagName==="H3")');
  browser('select', '#alert-title-structure', 'paragraph');
  browser('wait', '--fn', '[...document.querySelectorAll("[data-alert-lab] .mt-alert-title")].every(node=>node.tagName==="P")');
  browser('find', 'role', 'button', 'click', '--name', 'Show recoverable alert');
  browser('find', 'role', 'button', 'click', '--name', 'Resume local task');
  browser('wait', '--fn', 'document.querySelector("[data-alert-lab]").textContent.includes("Local task resumed")');
});

test('native destination navigation omits unsupported orientation ARIA and still opens by keyboard', () => {
  open('/components/navigation-menu');
  assert.ok(evaluate('[...document.querySelectorAll(".mt-navigation-menu,.mt-navigation-menu-list")].every(node=>!node.hasAttribute("aria-orientation"))'));
  assert.equal(evaluate('document.querySelector(".mt-navigation-menu").getAttribute("data-orientation")'), 'horizontal');
  browser('focus', '[data-destination-trigger]'); browser('press', 'Enter');
  browser('wait', '--fn', 'document.querySelector("[data-destination-trigger]").getAttribute("aria-expanded")==="true"');
  browser('press', 'Escape');
  browser('wait', '--fn', 'document.querySelector("[data-destination-trigger]").getAttribute("aria-expanded")==="false"');
});
