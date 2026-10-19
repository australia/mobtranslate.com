import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postcss from 'postcss';

const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
const session = `mobtranslate-component-specifications-${process.pid}`;
const browser = (...args) => {
  if (args[0] === 'wait' && args[1] === '--fn') new Function(`return (${args[2]});`);
  let output;
  try { output = execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 150_000, killSignal: 'SIGKILL', env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '20000' },
  }); } catch (error) { if (typeof error.stdout !== 'string' || !error.stdout.trim()) throw error; output = error.stdout; }
  const response = JSON.parse(output); assert.equal(response.success, true, response.error); return response.data;
};
const evaluate = script => browser('eval', script).result;
const measurement = () => evaluate('JSON.parse(document.querySelector("[data-component-measurement]").dataset.measurement)');
const visible = selector => evaluate(`(() => [...document.querySelectorAll(${JSON.stringify(selector.replace('::after', ''))})].some(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden'))()`);
const preset = name => { browser('select', '#component-preset', name); browser('wait', '--fn', `document.querySelector('[data-component-specifications]').dataset.currentSpecification.startsWith(${JSON.stringify(name + '.')})`); };
const field = value => browser('select', '#component-field', value);
const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
const current = () => evaluate('JSON.parse(document.querySelector("#component-field option:checked").dataset.specification)');
const settle = (row, available = true) => browser('wait', '--fn', `(() => { const value=JSON.parse(document.querySelector('[data-component-measurement]').dataset.measurement); return value.binding===${JSON.stringify(row.exportName + '.' + row.path)} && value.available===${available}; })()`);
const openers = {
  dialogTokens: row => click(`Open ${row.path.includes('.') ? row.path.split('.')[0] : 'md'} specimen`),
  selectTokens: () => { browser('focus', '[data-component-spec-stage] .mt-select-trigger'); browser('press', 'ArrowDown'); },
  tooltipTokens: () => browser('focus', '[data-component-spec-stage] button'),
  popoverTokens: () => click('Open size surface'),
  menuTokens: () => click('Open size menu'),
  toastTokens: () => click('Show specification notice'),
};
let fixture;
const ui = fileURLToPath(new URL('../../../packages/ui/', import.meta.url));
before(() => {
  const cache = fileURLToPath(new URL('../.cache/', import.meta.url)); mkdirSync(cache, { recursive: true });
  fixture = mkdtempSync(path.join(cache, 'component-contract-'));
  cpSync(path.join(ui, 'scripts'), path.join(fixture, 'scripts'), { recursive: true });
  cpSync(path.join(ui, 'src/tokens'), path.join(fixture, 'src/tokens'), { recursive: true });
  mkdirSync(path.join(fixture, 'src/components'), { recursive: true });
  cpSync(path.join(ui, 'src/components/components.css'), path.join(fixture, 'src/components/components.css'));
  symlinkSync(path.join(ui, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  browser('set', 'viewport', '1440', '1000'); browser('open', `${base}/guides/component-specifications`); browser('wait', '[data-component-specifications][data-inspector-ready=true]');
  evaluate("localStorage.setItem('mt-theme','light');window.dispatchEvent(new Event('storage'));"); browser('wait', 'html.light');
});
after(() => { try { browser('close'); } finally { if (fixture) rmSync(fixture, { recursive: true }); } });

test('server-rendered pickers stay disabled until their client handlers are ready', () => {
  const result = evaluate(`(async () => {
    const source = new DOMParser().parseFromString(await (await fetch(location.href)).text(), 'text/html');
    const tool = source.querySelector('[data-component-specifications]');
    return { serverReady: tool.dataset.inspectorReady, serverControlCount: tool.querySelectorAll(':scope > select,:scope > .space-y-2 input').length, serverDisabled: [...tool.querySelectorAll(':scope > select,:scope > .space-y-2 input')].every(control=>control.disabled), clientReady: document.querySelector('[data-component-specifications]').dataset.inspectorReady, clientEnabled: [...document.querySelectorAll('[data-component-specifications] > select')].every(control=>!control.disabled) };
  })()`);
  assert.equal(result.serverReady, 'false'); assert.equal(result.serverControlCount, 4); assert.equal(result.serverDisabled, true); assert.equal(result.clientReady, 'true'); assert.equal(result.clientEnabled, true);
});

test('generation rejects stale exports, missing bindings and asymmetric scalar padding', () => {
  const cssPath = path.join(fixture, 'src/components/components.css');
  const generatedPath = path.join(fixture, 'src/tokens/components.ts');
  const css = readFileSync(cssPath, 'utf8'), generated = readFileSync(generatedPath, 'utf8');
  const run = () => spawnSync(process.execPath, [path.join(fixture, 'scripts/generate-component-tokens.mjs'), '--check'], { encoding: 'utf8' });
  try {
    assert.equal(run().status, 0);
    writeFileSync(generatedPath, generated + '// stale fixture\n'); const stale = run(); assert.notEqual(stale.status, 0); assert.match(stale.stderr, /Component presets are stale/); writeFileSync(generatedPath, generated);
    const missing = postcss.parse(css); missing.walkRules('.mt-input-sm', rule => rule.walkDecls('padding-inline', declaration => declaration.remove())); writeFileSync(cssPath, missing.toString());
    const failure = run(); assert.notEqual(failure.status, 0); assert.match(failure.stderr, /Missing .mt-input-sm.*padding-inline/);
    const asymmetric = postcss.parse(css); asymmetric.walkRules('.mt-select-item', rule => rule.walkDecls('padding', declaration => { declaration.value = '8px 12px 8px 16px'; })); writeFileSync(cssPath, asymmetric.toString());
    const unequal = run(); assert.notEqual(unequal.status, 0); assert.match(unequal.stderr, /Asymmetric horizontal padding/);
    writeFileSync(cssPath, css + '\n@media(max-width: 400px){.mt-input-sm{padding-inline:777px}}\n.mt-input-sm[data-disabled]{padding-inline:999px}\n.mt-input-sm{&[data-disabled]{padding-inline:888px}}\n'); assert.equal(run().status, 0);
  } finally { writeFileSync(cssPath, css); writeFileSync(generatedPath, generated); }
});

test('all 19 presets and 90 fields resolve on their real component parts', () => {
  const names = evaluate('[...document.querySelectorAll("#component-preset option")].map(option=>option.value)'); assert.equal(names.length, 19);
  let checked = 0;
  for (const name of names) {
    preset(name);
    const paths = evaluate('[...document.querySelectorAll("#component-field option")].map(option=>option.value)');
    for (const value of paths) {
      // Modal focus containment is preserved: close before choosing another inspected field.
      if (name === 'dialogTokens' && visible('.mt-dialog-popup')) { browser('press', 'Escape'); browser('wait', '--fn', '!document.querySelector(".mt-dialog-popup")?.getClientRects().length'); }
      field(value); const row = current(); console.log(`Inspecting ${name}.${value}`);
      if (!visible(row.selector) && openers[name]) openers[name](row);
      settle(row);
      const result = evaluate(`(() => {
        const row = JSON.parse(document.querySelector('#component-field option:checked').dataset.specification);
        const pseudo = row.selector.endsWith('::after') ? '::after' : null;
        const selector = pseudo ? row.selector.slice(0,-pseudo.length) : row.selector;
        const stage = document.querySelector('[data-component-spec-stage]');
        const target = [...stage.querySelectorAll(selector),...document.querySelectorAll(selector)].find(node=>node.getClientRects().length && getComputedStyle(node).visibility!=='hidden');
        const actual = getComputedStyle(target,pseudo).getPropertyValue(row.computedProperty);
        const original = target.getAttribute('style');
        let probe;
        let expected;
        try {
          if(pseudo){probe=document.createElement('span');target.append(probe);probe.style.cssText='position:absolute;visibility:hidden';probe.style.setProperty(row.computedProperty,row.value);expected=getComputedStyle(probe).getPropertyValue(row.computedProperty);}
          else {target.style.setProperty(row.computedProperty,row.property==='background'?row.sourceValue:row.value);expected=getComputedStyle(target).getPropertyValue(row.computedProperty);}
        } finally {probe?.remove();if(original===null)target.removeAttribute('style');else target.setAttribute('style',original);}
        const parsed=JSON.parse(document.querySelector('[data-component-measurement]').dataset.measurement);
        return {actual:actual.trim(),expected:expected.trim(),inspected:parsed.computed};
      })()`);
      if (row.property === 'background') {
        const alpha = color => Number(color.match(/rgba\([^)]*,\s*([\d.]+)\)/)?.[1] ?? 1);
        assert.ok(Math.abs(alpha(result.actual) - alpha(result.expected)) <= 1 / 255 + 0.000001);
      } else assert.equal(result.actual, result.expected, `${name}.${value}`);
      assert.equal(result.inspected, result.actual, `${name}.${value} inspector`); checked++;
    }
  }
  assert.equal(checked, 90);
});

test('content-driven Select grows at narrow width and popup snapshots survive dismissal', () => {
  browser('set', 'viewport', '320', '812'); preset('selectTokens'); field('triggerHeight'); settle(current());
  const shortHeight = measurement().height;
  // Target the labelled tool control rather than any checkbox rendered by a specimen.
  browser('find', 'label', 'Use longer English labels', 'click');
  browser('wait', '--fn', 'document.querySelector("[data-component-spec-stage] .mt-select-trigger").getBoundingClientRect().height > 44');
  assert.ok(measurement().height > shortHeight); assert.equal(evaluate('document.querySelector("[data-component-authored]").textContent'), 'auto');
  field('contentMaxHeight'); browser('focus', '[data-component-spec-stage] .mt-select-trigger'); browser('press', 'ArrowDown'); settle(current());
  browser('press', 'Escape'); settle(current(), false);
  const capture = evaluate('JSON.parse(document.querySelector("[data-component-capture]").dataset.capture)');
  assert.equal(capture.measurement.binding, 'selectTokens.contentMaxHeight'); assert.equal(capture.viewport, 320); assert.ok(capture.measurement.height > 0);
  assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false);
});

