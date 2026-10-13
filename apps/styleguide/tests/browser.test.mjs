import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
const session = `mobtranslate-styleguide-tests-${process.pid}`;
const browser = (...args) => {
  // Catch malformed wait expressions before the driver starts polling them.
  if (args[0] === 'wait' && args[1] === '--fn') new Function(`return (${args[2]});`);
  let output;
  try { output = execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 150_000, killSignal: 'SIGKILL',
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '120000' },
  }); } catch (error) {
    if (typeof error.stdout !== 'string' || !error.stdout.trim()) throw error;
    output = error.stdout;
  }
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

test('checked installation example validates, retains text and identifies its local result', () => {
  open('/guides/getting-started');
  clickButton('Try local form');
  browser('wait', '--fn', 'document.querySelector("main input").getAttribute("aria-invalid") === "true"');
  assert.ok(evaluate('document.activeElement === document.querySelector("main input")'));
  assert.ok(evaluate('document.querySelector("main input").getAttribute("aria-describedby").split(" ").every(id => document.getElementById(id))'));
  browser('fill', 'main input', 'example text');
  browser('press', 'Enter');
  browser('wait', '--fn', 'document.querySelector("main form [role=status]").textContent.includes("No search or publication was sent")');
  assert.equal(evaluate('document.querySelector("main input").value'), 'example text');
  assert.ok(evaluate('Array.from(document.querySelectorAll("main pre code")).some(code => code.textContent.includes("export function EntryFormExample"))'));
});

test('checked composition has one operable trigger and controlled disclosure state', () => {
  open('/guides/composition');
  clickButton('Example source details');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("expanded")');
  const selector = 'main button[aria-expanded]';
  assert.equal(evaluate('document.querySelectorAll("main button button").length'), 0);
  assert.equal(evaluate(`document.querySelector('${selector}').getAttribute('aria-expanded')`), 'true');
  browser('press', 'Space');
  browser('wait', '--fn', 'document.querySelector("main [role=status]").textContent.includes("collapsed")');
  assert.equal(evaluate(`document.querySelector('${selector}').getAttribute('aria-expanded')`), 'false');
});

test('checked local theme changes only its descendant roles and radius', () => {
  open('/guides/theming');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-local-theme] button")).backgroundColor'), 'rgb(56, 107, 79)');
  const globalRadius = evaluate('getComputedStyle(document.documentElement).getPropertyValue("--radius-md")');
  browser('uncheck', 'main input[type=checkbox]');
  browser('wait', '--fn', 'getComputedStyle(document.querySelector("[data-local-theme] button")).borderRadius === "0px"');
  assert.equal(evaluate('getComputedStyle(document.documentElement).getPropertyValue("--radius-md")'), globalRadius);
  clickButton('Try themed action');
  browser('wait', '--fn', 'document.querySelector("[data-local-theme]").parentElement.querySelector("[role=status]").textContent.includes("No entry was changed")');
});

test('shared theme controller respects system mode and tolerates failed storage writes', () => {
  browser('set', 'viewport', '1440', '1000');
  browser('set', 'media', 'dark');
  evaluate('localStorage.removeItem("mt-theme"); window.dispatchEvent(new Event("storage"));');
  browser('wait', 'html.dark');
  browser('set', 'media', 'light');
  browser('wait', 'html.light');
  evaluate('window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error("denied"); };');
  browser('click', 'nav button[aria-label="Switch to dark mode"]');
  browser('wait', 'html.dark');
  assert.equal(evaluate('document.documentElement.classList.contains("light")'), false);
  evaluate('Storage.prototype.setItem = window.originalSetItem;');
  browser('click', 'nav button[aria-label="Switch to light mode"]');
});

test('developer guides provide linked sections and reflow on narrow screens', () => {
  browser('set', 'viewport', '375', '812');
  for (const topic of ['getting-started', 'theming', 'composition', 'contribution', 'migration']) {
    open(`/guides/${topic}`);
    assert.ok(evaluate('document.querySelectorAll("main h2[id]").length >= 7'), topic);
    assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false, topic);
  }
});

