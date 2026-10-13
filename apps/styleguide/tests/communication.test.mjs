import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const session = `styleguide-communication-${process.pid}`;
const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
function browser(...args) {
  if (args[0] === 'wait' && args[1] === '--fn') new Function(`return (${args[2]});`);
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 150000, killSignal: 'SIGKILL' }));
  assert.equal(result.success, true, result.error);
  return result.data;
}
const evaluate = script => browser('eval', script).result;
function open(path, lab) {
  browser('open', `${base}${path}`);
  browser('wait', lab);
  browser('wait', '--fn', 'document.documentElement.matches(".light,.dark")');
}
function click(label) {
  evaluate(`(() => { const button = [...document.querySelectorAll('main button')].find(item => item.textContent.trim() === ${JSON.stringify(label)}); button.scrollIntoView({block:'center'}); return true; })()`);
  browser('find', 'role', 'button', 'click', '--name', label, '--exact');
}
after(() => browser('close'));

test('inline alert retains child content and restores focus after separate recovery and dismissal', () => {
  open('/components/alert', '[data-alert-lab]');
  assert.equal(evaluate('document.querySelectorAll("[data-alert-lab] [data-tone]").length'), 6);
  click('Show recoverable alert');
  assert.ok(evaluate('document.querySelector("[data-alert-lab]").textContent.includes("Additional child content stays visible")'));
  const dismiss = evaluate(`(() => { const b = document.querySelector('[aria-label="Dismiss local task message"]'); const r = b.getBoundingClientRect(); return {type:b.type,width:r.width,height:r.height}; })()`);
  assert.deepEqual(dismiss, {type:'button',width:44,height:44});
  click('Resume local task');
  assert.match(evaluate('document.querySelector("[data-alert-lab]").textContent'), /Local task resumed/);
  assert.equal(evaluate('document.activeElement.textContent'), 'Show recoverable alert');
  click('Show recoverable alert');
  browser('click', '[aria-label="Dismiss local task message"]');
  assert.match(evaluate('document.querySelector("[data-alert-lab]").textContent'), /remains paused/);
  assert.equal(evaluate('document.activeElement.textContent'), 'Show recoverable alert');
});

test('badge changes actual shape and retains the full capped count', () => {
  open('/components/badge', '[data-badge-lab]');
  assert.equal(evaluate('document.querySelectorAll("[data-badge-lab] [data-tone]").length'), 8);
  const pill = evaluate('getComputedStyle(document.querySelector("[data-badge-lab] .mt-badge")).borderRadius');
  browser('select', '[data-badge-lab] select', 'rounded');
  assert.notEqual(evaluate('getComputedStyle(document.querySelector("[data-badge-lab] .mt-badge")).borderRadius'), pill);
  browser('focus', '[data-badge-lab] input'); browser('press', 'End');
  assert.equal(evaluate('document.querySelector("[data-count-badge] [aria-hidden]").textContent'), '99+');
  assert.match(evaluate('document.querySelector("[data-count-badge]").textContent'), /120 tasks/);
  browser('press', 'Home');
  assert.equal(evaluate('document.querySelector("[data-count-badge]") === null'), true);
  assert.match(evaluate('document.querySelector("[data-badge-lab] [role=status]").textContent'), /No local tasks/);
});

test('linear and circular progress distinguish unknown totals from measured completion', () => {
  open('/components/circular-progress', '[data-progress-lab]');
  assert.equal(evaluate('document.querySelectorAll("[data-progress-lab] [role=progressbar]").length'), 2);
  assert.ok(evaluate('[...document.querySelectorAll("[data-progress-lab] [role=progressbar]")].every(node => !node.hasAttribute("aria-valuenow"))'));
  assert.ok(evaluate('document.querySelector(".lab-progress-indeterminate") !== null'));
  const ratio = evaluate('document.querySelector(".mt-progress-indicator").getBoundingClientRect().width / document.querySelector(".mt-progress-track").getBoundingClientRect().width');
  assert.ok(ratio > .34 && ratio < .36);
  for (const [size, width] of [['sm',20],['md',32],['lg',48]]) {
    browser('select', '[data-progress-lab] select', size);
    assert.equal(evaluate('document.querySelector(".mt-circular-progress").getBoundingClientRect().width'), width);
  }
  click('Reset measured progress');
  assert.ok(evaluate('[...document.querySelectorAll("[role=progressbar]")].every(node => node.getAttribute("aria-valuenow") === "0")'));
  for (let index = 0; index < 10; index++) click('Complete one local step');
  assert.ok(evaluate('[...document.querySelectorAll("[role=progressbar]")].every(node => node.getAttribute("aria-valuenow") === "10")'));
  assert.ok(evaluate('document.querySelector(".lab-circular-complete") !== null'));
  assert.equal(evaluate('document.querySelector(".mt-circular-progress-indicator").getAttribute("stroke-dasharray")'), '100 100');
  click('Use unknown total');
  assert.ok(evaluate('[...document.querySelectorAll("[role=progressbar]")].every(node => !node.hasAttribute("aria-valuenow"))'));
});

