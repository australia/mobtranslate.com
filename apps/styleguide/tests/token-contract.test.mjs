import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';

const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
const session = `mobtranslate-token-contract-${process.pid}`;
const browser = (...args) => {
  if (args[0] === 'wait' && args[1] === '--fn') new Function(`return (${args[2]});`);
  let output;
  try { output = execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 150_000, killSignal: 'SIGKILL',
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '120000' },
  });
  } catch (error) {
    if (typeof error.stdout !== 'string' || !error.stdout.trim()) throw error;
    output = error.stdout;
  }
  const response = JSON.parse(output);
  assert.equal(response.success, true, response.error);
  return response.data;
};
const evaluate = (script) => browser('eval', script).result;
const theme = (value) => {
  evaluate(`localStorage.setItem('mt-theme', ${JSON.stringify(value)}); window.dispatchEvent(new Event('storage'));`);
  browser('wait', `html.${value}`);
  browser('wait', '--fn', `document.querySelector('[data-token-authored]')?.textContent === document.querySelector('#token-contract-name option:checked')?.dataset.${value}`);
};
before(() => {
  browser('set', 'viewport', '1440', '1000');
  browser('open', `${base}/guides/theming`);
  browser('wait', '[data-token-contract]');
  theme('light');
});
after(() => browser('close'));

test('the two consumers and library resolve one matching React 19 runtime', () => {
  const manifests = ['apps/styleguide', 'apps/web', 'packages/ui'].map((location) => {
    const url = new URL(`../../../${location}/package.json`, import.meta.url);
    return { manifest: JSON.parse(readFileSync(url, 'utf8')), require: createRequire(url) };
  });
  const library = manifests[2].manifest;
  for (const dependency of ['react', 'react-dom']) {
    assert.equal(library.peerDependencies[dependency], '^19.2.7');
    const paths = manifests.map(({ require }) => realpathSync(require.resolve(`${dependency}/package.json`)));
    assert.equal(new Set(paths).size, 1, `Duplicate ${dependency} runtime`);
    for (const { require } of manifests) assert.equal(require(`${dependency}/package.json`).version, '19.2.7');
  }
});

test('every compiled TypeScript declaration agrees with rendered CSS in both themes', () => {
  for (const appearance of ['light', 'dark']) {
    theme(appearance);
    const result = evaluate(`(() => {
      const options = [...document.querySelectorAll('#token-contract-name option')];
      const probe = document.createElement('div'); document.body.append(probe);
      const root = getComputedStyle(document.documentElement);
      // Compare native CSS properties so minified units, quote styles and hex colors
      // are interpreted by the browser instead of compared as raw strings.
      const propertyFor = name => {
        if (name.startsWith('--color-') || name === '--ring-color') return 'color';
        if (name.startsWith('--duration-')) return 'transition-duration';
        if (name.startsWith('--ease-')) return 'transition-timing-function';
        if (name.startsWith('--font-')) return 'font-family';
        if (name.startsWith('--shadow-')) return 'box-shadow';
        if (name.startsWith('--opacity-')) return 'opacity';
        if (name.startsWith('--z-')) return 'z-index';
        if (name.startsWith('--transition-')) return 'transition-property';
        if (name === '--ring-offset') return 'outline-offset';
        if (name === '--ring-width') return 'outline-width';
        if (/^--(?:spacing-|text-|radius|breakpoint-|container-)/.test(name)) return 'width';
        throw new Error('Unmeasured token namespace: ' + name);
      };
      const shadowsAgree = (actual, expected) => {
        const normalize = value => {
          const alpha = [];
          const geometry = value.replace(/rgba\\(([^)]+)\\)/g, (_match, channels) => {
            const parts = channels.split(',').map(value => value.trim());
            alpha.push(Number(parts.pop()));
            return 'rgb(' + parts.join(', ') + ')';
          });
          return { geometry, alpha };
        };
        const a = normalize(actual), e = normalize(expected);
        // Lightning CSS serializes authored fractional alpha as eight-bit hex.
        // Geometry and RGB channels must match; only that one-channel quantization is allowed.
        return a.geometry === e.geometry && a.alpha.length === e.alpha.length
          && a.alpha.every((value, index) => Math.abs(value - e.alpha[index]) <= 1 / 255 + 0.000001);
      };
      const failures = options.flatMap(option => {
        const authored = option.dataset[${JSON.stringify(appearance)}];
        const property = propertyFor(option.value);
        probe.style.cssText = 'position: absolute; outline-style: solid';
        probe.style.setProperty(property, 'var(' + option.value + ')');
        const actual = getComputedStyle(probe).getPropertyValue(property).trim();
        probe.style.setProperty(property, authored);
        const expected = getComputedStyle(probe).getPropertyValue(property).trim();
        const same = property === 'box-shadow' ? shadowsAgree(actual, expected) : actual === expected;
        return root.getPropertyValue(option.value).trim() && CSS.supports(property, authored) && actual && same
          ? [] : [{ name: option.value, property, expected, actual }];
      });
      probe.remove(); return { count: options.length, failures };
    })()`);
    assert.equal(result.count, 318);
    assert.deepEqual(result.failures, [], `${appearance} authored/computed mismatch`);
  }
});

test('local overrides change live CSS while imported snapshots remain authored', () => {
  theme('light');
  browser('focus', '[data-token-contract] input[type=checkbox]');
  browser('press', 'Space');
  browser('wait', '--fn', 'document.querySelector("[data-token-live]")?.textContent === "#123456"');
  assert.equal(evaluate('document.querySelector("[data-token-authored]").textContent'), '#b45e2a');
  theme('dark');
  assert.equal(evaluate('document.querySelector("[data-token-live]").textContent'), '#123456');
  assert.equal(evaluate('document.querySelector("[data-token-authored]").textContent'), '#e29455');
  browser('focus', '[data-token-contract] input[type=checkbox]');
  browser('press', 'Space');
  browser('wait', '--fn', 'document.querySelector("[data-token-live]")?.textContent === "#e29455"');
});

test('the contract example reflows at 320px with keyboard selection', () => {
  browser('set', 'viewport', '320', '812');
  browser('focus', '#token-contract-name');
  browser('press', 'Home');
  browser('press', 'ArrowDown');
  browser('press', 'Enter');
  assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  assert.equal(evaluate('document.activeElement.id'), 'token-contract-name');
  assert.ok(evaluate('document.querySelector("[data-token-live]").textContent.length > 0'));
});