test('action lifecycle blocks duplicate activation and restores focus after completion', () => {
  browser('set', 'viewport', '1440', '1000');
  open('/components/button');
  clickButton('Run example action');
  browser('wait', '--fn', 'document.querySelector("[data-action-button]").disabled');
  assert.equal(evaluate('document.querySelector("[data-action-button]").getAttribute("aria-busy")'), 'true');
  assert.equal(evaluate('document.querySelector("[data-action-button] svg").getAttribute("aria-hidden")'), 'true');
  clickButton('Complete example action');
  browser('wait', '--fn', 'document.querySelector("[data-button-lab] [role=status]").textContent.includes("completed locally")');
  assert.ok(evaluate('document.activeElement === document.querySelector("[data-action-button]")'));
  clickButton('Run example action');
  clickButton('Cancel example action');
  browser('wait', '--fn', 'document.querySelector("[data-button-lab] [role=status]").textContent.includes("cancelled")');
});

test('Button preserves native omitted-type submission and explicit non-submit behavior', () => {
  clickButton('Default native submit');
  browser('wait', '--fn', 'document.querySelector("[data-native-types] [role=status]").textContent.startsWith("1 local form submissions")');
  assert.equal(evaluate('document.querySelector("[data-native-types] button").getAttribute("type")'), null);
  clickButton('Explicit non-submit');
  browser('wait', '--fn', 'document.querySelector("[data-native-types] [role=status]").textContent.includes("1 non-submit actions")');
  assert.match(evaluate('document.querySelector("[data-native-types] [role=status]").textContent'), /^1 local form submissions/);
});

test('asChild forwards props, handlers, styles and both refs, and blocks disabled activation', () => {
  browser('scrollintoview', '[data-button-composition] a');
  browser('click', '[data-button-composition] a');
  browser('wait', '--fn', 'document.querySelector("[data-button-composition] [role=status]").textContent.includes("child, wrapper")');
  assert.match(evaluate('document.querySelector("[data-button-composition] [role=status]").textContent'), /Both refs target the link: true/);
  assert.equal(evaluate('document.querySelector("[data-button-composition] a").getAttribute("role")'), null);
  assert.ok(evaluate('document.getElementById(document.querySelector("[data-button-composition] a").getAttribute("aria-describedby")) !== null'));
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-button-composition] a")).textDecorationLine'), 'underline');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-button-composition] a")).letterSpacing'), '0.32px');
  browser('check', '[data-button-composition] input');
  browser('wait', '--fn', 'document.querySelector("[data-button-composition] a").getAttribute("aria-disabled") === "true"');
  const status = evaluate('document.querySelector("[data-button-composition] [role=status]").textContent');
  evaluate('document.querySelector("[data-button-composition] a").click(); document.querySelector("[data-button-composition] a").focus();');
  browser('press', 'Enter');
  assert.equal(evaluate('document.querySelector("[data-button-composition] [role=status]").textContent'), status);
});

test('IconButton is a named 44px toggle with keyboard and pointer activation', () => {
  open('/components/icon-button');
  browser('scrollintoview', '[data-icon-action] button');
  browser('click', '[data-icon-action] button');
  browser('wait', '--fn', 'document.querySelector("[data-icon-action] button").getAttribute("aria-pressed") === "true"');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-icon-action] button")).width'), '44px');
  assert.equal(evaluate('document.querySelector("[data-icon-action] button").getAttribute("aria-label")'), 'Save example entry');
  browser('press', 'Space');
  browser('wait', '--fn', 'document.querySelector("[data-icon-action] button").getAttribute("aria-pressed") === "false"');
});

test('FloatingActionButton sizes, extended label and local creation operate', () => {
  open('/components/floating-action-button');
  clickButton('Add example draft');
  browser('wait', '--fn', 'document.querySelector("[data-fab-lab] [role=status]").textContent.startsWith("1 example draft")');
  browser('uncheck', '[data-fab-lab] input');
  for (const [size, pixels] of [['sm', 44], ['md', 56], ['lg', 72]]) {
    browser('select', '[data-fab-lab] select', size);
    browser('wait', '--fn', `getComputedStyle(document.querySelector('[data-fab-lab] button')).width === '${pixels}px'`);
    assert.equal(evaluate('document.querySelector("[data-fab-lab] button").getAttribute("aria-label")'), 'Add example draft');
  }
  browser('scrollintoview', '[data-fab-lab] button');
  browser('click', '[data-fab-lab] button');
  browser('press', 'Enter');
  browser('wait', '--fn', 'document.querySelector("[data-fab-lab] [role=status]").textContent.startsWith("3 example drafts")');
  browser('set', 'viewport', '375', '812');
  browser('check', '[data-fab-lab] input');
  assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false);
});