test('meter exposes actual scalar units at both bounds', () => {
  open('/components/meter', '[data-meter-lab]');
  browser('focus', '[data-meter-lab] input'); browser('press', 'End');
  assert.equal(evaluate('document.querySelector("[role=meter]").getAttribute("aria-valuenow")'), '20');
  assert.match(evaluate('document.querySelector("[role=meter]").getAttribute("aria-valuetext")'), /20 of 20 sample units/);
  browser('press', 'Home');
  assert.equal(evaluate('document.querySelector("[role=meter]").getAttribute("aria-valuenow")'), '0');
});

test('loading placeholders leave the accessibility tree and preserve recovery after failure', () => {
  open('/components/skeleton', '[data-skeleton-lab]');
  assert.equal(evaluate('document.querySelectorAll("[data-skeleton-lab] [aria-hidden=true] .mt-skeleton").length'), 4);
  assert.equal(evaluate('document.querySelector("[data-skeleton-lab] [role=region]").getAttribute("aria-busy")'), 'true');
  click('Simulate content failure');
  assert.equal(evaluate('document.querySelectorAll("[data-skeleton-lab] .mt-skeleton").length'), 0);
  assert.equal(evaluate('document.activeElement.textContent'), 'Load local content');
  click('Load local content'); click('Simulate content ready');
  assert.equal(evaluate('document.querySelector("[data-skeleton-lab] [role=region]").getAttribute("aria-busy")'), 'false');
  assert.match(evaluate('document.querySelector("[data-skeleton-lab] [role=region]").textContent'), /content is now available/);
  assert.equal(evaluate('document.activeElement.textContent'), 'Load local content');
});

test('provider notifications update the same item and local undo changes the retained task', () => {
  open('/components/toast', '[data-toast-lab]');
  click('Add local notification');
  browser('wait', '.mt-toast');
  assert.equal(evaluate('document.querySelectorAll(".mt-toast").length'), 1);
  click('Update latest notification');
  browser('wait', '--fn', 'document.querySelector(".mt-toast-title")?.textContent === "Local notification updated"');
  assert.equal(evaluate('document.querySelectorAll(".mt-toast").length'), 1);
  browser('click', '[aria-label="Dismiss Local notification updated"]');
  browser('wait', '--fn', '!document.querySelector(".mt-toast")');
  click('Remove example draft'); click('Undo local removal');
  assert.match(evaluate('document.querySelector("[data-toast-lab] > [role=status]").textContent'), /draft restored/);
  assert.equal(evaluate('[...document.querySelectorAll("[data-toast-lab] button")].find(node => node.textContent === "Remove example draft").getAttribute("aria-disabled")'), null);
});

test('controlled promise notifications resolve and reject with focus returned to the task', () => {
  open('/components/toast', '[data-toast-lab]');
  click('Start local promise');
  browser('wait', '--fn', 'document.querySelector(".mt-toast-title")?.textContent === "Local task pending"');
  click('Resolve local promise');
  browser('wait', '--fn', 'document.querySelector(".mt-toast-title")?.textContent === "Local task complete"');
  assert.equal(evaluate('document.activeElement.textContent'), 'Start local promise');
  assert.equal(evaluate('document.querySelectorAll(".mt-toast").length'), 1);
  browser('click', '[aria-label="Dismiss Local task complete"]');
  browser('wait', '--fn', '!document.querySelector(".mt-toast")');
  click('Start local promise'); click('Reject local promise');
  browser('wait', '--fn', 'document.querySelector(".mt-toast-title")?.textContent === "Local task failed"');
  assert.equal(evaluate('document.activeElement.textContent'), 'Start local promise');
});