test('scoped radius updates live dimensions while authored dependencies remain intact', () => {
  browser('set', 'viewport', '1440', '1000'); preset('inputTokens'); field('radius'); settle(current());
  browser('find', 'label', 'Override stage radius and inherited font size', 'click');
  browser('wait', '--fn', 'document.querySelector("[data-component-computed]").textContent === "20px"');
  assert.equal(evaluate('document.querySelector("[data-component-authored]").textContent'), 'var(--radius-md)');
  preset('buttonTokens'); field('icon.fontSize'); settle(current()); assert.equal(measurement().computed, '24px');
  click('Inspect icon button'); assert.ok(evaluate('document.querySelector("[data-component-spec-stage]").textContent.includes("Activated the icon")'));
});

test('modal keyboard dismissal retains an accessible capture and switching closes old portals', () => {
  preset('dialogTokens'); field('md.maxWidth'); click('Open md specimen'); settle(current());
  browser('wait', '--fn', `(() => {const node=document.querySelector('.mt-dialog-popup'); const bounds=node.getBoundingClientRect(); const value=JSON.parse(document.querySelector('[data-component-measurement]').dataset.measurement); return !node.getAnimations().some(animation=>animation.playState==='running') && Math.abs(value.width-bounds.width)<0.01 && Math.abs(value.height-bounds.height)<0.01;})()`);
  browser('press', 'Escape'); settle(current(), false);
  assert.equal(evaluate('document.activeElement.textContent'), 'Open md specimen');
  assert.ok(evaluate('document.querySelector("[data-component-capture]").textContent.includes("512px")'));
  preset('popoverTokens'); field('maxWidth'); click('Open size surface'); settle(current());
  preset('sliderTokens'); field('visibleThumbSize'); settle(current());
  assert.equal(visible('.mt-popover-popup'), false); assert.equal(measurement().computed, '20px'); assert.equal(measurement().width, 44);
});

test('the guide and inspector reflow in dark RTL at 320px', () => {
  browser('set', 'viewport', '320', '812'); evaluate("document.documentElement.dir='rtl';localStorage.setItem('mt-theme','dark');window.dispatchEvent(new Event('storage'));"); browser('wait', 'html.dark');
  for (const name of ['inputTokens', 'sliderTokens', 'tabsTokens', 'scrollAreaTokens']) {
    preset(name); settle(current()); assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false, name);
  }
  evaluate("document.documentElement.dir='ltr'");
});
