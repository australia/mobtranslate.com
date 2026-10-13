import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
const session = `mobtranslate-styleguide-tests-${process.pid}`;
const browser = (...args) => {
  const output = execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 150_000,
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '120000' },
  });
  const response = JSON.parse(output);
  assert.equal(response.success, true, response.error);
  return response.data;
};
const evaluate = (script) => browser('eval', script).result;
const clickButton = (label) => {
  evaluate(`Array.from(document.querySelectorAll('main button')).find(button => button.textContent.trim() === ${JSON.stringify(label)}).scrollIntoView({block: 'center'})`);
  browser('find', 'role', 'button', 'click', '--name', label);
};
const open = (path) => {
  browser('open', `${base}${path}`);
  browser('wait', 'main h1');
  browser('wait', '--fn', 'document.documentElement.classList.contains("light") || document.documentElement.classList.contains("dark")');
};

before(() => {
  browser('set', 'viewport', '1440', '1000');
  open('/foundations/layout');
});
after(() => browser('close'));

test('desktop outline links reach unique section headings', () => {
  const result = evaluate(`(() => {
    const ids = [...document.querySelectorAll('main h2[id]')].map(node => node.id);
    return { unique: new Set(ids).size === ids.length, count: ids.length,
      outline: [...document.querySelectorAll('.page-outline a')].every(link => document.getElementById(link.hash.slice(1))),
      overflow: document.documentElement.scrollWidth > innerWidth };
  })()`);
  assert.ok(result.unique);
  assert.ok(result.count > 0);
  assert.ok(result.outline);
  assert.equal(result.overflow, false);
});

test('topic navigation search finds categories and explains empty results', () => {
  browser('fill', 'nav input[type=search]', 'foundations');
  assert.ok(evaluate('[...document.querySelectorAll("nav a")].some(link => link.pathname.startsWith("/foundations/"))'));
  assert.ok(evaluate('[...document.querySelectorAll("nav a[href]")].filter(link => link.pathname !== "/").every(link => link.pathname.startsWith("/foundations/"))'));
  browser('fill', 'nav input[type=search]', 'no-such-document-xyz');
  assert.equal(evaluate('document.querySelector("nav [role=status]").textContent'), '0 topics found');
  assert.ok(evaluate('document.querySelector("nav").textContent.includes("Try a component name")'));
  browser('fill', 'nav input[type=search]', '');
});

test('mobile dialog contains focus and restores it on Escape', () => {
  browser('set', 'viewport', '375', '812');
  assert.equal(evaluate('getComputedStyle(document.querySelector(".mobile-nav-header")).position'), 'fixed');
  browser('click', '.mobile-nav-trigger');
  assert.equal(evaluate('document.querySelector("dialog").open'), true);
  assert.ok(evaluate('document.querySelector("dialog").contains(document.activeElement)'));
  browser('press', 'Shift+Tab');
  assert.ok(evaluate('document.querySelector("dialog").contains(document.activeElement)'));
  browser('press', 'Tab');
  browser('press', 'Escape');
  assert.equal(evaluate('document.querySelector("dialog").open'), false);
  assert.ok(evaluate('document.activeElement.matches(".mobile-nav-trigger")'));
  assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false);
});

test('mobile topic selection closes navigation and updates current page', () => {
  browser('click', '.mobile-nav-trigger');
  browser('scrollintoview', 'dialog a[href="/foundations/shape"]');
  browser('click', 'dialog a[href="/foundations/shape"]');
  browser('wait', '--fn', 'document.querySelector("main h1")?.textContent === "Shape"');
  assert.equal(evaluate('document.querySelector("main h1").textContent'), 'Shape');
  assert.equal(evaluate('document.querySelector("dialog").open'), false);
});

test('saved light theme overrides dark system preference and survives navigation', () => {
  browser('set', 'viewport', '1440', '1000');
  browser('set', 'media', 'dark');
  evaluate('localStorage.setItem("mt-theme", "light"); window.dispatchEvent(new Event("storage"));');
  browser('wait', 'html.light');
  assert.equal(evaluate('document.documentElement.classList.contains("dark")'), false);
  browser('click', 'nav button[aria-label="Switch to dark mode"]');
  assert.equal(evaluate('localStorage.getItem("mt-theme")'), 'dark');
  open('/foundations/layout');
  browser('wait', 'html.dark');
  assert.equal(evaluate('document.documentElement.classList.contains("dark")'), true);
  browser('click', 'nav button[aria-label="Switch to light mode"]');
  browser('set', 'media', 'light');
});

test('code copying reports clipboard rejection without losing the source', () => {
  const original = evaluate('document.querySelector("pre code").textContent');
  evaluate('Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });');
  browser('scrollintoview', 'button[aria-label="Copy css example"]');
  browser('click', 'button[aria-label="Copy css example"]');
  browser('wait', '--fn', 'document.querySelector(".copy-status").textContent.includes("Clipboard unavailable")');
  assert.match(evaluate('document.querySelector(".copy-status").textContent'), /Clipboard unavailable/);
  assert.equal(evaluate('document.querySelector("pre code").textContent'), original);
});