test('notification limit preserves task recovery and F6/Shift+Tab restore the prior focus', () => {
  open('/components/toast', '[data-toast-lab]');
  click('Remove example draft');
  for (let index = 0; index < 4; index++) click('Add local notification');
  assert.equal(evaluate('[...document.querySelectorAll(".mt-toast")].filter(node => getComputedStyle(node).display !== "none").length'), 3);
  assert.ok(evaluate('[...document.querySelectorAll(".mt-toast[data-limited]")].every(node => node.hasAttribute("inert"))'));
  browser('press', 'F6');
  assert.ok(evaluate('document.activeElement.matches(".mt-toast-viewport")'));
  browser('press', 'Shift+Tab');
  assert.equal(evaluate('document.activeElement.textContent'), 'Add local notification');
  browser('press', 'F6');
  browser('press', 'Tab');
  assert.ok(evaluate('document.activeElement.closest(".mt-toast") !== null'));
  browser('press', 'Escape');
  browser('wait', '--fn', 'document.querySelectorAll(".mt-toast").length === 4');
  assert.equal(evaluate('[...document.querySelectorAll(".mt-toast")].filter(node => getComputedStyle(node).display !== "none").length'), 3);
  click('Restore example draft');
  assert.match(evaluate('document.querySelector("[data-toast-lab] > [role=status]").textContent'), /persistent recovery action/);
});

test('ordinary expiry pauses while the viewport has keyboard focus and resumes after leaving', () => {
  open('/components/toast', '[data-toast-lab]');
  browser('scrollintoview', '[data-toast-lab] input[type=checkbox]');
  browser('focus', '[data-toast-lab] input[type=checkbox]');
  browser('press', 'Space');
  assert.equal(evaluate('document.querySelector("[data-toast-lab] input[type=checkbox]").checked'), true);
  click('Add local notification');
  browser('wait', '.mt-toast');
  browser('mouse', 'move', '0', '0');
  browser('press', 'F6');
  browser('wait', '5500');
  assert.equal(evaluate('document.querySelectorAll(".mt-toast").length'), 1);
  browser('press', 'Shift+Tab');
  browser('wait', '--fn', '!document.querySelector(".mt-toast")');
});

test('communication guides reflow at 320px in both themes and preserve readable message text', () => {
  browser('set', 'viewport', '320', '812');
  for (const theme of ['light','dark']) {
    evaluate(`localStorage.setItem('mt-theme', ${JSON.stringify(theme)}); window.dispatchEvent(new Event('storage'));`);
    for (const path of ['alert','badge','progress','circular-progress','meter','skeleton','toast']) {
      open(`/components/${path}`, 'main h1');
      browser('wait', `html.${theme}`);
      assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${theme} ${path}`);
      if (path === 'alert' || path === 'badge') {
        const ratios = evaluate(`(() => {
          const ctx = document.createElement('canvas').getContext('2d', {willReadFrequently:true});
          function rgba(color) { ctx.clearRect(0,0,1,1); ctx.fillStyle=color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data]; }
          function luminance(color) { return color.slice(0,3).map(v => { v /= 255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; }).reduce((sum,v,i) => sum + v*[.2126,.7152,.0722][i],0); }
          return [...document.querySelectorAll('[data-tone]')].flatMap(root => {
            let parent=root, bg=rgba(getComputedStyle(parent).backgroundColor);
            while(bg[3] < 255 && parent.parentElement) {parent=parent.parentElement; bg=rgba(getComputedStyle(parent).backgroundColor);}
            return (root.matches('.mt-badge') ? [root] : [...root.querySelectorAll('.mt-alert-title,.mt-alert-description')]).map(node => {
              const a=luminance(rgba(getComputedStyle(node).color)), b=luminance(bg);
              return {tone:root.dataset.tone,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
            });
          });
        })()`);
        for (const pair of ratios) assert.ok(pair.ratio >= 4.5, `${theme} ${path} ${pair.tone}: ${pair.ratio}`);
      }
    }
    open('/patterns/notifications', '[data-toast-lab]');
    assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  }
});

test('reduced motion stops unknown progress and loading placeholder animation', () => {
  browser('set', 'media', 'light', 'reduced-motion');
  open('/components/progress', '[data-progress-lab]');
  assert.equal(evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
  assert.equal(evaluate('getComputedStyle(document.querySelector(".mt-progress-indicator")).animationName'), 'none');
  assert.equal(evaluate('getComputedStyle(document.querySelector(".mt-circular-progress svg")).animationName'), 'none');
  open('/components/skeleton', '[data-skeleton-lab]');
  assert.ok(evaluate('[...document.querySelectorAll(".mt-skeleton")].every(node => getComputedStyle(node).animationName === "none")'));
});
