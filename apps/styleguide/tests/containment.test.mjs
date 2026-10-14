import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const session = `styleguide-containment-${process.pid}`;
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
  evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(label)}); button.scrollIntoView({block:'center'}); return true; })()`);
  browser('find', 'role', 'button', 'click', '--name', label, '--exact');
}
after(() => browser('close'));

test('cards expose distinct surfaces and explicit local actions', () => {
  open('/components/card', '[data-card-lab]');
  const styles = [];
  for (const variant of ['default','filled','outlined','elevated']) {
    browser('select', '[data-card-lab] select', variant);
    styles.push(evaluate(`(() => {const card=document.querySelector('.mt-card'); const s=getComputedStyle(card); return [s.backgroundColor,s.borderColor,s.boxShadow].join('|');})()`));
  }
  assert.equal(new Set(styles).size, 4);
  assert.equal(evaluate('document.querySelector(".mt-card").hasAttribute("tabindex")'), false);
  click('Bookmark locally');
  assert.match(evaluate('document.querySelector("[data-card-lab] > [role=status]").textContent'), /bookmark added/);
  assert.equal(evaluate('document.querySelector(".mt-card button").getAttribute("aria-pressed")'), 'true');
  click('Remove local bookmark');
  assert.equal(evaluate('document.querySelector(".mt-card button").getAttribute("aria-pressed")'), 'false');
});

test('dialog names and focus are connected; Escape discards the uncommitted draft', () => {
  open('/components/dialog', '[data-dialog-lab]');
  click('Edit local collection'); browser('wait', '[role=dialog] input');
  assert.equal(evaluate('document.activeElement.matches("[role=dialog] input")'), true);
  assert.equal(evaluate('document.querySelector("[role=dialog]").getAttribute("aria-modal")'), 'true');
  assert.equal(evaluate('document.getElementById(document.querySelector("[role=dialog]").getAttribute("aria-labelledby")).textContent'), 'Edit local collection');
  assert.ok(evaluate('document.querySelector(".local-dialog-open") !== null'));
  browser('fill', '[role=dialog] input', 'Uncommitted title');
  for (let index=0;index<7;index++) {
    browser('press','Tab');
    const focus=evaluate('(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {inside:document.querySelector("[role=dialog]").contains(document.activeElement),active:document.activeElement.outerHTML.slice(0,220)};})()');
    assert.ok(focus.inside,JSON.stringify({step:index+1,...focus}));
  }
  browser('press', 'Escape'); browser('wait', '--fn', '!document.querySelector("[role=dialog]")');
  assert.equal(evaluate('document.activeElement.textContent'), 'Edit local collection');
  assert.equal(evaluate('document.querySelector("[data-dialog-lab] > [role=status]").textContent'), 'Current local collection: Local collection');
});

test('dialog validation and pending failure retain text before an actual local success', () => {
  open('/components/dialog', '[data-dialog-lab]'); click('Edit local collection');
  browser('wait', '[role=dialog] input'); browser('focus','[role=dialog] input'); browser('press','Control+A'); browser('press','Backspace');
  click('Save local collection');
  assert.equal(evaluate('document.querySelector("[role=dialog] input").getAttribute("aria-invalid")'), 'true');
  browser('fill', '[role=dialog] input', 'Verified local title'); click('Save local collection');
  assert.equal(evaluate('document.querySelector("[role=dialog] input").readOnly'), true);
  browser('press','Escape'); assert.ok(evaluate('document.querySelector("[role=dialog]") !== null'));
  click('Simulate save failure');
  assert.equal(evaluate('document.querySelector("[role=dialog] input").value'), 'Verified local title');
  assert.equal(evaluate('document.activeElement.textContent'), 'Save local collection');
  click('Save local collection'); click('Cancel pending local save');
  assert.equal(evaluate('document.querySelector("[role=dialog] input").readOnly'), false);
  click('Save local collection'); click('Simulate save success');
  browser('wait','--fn','!document.querySelector("[role=dialog]")');
  assert.equal(evaluate('document.querySelector("[data-dialog-lab] > [role=status]").textContent'), 'Current local collection: Verified local title');
  assert.equal(evaluate('document.activeElement.textContent'), 'Edit local collection');
});

test('drawer applies staged filters and Escape preserves the previously applied state', () => {
  open('/components/drawer','[data-drawer-lab]'); click('Open local filters'); browser('wait','[role=dialog] input');
  assert.equal(evaluate('getComputedStyle(document.querySelector(".mt-drawer-popup")).position'), 'fixed');
  assert.ok(evaluate('document.activeElement.matches(".mt-drawer-title")'));
  browser('focus','[role=dialog] input'); browser('press','Space'); click('Apply local filters');
  browser('wait','--fn','!document.querySelector("[role=dialog]")');
  assert.match(evaluate('document.querySelector("[data-drawer-lab] > [role=status]").textContent'), /bookmarked examples/);
  click('Open local filters'); browser('wait','[role=dialog] input');
  assert.equal(evaluate('document.querySelector("[role=dialog] input").checked'), true);
  browser('focus','[role=dialog] input'); browser('press','Space'); browser('press','Escape');
  browser('wait','--fn','!document.querySelector("[role=dialog]")');
  assert.match(evaluate('document.querySelector("[data-drawer-lab] > [role=status]").textContent'), /bookmarked examples/);
  assert.equal(evaluate('document.activeElement.textContent'), 'Open local filters');
});

test('consequential confirmation starts safely, preserves cancel and focuses independent recovery', () => {
  open('/components/alert-dialog','[data-confirmation-lab]'); click('Remove local example'); browser('wait','[role=alertdialog]');
  assert.equal(evaluate('document.activeElement.textContent'), 'Keep local example');
  assert.ok(evaluate('Boolean(document.getElementById(document.querySelector("[role=alertdialog]").getAttribute("aria-describedby")))'));
  browser('mouse','move','0','0'); browser('mouse','down'); browser('mouse','up');
  assert.ok(evaluate('document.querySelector("[role=alertdialog]") !== null'));
  browser('press','Escape'); browser('wait','--fn','!document.querySelector("[role=alertdialog]")');
  assert.equal(evaluate('document.activeElement.textContent'), 'Remove local example');
  click('Remove local example'); click('Confirm local removal'); browser('wait','--fn','!document.querySelector("[role=alertdialog]")');
  assert.equal(evaluate('document.activeElement.textContent'), 'Restore local example');
  assert.match(evaluate('document.querySelector("[data-confirmation-lab] > [role=status]").textContent'), /example removed/);
  click('Restore local example');
  assert.match(evaluate('document.querySelector("[data-confirmation-lab] > [role=status]").textContent'), /example restored/);
});

test('all drawer edges remain bounded and long content scrolls at a short narrow viewport', () => {
  browser('set','viewport','320','480');
  for (const side of ['left','right','top','bottom']) {
    open('/components/drawer','[data-drawer-lab]'); browser('select','[data-drawer-lab] select',side);
    browser('scrollintoview','[data-drawer-lab] input'); browser('focus','[data-drawer-lab] input'); browser('press','Space');
    click('Open local filters'); browser('wait','[role=dialog]'); browser('wait','400');
    const bounds=evaluate(`(() => { const p=document.querySelector('.mt-drawer-popup'); const r=p.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scroll:p.scrollHeight>p.clientHeight,overflow:getComputedStyle(p).overflowY}; })()`);
    assert.ok(bounds.left>=-1 && bounds.right<=321 && bounds.top>=-1 && bounds.bottom<=481, side);
    assert.equal(bounds.scroll,true,side); assert.equal(bounds.overflow,'auto');
    click('Cancel local filters'); browser('wait','--fn','!document.querySelector("[role=dialog]")');
    assert.equal(evaluate('document.activeElement.textContent'),'Open local filters');
  }
});

test('dialog size variants are capped by a short viewport and reduced motion removes entrance animation', () => {
  browser('set','media','light','reduced-motion'); browser('set','viewport','320','360');
  for(const size of ['sm','md','lg','xl']) {
    open('/components/dialog','[data-dialog-lab]'); browser('select','[data-dialog-size]',size); click('Edit local collection'); browser('wait','[role=dialog]');
    const bounds=evaluate(`(() => {const p=document.querySelector('.mt-dialog-popup'),r=p.getBoundingClientRect(),s=getComputedStyle(p); return {width:r.width,height:r.height,top:r.top,bottom:r.bottom,animation:s.animationName};})()`);
    assert.ok(bounds.width >= 270 && bounds.width <= 288); assert.ok(bounds.height<=328 && bounds.top>=15 && bounds.bottom<=345); assert.equal(bounds.animation,'none');
    browser('press','Escape'); browser('wait','--fn','!document.querySelector("[role=dialog]")');
  }
});

test('containment documents reflow in both themes at 320px', () => {
  for(const theme of ['light','dark']) {
    evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)}); window.dispatchEvent(new Event('storage'));`);
    for(const path of ['/components/card','/components/dialog','/components/drawer','/components/alert-dialog','/patterns/confirmation']) {
      open(path,'main h1'); browser('wait',`html.${theme}`);
      assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false,`${theme} ${path}`);
    }
  }
});


 test('non-modal and focus-only modes do not claim fully modal semantics', () => {
  for(const mode of ['non-modal','trap-focus']) {
    open('/components/dialog','[data-dialog-lab]'); browser('select','[data-dialog-mode]',mode); click('Edit local collection'); browser('wait','[role=dialog]');
    assert.equal(evaluate('document.querySelector("[role=dialog]").getAttribute("aria-modal")'),null);
    assert.equal(evaluate('document.querySelector(".mt-dialog-backdrop") === null'),true);
    if(mode === 'trap-focus') {
      browser('wait','--fn','document.querySelector("[role=dialog]").contains(document.activeElement)');
      for(let index=0;index<6;index++) {
        browser('press','Tab');
        const focus=evaluate('(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {inside:document.querySelector("[role=dialog]").contains(document.activeElement),active:document.activeElement.outerHTML.slice(0,220)};})()');
        assert.ok(focus.inside,JSON.stringify({step:index+1,...focus}));
      }
    }
    browser('press','Escape'); browser('wait','--fn','!document.querySelector("[role=dialog]")');
  }
});