test('all Button text variants retain AA contrast at rest and hover in both themes', () => {
  browser('set', 'viewport', '1440', '1000');
  open('/components/button');
  const measure = `(() => {
    const button = document.querySelector('[data-action-button]');
    const rgb = value => value.match(/[\\d.]+/g).map(Number);
    const foreground = rgb(getComputedStyle(button).color);
    let node = button, background;
    while (node) { const color = rgb(getComputedStyle(node).backgroundColor); if (color.length === 3 || color[3] === 1) { background = color; break; } node = node.parentElement; }
    if (!background) throw new Error('No opaque surface found');
    const light = channels => channels.slice(0, 3).map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const a = light(foreground), b = light(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  })()`;
  for (const theme of ['light', 'dark']) {
    evaluate(`localStorage.setItem('mt-theme', '${theme}'); window.dispatchEvent(new Event('storage'));`);
    browser('wait', `html.${theme}`);
    for (const variant of ['primary', 'secondary', 'destructive', 'ghost', 'outline', 'error', 'success', 'warning', 'link']) {
      browser('select', '[data-button-lab] label:first-child select', variant);
      browser('hover', 'main h1');
      browser('wait', '300');
      assert.ok(evaluate(measure) >= 4.5, `${theme} ${variant} rest`);
      browser('scrollintoview', '[data-action-button]');
      browser('hover', '[data-action-button]');
      browser('wait', '300');
      assert.ok(evaluate(measure) >= 4.5, `${theme} ${variant} hover`);
    }
  }
  evaluate('localStorage.setItem("mt-theme", "light"); window.dispatchEvent(new Event("storage"));');
  browser('set', 'viewport', '375', '812');
  for (const path of ['/components/button', '/components/icon-button', '/components/floating-action-button']) {
    open(path);
    assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false, path);
  }
});

test('accessible request focuses connected errors and retains values through failure, retry and cancellation', () => {
  browser('set', 'viewport', '1440', '1000');
  open('/guides/accessibility');
  clickButton('Try accessible request');
  browser('wait', '--fn', 'document.querySelector("[data-accessibility-lab] [tabindex]") === document.activeElement');
  assert.equal(evaluate('document.querySelectorAll("[data-accessibility-lab] input[aria-invalid=true], [data-accessibility-lab] textarea[aria-invalid=true]").length'), 2);
  assert.equal(evaluate('document.querySelectorAll("[data-accessibility-lab] [tabindex] a").length'), 2);
  browser('click', '[data-accessibility-lab] [tabindex="-1"] a:first-child');
  assert.equal(evaluate('document.activeElement === document.querySelector("[data-accessibility-lab] input")'), true);
  assert.ok(evaluate(`document.activeElement.getAttribute('aria-describedby').split(' ').every(id => document.getElementById(id))`));
  browser('fill', '[data-accessibility-lab] input', 'Example title');
  browser('fill', '[data-accessibility-lab] textarea', 'Keep this note through recovery.');
  clickButton('Try accessible request');
  browser('wait', '--fn', 'document.querySelector("[data-accessibility-lab] input").readOnly');
  assert.equal(evaluate('document.querySelector("[data-accessibility-lab] button[type=submit]").disabled'), false);
  assert.equal(evaluate('document.querySelector("[data-accessibility-lab] button[type=submit]").getAttribute("aria-disabled")'), 'true');
  browser('press', 'Enter');
  clickButton('Simulate failure');
  browser('wait', '--fn', 'document.querySelector("[data-accessibility-lab] [role=status]").textContent.includes("connection failure")');
  assert.equal(evaluate('document.activeElement === document.querySelector("[data-accessibility-lab] button[type=submit]")'), true);
  assert.equal(evaluate('document.querySelector("[data-accessibility-lab] input").value'), 'Example title');
  assert.equal(evaluate('document.querySelector("[data-accessibility-lab] textarea").value'), 'Keep this note through recovery.');
  clickButton('Try accessible request');
  clickButton('Cancel local request');
  browser('wait', '--fn', 'document.querySelector("[data-accessibility-lab] [role=status]").textContent.includes("cancelled")');
  assert.equal(evaluate('document.activeElement === document.querySelector("[data-accessibility-lab] button[type=submit]")'), true);
  clickButton('Try accessible request');
  clickButton('Simulate completion');
  browser('wait', '--fn', 'document.querySelector("[data-accessibility-lab] [role=status]").textContent.includes("nothing was sent")');
  assert.equal(evaluate('document.querySelector("[data-accessibility-lab] input").value'), 'Example title');
  assert.equal(evaluate('document.querySelector("[data-accessibility-lab] [role=status]").getAttribute("aria-atomic")'), 'true');
});

