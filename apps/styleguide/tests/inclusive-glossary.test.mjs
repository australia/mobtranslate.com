import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
const session = `mobtranslate-inclusive-glossary-${process.pid}`;
const browser = (...args) => {
  if (args[0] === 'wait' && args[1] === '--fn') new Function(`return (${args[2]});`);
  let output;
  try { output = execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 150_000, killSignal: 'SIGKILL', env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '120000' } }); }
  catch (error) { if (typeof error.stdout !== 'string' || !error.stdout.trim()) throw error; output = error.stdout; }
  const response = JSON.parse(output); assert.equal(response.success, true, response.error); return response.data;
};
const evaluate = code => browser('eval', code).result;
const open = path => { browser('open', `${base}${path}`); browser('wait', 'main h1'); };
const glossary = (hash = '') => { open(`/guides/glossary${hash}`); browser('wait', '[data-glossary-ready=true]'); };
const count = value => browser('wait', '--fn', `document.querySelector('[data-glossary-count]').textContent===${JSON.stringify(value + ' of 93 entries shown.')}`);
const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
before(() => { browser('set', 'viewport', '1440', '1000'); glossary(); });
after(() => browser('close'));

test('the server and client expose 93 authored entries with unique shareable fragments', () => {
  const result = evaluate(`(async()=>{
    const source=new DOMParser().parseFromString(await (await fetch(location.href)).text(),'text/html');
    const entries=[...source.querySelectorAll('[data-glossary-entries] section')];
    const ids=entries.map(section=>section.querySelector('h3').id);
    return {count:entries.length,unique:new Set(ids).size,required:entries.every(section=>section.textContent.includes('Use here:')&&section.textContent.includes('Watch for:')&&section.querySelector('a[href^="/"]')),disabled:source.querySelector('#glossary-query').disabled,enabled:!document.querySelector('#glossary-query').disabled};
  })()`);
  assert.deepEqual(result, { count: 93, unique: 93, required: true, disabled: true, enabled: true });
  count(93);
});

test('authored text and category filters compose and empty results recover with focus', () => {
  browser('fill', '#glossary-query', 'wallpaper'); count(1);
  assert.equal(evaluate('document.querySelector("[data-glossary-entries] h3").textContent'), 'Color: Dynamic color');
  browser('select', '#glossary-category', 'Platform'); count(0);
  assert.ok(evaluate('document.querySelector("main").textContent.includes("No entries match these filters")'));
  click('Clear glossary filters'); count(93); assert.equal(evaluate('document.activeElement.id'), 'glossary-query');
  browser('select', '#glossary-category', 'Platform');
  assert.ok(evaluate('[...document.querySelectorAll("[data-glossary-entries] section")].every(section=>section.textContent.includes("Platform ·"))'));
  click('Clear glossary filters'); count(93);
});

test('entry copy reports success, serializes pending writes and retains a manual failure path', () => {
  evaluate("window.copyWrites=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:value=>{window.copyWrites.push(value);return new Promise(resolve=>window.finishCopy=resolve);}}});");
  click('Copy link for HCT');
  browser('wait', '--fn', 'document.querySelector("[data-glossary-copy]").textContent.includes("Copying the entry link for HCT")');
  assert.ok(evaluate('document.activeElement.textContent === "Copy link for HCT"'));
  browser('focus', '[data-glossary-entries] section:has(h3#term-portal) button'); browser('press', 'Enter'); assert.equal(evaluate('window.copyWrites.length'), 1);
  evaluate('window.finishCopy()'); browser('wait', '--fn', 'document.querySelector("[data-glossary-copy]").textContent === "Copied the entry link for HCT."');
  assert.equal(evaluate('window.copyWrites[0]'), `${base}/guides/glossary#term-hct`);
  evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied')}}});");
  click('Copy link for Portal'); browser('wait', '--fn', 'document.querySelector("[data-glossary-copy]").textContent.includes("Clipboard unavailable")');
  assert.equal(evaluate('document.querySelector("#term-portal a").hash'), '#term-portal');
});

test('hash arrival reveals a filtered-out entry, focuses it and clears unrelated filters', () => {
  browser('fill', '#glossary-query', 'wallpaper'); count(1);
  evaluate("location.hash='term-controlled-state'");
  browser('wait', '--fn', 'document.activeElement.id === "term-controlled-state"'); count(93);
  assert.equal(evaluate('document.querySelector("#glossary-query").value'), '');
  glossary('#term-aria-role'); browser('wait', '--fn', 'document.activeElement.id === "term-aria-role"');
});

test('entry links clear the mobile header and long copy labels reflow in dark RTL', () => {
  browser('set', 'viewport', '320', '812');
  evaluate("document.documentElement.dir='rtl';localStorage.setItem('mt-theme','dark');window.dispatchEvent(new Event('storage'));location.hash='term-design-system-package-dsp'"); browser('wait', 'html.dark');
  browser('wait', '--fn', 'document.activeElement.id === "term-design-system-package-dsp"');
  const bounds = evaluate('({heading:document.activeElement.getBoundingClientRect().top,header:document.querySelector(".mobile-nav-header").getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth,dir:getComputedStyle(document.activeElement.closest("section")).direction})');
  assert.ok(bounds.heading >= bounds.header); assert.equal(bounds.overflow, false); assert.equal(bounds.dir, 'ltr');
  assert.ok(evaluate('[...document.querySelectorAll("[data-glossary-entries] button")].every(button=>button.getBoundingClientRect().width<=innerWidth)'));
  evaluate("document.documentElement.dir='ltr'");
});

test('participation guidance has an unexecuted plan and complete decision/verification sections', () => {
  open('/foundations/inclusive-participation');
  const result = evaluate('({headings:document.querySelectorAll("main h2").length,templates:[...document.querySelectorAll("main pre code")].map(node=>node.textContent),overflow:document.documentElement.scrollWidth>innerWidth})');
  assert.ok(result.headings >= 10); assert.equal(result.overflow, false);
  const plan = JSON.parse(result.templates[0]); assert.equal(plan.status, 'unexecuted plan template'); assert.equal(plan.permissions.languagePublication, 'not established');
  assert.equal(evaluate('document.querySelectorAll("main .doc-table tbody tr").length'), 22);
});

test('known English inspector observations remain LTR inside an RTL shell', () => {
  open('/guides/component-specifications'); browser('wait', '[data-inspector-ready=true]'); evaluate("document.documentElement.dir='rtl'");
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-component-capture]")).direction'), 'ltr');
  assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'), false); evaluate("document.documentElement.dir='ltr'");
});
