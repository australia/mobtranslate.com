import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const session = `mobtranslate-elevation-${process.pid}`;
const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
function browser(...args) {
  const response = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 150_000,
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '120000' },
  }));
  assert.equal(response.success, true, response.error);
  return response.data;
}
const evaluate = code => browser('eval', code).result;
function open(width = 1440) {
  browser('set', 'viewport', String(width), '1000');
  browser('open', `${base}/foundations/elevation`);
  browser('wait', '[data-elevation-preview]');
}
after(() => browser('close'));

test('real surface pairs and flat/shadow presentation keep document semantics', () => {
  open();
  for (const theme of ['light', 'dark']) {
    evaluate(`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'));`);
    browser('wait', `html.${theme}`);
    for (const pair of ['card', 'popover', 'muted']) {
      browser('select', '[data-elevation-surface]', pair);
      const result = evaluate(`(() => {
        const p=document.querySelector('[data-elevation-preview]');
        const probe=document.createElement('span');
        probe.style.color='var(--color-${pair}-foreground)';
        probe.style.background='var(--color-${pair})';
        p.append(probe);
        const actual=getComputedStyle(p), expected=getComputedStyle(probe);
        const result={background:actual.backgroundColor,expectedBackground:expected.backgroundColor,
          color:actual.color,expectedColor:expected.color,heading:getComputedStyle(p.querySelector('h3')).color,
          body:getComputedStyle(p.querySelector('p')).color,z:actual.zIndex,role:p.getAttribute('role')};
        probe.remove();return result;
      })()`);
      assert.equal(result.background, result.expectedBackground);
      assert.equal(result.color, result.expectedColor);
      assert.equal(result.heading, result.expectedColor);
      assert.equal(result.body, result.expectedColor);
      assert.equal(result.z, 'auto');
      assert.equal(result.role, null);
    }
    browser('select', '[data-elevation-shadow]', 'none');
    assert.equal(evaluate('getComputedStyle(document.querySelector("[data-elevation-preview]")).boxShadow'), 'none');
    browser('select', '[data-elevation-shadow]', '--shadow-xl');
    assert.notEqual(evaluate('getComputedStyle(document.querySelector("[data-elevation-preview]")).boxShadow'), 'none');
  }
});

test('keyboard selections and enlarged text remain usable at 320px', () => {
  open(320);
  browser('focus', '[data-elevation-shadow]');
  browser('press', 'Home');
  browser('press', 'Tab');
  assert.equal(evaluate('document.activeElement.hasAttribute("data-elevation-surface")'), true);
  browser('press', 'End');
  assert.equal(evaluate('document.querySelector("[data-elevation-surface]").value'), 'muted');
  evaluate('document.documentElement.style.fontSize="200%"');
  assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
  assert.ok(evaluate('[...document.querySelectorAll("[data-elevation-lab] select")].every(x=>x.getBoundingClientRect().right<=innerWidth&&x.getBoundingClientRect().width>0)'));
  assert.equal(evaluate('(() => {const r=document.createRange();const t=document.querySelector("[data-elevation-preview] h3").firstChild;r.setStart(t,0);r.setEnd(t,6);return r.getClientRects().length;})()'), 1);
});