test('principles and accessibility guidance reflow with user text spacing at 320 CSS px', () => {
  browser('set', 'viewport', '320', '812');
  for (const path of ['/guides/accessibility', '/guides/design-principles']) {
    open(path);
    evaluate(`(() => { const style = document.createElement('style'); style.textContent = 'main * {line-height:1.5 !important; letter-spacing:.12em !important; word-spacing:.16em !important;} main p {margin-bottom:2em !important;}'; document.head.append(style); })()`);
    assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false, path);
    assert.ok(evaluate('document.querySelectorAll("main h2[id]").length >= 8'));
    assert.ok(evaluate('Array.from(document.querySelectorAll("main .doc-table")).every(table => getComputedStyle(table).overflowX === "auto")'));
  }
  browser('set', 'viewport', '1440', '1000');
});

test('content search finds prose and checked source and links to a focused matching heading', () => {
  open('/search?q=capture');
  browser('wait', '--fn', 'document.querySelector("[data-search-status]").textContent.includes("indexed pages")');
  assert.ok(evaluate('Boolean(document.querySelector(\'.search-results a[href="/components/button#composition-and-refs"]\'))'));
  browser('fill', '#guidance-query', 'onClickCapture');
  clickButton('Search documentation');
  assert.ok(evaluate('Boolean(document.querySelector(\'.search-results a[href="/components/button#composition-and-refs"]\'))'));
  assert.ok(evaluate('document.querySelector(\'.search-results a[href="/components/button#composition-and-refs"]\').closest("li").textContent.includes("onClickCapture")'));
  browser('scrollintoview', '.search-results a[href="/components/button#composition-and-refs"]');
  browser('click', '.search-results a[href="/components/button#composition-and-refs"]');
  browser('wait', '--fn', 'document.activeElement.id === "composition-and-refs"');
  assert.equal(evaluate('location.hash'), '#composition-and-refs');
  assert.equal(evaluate('document.querySelector("main h1").textContent'), 'Button');
});

test('content search applies all terms, explains empty queries and paginates without duplicate destinations', () => {
  open('/search?q=time%20zones');
  browser('wait', '--fn', 'document.querySelector("[data-search-status]").textContent.includes("indexed pages")');
  assert.ok(evaluate('[...document.querySelectorAll(".search-results a")].some(link => link.pathname === "/foundations/internationalization")'));
  browser('fill', '#guidance-query', 'lexical-no-match-xyz');
  clickButton('Search documentation');
  assert.match(evaluate('document.querySelector("[data-search-status]").textContent'), /^0 matching sections/);
  assert.equal(evaluate('document.querySelectorAll(".search-results li").length'), 0);
  assert.equal(evaluate('new URLSearchParams(location.search).get("q")'), 'lexical-no-match-xyz');
  browser('fill', '#guidance-query', '   ');
  clickButton('Search documentation');
  assert.equal(evaluate('location.search'), '');
  assert.match(evaluate('document.querySelector("[data-search-status]").textContent'), /Enter words/);
  browser('fill', '#guidance-query', 'Button');
  clickButton('Search documentation');
  assert.equal(evaluate('document.querySelectorAll(".search-results li").length'), 20);
  clickButton('Show more results');
  const links = evaluate('[...document.querySelectorAll(".search-results a")].map(link => link.href)');
  assert.ok(links.length > 20);
  assert.equal(new Set(links).size, links.length);
  const total = Number(evaluate('document.querySelector("[data-search-status]").textContent').match(/^(\d+)/)[1]);
  while (evaluate('document.querySelectorAll(".search-results li").length') < total) clickButton('Show more results');
  assert.equal(evaluate('document.activeElement.textContent'), 'Return to first result');
  browser('press', 'Enter');
  assert.equal(evaluate('document.activeElement === document.querySelector(".search-results a")'), true);
});