test('layout explorer changes structure and direction', () => {
  evaluate(`(() => { const input = document.querySelector('input[type=range]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '320');
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  assert.match(evaluate('document.querySelector("#layout-explorer").closest("section").textContent'), /Compact: one column/);
  browser('check', 'input[type=checkbox]');
  assert.equal(evaluate('document.querySelector("main [dir]").dir'), 'rtl');
});

test('state explorer supports validation, pending, success and cancellation', () => {
  open('/foundations/interaction-states');
  clickButton('Search example');
  browser('wait', '--fn', 'document.querySelector("main input:not([type=checkbox])").getAttribute("aria-invalid") === "true"');
  assert.equal(evaluate('document.querySelector("main input:not([type=checkbox])").getAttribute("aria-invalid")'), 'true');
  browser('fill', 'main input:not([type=checkbox])', 'river');
  clickButton('Search example');
  browser('wait', '--fn', 'document.querySelector("main input:not([type=checkbox])").disabled');
  assert.ok(evaluate('document.querySelector("main input:not([type=checkbox])").disabled'));
  clickButton('Simulate success');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("completed")');
  assert.match(evaluate('document.querySelector("main [role=status]").textContent'), /completed/);
  clickButton('Search example');
  clickButton('Cancel request');
  browser('wait', '--fn', '!document.querySelector("main input:not([type=checkbox])").disabled');
  assert.equal(evaluate('document.querySelector("main input:not([type=checkbox])").disabled'), false);
});

test('token explorer reports rendered values, filters and exports the selected theme', () => {
  open('/tokens');
  browser('wait', '--fn', 'Array.from(document.querySelectorAll("main tbody tr")).every(row => row.querySelectorAll("td")[2].textContent !== "Not available in this render")');
  browser('fill', 'main input[type=search]', '--color-primary');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("of")');
  const liveValue = 'Array.from(document.querySelectorAll("main tbody tr")).find(row => row.querySelector("th").textContent === "--color-primary").querySelectorAll("td")[2].textContent';
  assert.equal(evaluate(liveValue), '#b45e2a');
  browser('click', 'nav button[aria-label="Switch to dark mode"]');
  browser('wait', '--fn', `${liveValue} === "#e29455"`);
  assert.equal(evaluate(liveValue), '#e29455');
  browser('select', 'main label:nth-child(3) select', 'dark');
  evaluate('Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => { window.copiedTokenCSS = value; } } });');
  clickButton('Copy filtered CSS');
  browser('wait', '--fn', 'typeof window.copiedTokenCSS === "string"');
  assert.match(evaluate('window.copiedTokenCSS'), /--color-primary: #e29455;/);
  const exported = evaluate('JSON.parse(decodeURIComponent(document.querySelector("a[download]").href.split(",").slice(1).join(",")))');
  assert.ok(exported.tokens.length > 0);
  assert.ok(exported.tokens.every(token => token.name.includes('--color-primary')));
  browser('fill', 'main input[type=search]', 'no-such-token-xyz');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.startsWith("0 of")');
  assert.equal(evaluate('document.querySelectorAll("main tbody tr").length'), 0);
  browser('click', 'nav button[aria-label="Switch to light mode"]');
});

test('contrast checker distinguishes maximum, failing and invalid color pairs', () => {
  open('/foundations/colors');
  const inputs = ['main label:nth-child(1) input[spellcheck=false]', 'main label:nth-child(2) input[spellcheck=false]'];
  browser('fill', inputs[0], '#000000');
  browser('fill', inputs[1], '#ffffff');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("21.00:1")');
  assert.match(evaluate('document.querySelector("main [role=status]").textContent'), /AA normal text \(4.5:1\): Pass/);
  browser('fill', inputs[0], '#ffffff');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("1.00:1")');
  assert.match(evaluate('document.querySelector("main [role=status]").textContent'), /AA normal text \(4.5:1\): Fail/);
  browser('fill', inputs[0], 'invalid');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("two valid hex colors")');
  assert.equal(evaluate('document.querySelector("main input[spellcheck=false]").getAttribute("aria-invalid")'), 'true');
});

test('documented semantic text pairs meet AA in both rendered themes', () => {
  const measurements = 'Array.from(document.querySelector("#live-role-pairs").closest("section").querySelectorAll("tbody tr")).map(row => row.querySelectorAll("td")[1].textContent)';
  browser('wait', '--fn', `${measurements}.every(value => value.includes("AA normal text passes"))`);
  assert.ok(evaluate(`${measurements}.length > 0`));
  browser('click', 'nav button[aria-label="Switch to dark mode"]');
  browser('wait', '--fn', `${measurements}.every(value => value.includes("AA normal text passes"))`);
  assert.ok(evaluate(`${measurements}.every(value => value.includes("AA normal text passes"))`));
});

test('foundation labs use live CSS tokens and support changed values', () => {
  open('/foundations/typography');
  browser('select', 'main .grid label:first-child select', '--text-6xl');
  browser('fill', 'main input', 'A long source heading that must wrap rather than overflow the document');
  browser('wait', '--fn', 'getComputedStyle(document.querySelector("[data-typography-preview]")).fontSize === "60px"');
  assert.match(evaluate('document.querySelector("[data-typography-preview]").textContent'), /long source/);
  open('/foundations/spacing');
  browser('select', 'main select', '--spacing-12');
  browser('wait', '--fn', 'getComputedStyle(document.querySelector("[data-spacing-preview]")).gap === "48px"');
  open('/foundations/elevation');
  browser('select', 'main select', '--shadow-xl');
  const shadow = evaluate('getComputedStyle(document.querySelector("[data-elevation-preview]")).boxShadow');
  assert.notEqual(shadow, 'none');
  browser('click', 'nav button[aria-label="Switch to light mode"]');
  browser('wait', '--fn', `getComputedStyle(document.querySelector('[data-elevation-preview]')).boxShadow !== ${JSON.stringify(shadow)}`);
});

test('motion replay handles reduced motion and reset independently of animation', () => {
  open('/foundations/motion');
  evaluate('window.originalMatchMedia = window.matchMedia; window.matchMedia = query => query === "(prefers-reduced-motion: reduce)" ? { matches: true } : window.originalMatchMedia(query);');
  clickButton('Replay transition');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("Reduced motion")');
  assert.equal(evaluate('document.querySelector("[data-motion-preview]").style.transform'), 'translateX(160px)');
  clickButton('Reset transition');
  browser('wait', '--fn', 'document.querySelector("[data-motion-preview]").style.transform === "translateX(0px)"');
  evaluate('window.matchMedia = window.originalMatchMedia;');
  browser('select', 'main .grid label:first-child select', '--duration-slower');
  clickButton('Replay transition');
  clickButton('Reset transition');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent === "Example reset."');
  assert.equal(evaluate('document.querySelector("[data-motion-preview]").getAnimations().length'), 0);
});

test('internationalization distinguishes formatting, direction and invalid settings', () => {
  open('/foundations/internationalization');
  browser('fill', 'main .grid label:first-child input', 'de-DE');
  browser('wait', '--fn', 'document.querySelector("[data-internationalization-preview]").textContent.includes("12.345,67")');
  browser('check', 'main input[type=checkbox]');
  assert.equal(evaluate('document.querySelector("[data-internationalization-preview]").dir'), 'rtl');
  browser('fill', 'main label:nth-child(2) input', 'not/a/timezone');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("Formatting is paused")');
  assert.equal(evaluate('document.querySelector("[data-internationalization-preview]")'), null);
  browser('fill', 'main label:nth-child(2) input', 'UTC');
  browser('wait', '[data-internationalization-preview]');
});

test('reordering alternatives preserve item focus and announce boundaries', () => {
  open('/foundations/input-gestures');
  browser('scrollintoview', 'button[aria-label="Move Entry text down"]');
  browser('click', 'button[aria-label="Move Entry text down"]');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("position 2")');
  assert.equal(evaluate('document.activeElement.closest("li").getAttribute("data-item-id")'), 'entry');
  browser('press', 'Enter');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("position 1")');
  assert.equal(evaluate('document.activeElement.disabled'), false);
  assert.equal(evaluate('document.activeElement.getAttribute("aria-label")'), 'Move Entry text down');
});

test('icon actions expose toggle state while direction changes only navigation', () => {
  open('/foundations/iconography');
  browser('scrollintoview', 'button[aria-label="Save entry"]');
  browser('click', 'button[aria-label="Save entry"]');
  browser('wait', '--fn', `document.querySelector('button[aria-label="Save entry"]').getAttribute('aria-pressed') === 'true'`);
  browser('press', 'Space');
  browser('wait', '--fn', `document.querySelector('button[aria-label="Save entry"]').getAttribute('aria-pressed') === 'false'`);
  browser('check', 'main input[type=checkbox]');
  assert.equal(evaluate('document.querySelector("[data-icon-preview]").dir'), 'rtl');
  assert.equal(evaluate(`document.querySelector('button[aria-label="Save entry"] path').hasAttribute('transform')`), false);
});

test('expanded foundations have section anchors and reflow at narrow width', () => {
  browser('set', 'viewport', '375', '812');
  for (const topic of ['typography', 'spacing', 'elevation', 'motion', 'iconography', 'writing', 'internationalization', 'input-gestures']) {
    open(`/foundations/${topic}`);
    assert.ok(evaluate('document.querySelectorAll("main h2[id]").length >= 7'), topic);
    assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false, topic);
  }
});

test('writing lab previews edits and reports its local action honestly', () => {
  open('/foundations/writing');
  browser('fill', 'main label:nth-child(1) input', 'Connection interrupted');
  browser('fill', 'main textarea', 'Your entry text is still here.');
  browser('fill', 'main label:nth-child(3) input', 'Retry search');
  clickButton('Retry search');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("No request was sent")');
  assert.match(evaluate('document.querySelector("[data-writing-preview]").textContent'), /Connection interrupted/);
  browser('click', 'main label:nth-child(3) input');
  browser('press', 'Control+A');
  browser('press', 'Backspace');
  browser('wait', '--fn', 'document.querySelector("[data-writing-preview] button").disabled');
});