test('content indexing failure removes incomplete results and supports an honest full retry', () => {
  evaluate('window.originalSearchFetch = window.fetch; window.fetch = (...args) => args[0] === "/foundations/colors" ? Promise.resolve(new Response("unavailable", {status:503})) : window.originalSearchFetch(...args);');
  clickButton('Reload guidance');
  browser('wait', '--fn', 'document.querySelector("[data-search-status]").textContent.includes("could not be fully loaded")');
  assert.equal(evaluate('document.querySelectorAll(".search-results li").length'), 0);
  assert.equal(evaluate('document.querySelector("#guidance-query").value'), 'Button');
  assert.ok(evaluate('document.querySelector("main").textContent.includes("HTTP 503")'));
  evaluate('window.fetch = window.originalSearchFetch;');
  clickButton('Retry loading guidance');
  browser('wait', '--fn', 'document.querySelector("[data-search-status]").textContent.includes("indexed pages")');
  assert.ok(evaluate('document.querySelectorAll(".search-results li").length > 0'));
});

test('mobile search supports keyboard submission and focused section navigation below the header', () => {
  browser('set', 'viewport', '375', '812');
  open('/foundations/layout');
  browser('click', '.mobile-nav-trigger');
  browser('fill', 'dialog nav input[type=search]', 'capture');
  browser('click', 'dialog a[href^="/search?q="]');
  browser('wait', '--fn', 'document.querySelector("main h1").textContent === "Search guidance"');
  assert.equal(evaluate('document.querySelector("dialog").open'), false);
  browser('wait', '#guidance-query');
  browser('fill', '#guidance-query', 'capture');
  browser('press', 'Enter');
  browser('wait', '--fn', 'document.querySelector("[data-search-status]").textContent.includes("indexed pages")');
  assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  browser('scrollintoview', '.search-results a[href="/components/button#composition-and-refs"]');
  evaluate('document.querySelector(\'.search-results a[href="/components/button#composition-and-refs"]\').focus()');
  browser('press', 'Enter');
  browser('wait', '--fn', 'document.activeElement.id === "composition-and-refs"');
  assert.ok(evaluate('document.activeElement.getBoundingClientRect().top >= document.querySelector(".mobile-nav-header").getBoundingClientRect().bottom'));
  browser('set', 'viewport', '1440', '1000');
});

test('cancelling content indexing aborts its outstanding request and preserves a retryable query', () => {
  browser('set', 'viewport', '1440', '1000');
  open('/search?q=Button');
  browser('wait', '--fn', 'document.querySelector("[data-search-status]").textContent.includes("indexed pages")');
  evaluate(`window.originalSearchFetch = window.fetch; window.searchHeld = false; window.searchAborts = 0;
    window.fetch = (...args) => args[0] === '/foundations/colors' ? new Promise((resolve, reject) => {
      window.searchHeld = true;
      args[1].signal.addEventListener('abort', () => {window.searchAborts++; reject(new DOMException('Aborted', 'AbortError'));}, {once:true});
    }) : window.originalSearchFetch(...args);`);
  clickButton('Reload guidance');
  browser('wait', '--fn', 'window.searchHeld === true');
  clickButton('Cancel loading guidance');
  browser('wait', '--fn', 'document.querySelector("[data-search-status]").textContent.includes("loading cancelled")');
  assert.equal(evaluate('window.searchAborts'), 1);
  assert.equal(evaluate('document.activeElement.id'), 'guidance-query');
  assert.equal(evaluate('document.querySelector("#guidance-query").value'), 'Button');
  assert.equal(evaluate('document.querySelectorAll(".search-results li").length'), 0);
  evaluate('window.fetch = window.originalSearchFetch;');
  clickButton('Search documentation');
  browser('wait', '--fn', 'document.querySelector("[data-search-status]").textContent.includes("indexed pages")');
  assert.ok(evaluate('document.querySelectorAll(".search-results li").length > 0'));
});

test('topic-filter links update the query when already on the search page', () => {
  browser('fill', 'nav input[type=search]', 'time zones');
  browser('click', 'nav a[href^="/search?q="]');
  browser('wait', '--fn', 'document.querySelector("#guidance-query").value === "time zones"');
  browser('wait', '--fn', 'Boolean(document.querySelector(\'.search-results a[href="/foundations/internationalization#five-independent-decisions"]\'))');
  assert.equal(evaluate('new URLSearchParams(location.search).get("q")'), 'time zones');
  browser('fill', 'nav input[type=search]', '');
});
