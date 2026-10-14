import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const session = `styleguide-menus-${process.pid}`;
const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
function browser(...args) {
  if (args[0] === 'wait' && args[1] === '--fn') new Function(`return (${args[2]});`);
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 150000, killSignal: 'SIGKILL' }));
  assert.equal(result.success, true, result.error);
  return result.data;
}
const evaluate = script => { new Function(script); return browser('eval', script).result; };
function open(path, lab) {
  browser('open', `${base}${path}`);
  browser('wait', lab);
  browser('wait', '--fn', 'document.documentElement.matches(".light,.dark")');
}
function click(label) {
  evaluate(`(() => { const button = [...document.querySelectorAll('main button')].find(item => item.textContent.trim() === ${JSON.stringify(label)} || item.getAttribute('aria-label') === ${JSON.stringify(label)}); button.scrollIntoView({block:'center'}); return true; })()`);
  browser('find', 'role', 'button', 'click', '--name', label, '--exact');
}
after(() => browser('close'));

function commandMenu() {
  browser('scrollintoview','[data-command-trigger]'); browser('focus','[data-command-trigger]'); browser('press','ArrowDown');
  browser('wait','[role=menu][aria-label="Local record commands"]');
}
function choose(role,name) {
  const selector=evaluate(`(() => {const node=[...document.querySelectorAll('[role="${role}"]')].find(item=>{const copy=item.cloneNode(true);copy.querySelectorAll('[aria-hidden="true"]').forEach(child=>child.remove());return copy.textContent.trim()===${JSON.stringify(name)};});if(!node)throw new Error('Named menu item missing');return '#'+CSS.escape(node.id);})()`);
  browser('click',selector);
}
function closed() { browser('wait','--fn','!document.querySelector("[role=menu]")'); }

test('command menu has real trigger semantics, keyboard entry and restored context after a real command', () => {
  open('/components/menu','[data-menu-lab]');
  assert.equal(evaluate('document.querySelector("[data-command-trigger]").tagName'),'BUTTON');
  assert.equal(evaluate('document.querySelector("[data-command-trigger]").type'),'button');
  commandMenu();
  assert.equal(evaluate('document.querySelector("[data-command-trigger]").getAttribute("aria-expanded")'),'true');
  assert.equal(evaluate('document.activeElement.textContent'),'Duplicate local record');
  browser('press','Enter'); closed();
  assert.match(evaluate('document.querySelector("[data-command-copies]").textContent'),/Local copies: 1/);
  browser('wait','--fn','document.activeElement.matches("[data-menu-record]")');
  commandMenu(); browser('press','Escape'); closed();
  assert.ok(evaluate('document.activeElement.matches("[data-menu-record]")'));
});

test('unavailable commands reject activation and type navigation finds a meaningful item', () => {
  open('/components/menu','[data-menu-lab]'); commandMenu();
  const before=evaluate('document.querySelector("[data-menu-lab] [role=status]").textContent');
  choose('menuitem','Publish to server (unavailable)');
  assert.equal(evaluate('document.querySelector("[data-menu-lab] [role=status]").textContent'),before);
  assert.ok(evaluate('[...document.querySelectorAll("[role=menuitem]")].find(node=>node.textContent==="Publish to server (unavailable)").getAttribute("aria-disabled")==="true"'));
  browser('focus','[role=menuitem]'); browser('press','r');
  assert.match(evaluate('document.activeElement.textContent'),/Rename|Reading layout/);
  browser('press','Escape'); closed();
});

test('checkbox and submenu radio choices change actual content and keep their visible marks aligned', () => {
  open('/components/menu','[data-menu-lab]'); commandMenu();
  choose('menuitemcheckbox','Show local notes');
  assert.equal(evaluate('document.querySelector("[data-command-notes]") === null'),true);
  assert.equal(evaluate('document.querySelector("[role=menuitemcheckbox]").getAttribute("aria-checked")'),'false');
  assert.equal(evaluate('getComputedStyle(document.querySelector(".mt-menu-choice-indicator")).visibility'),'hidden');
  browser('focus','.mt-menu-submenu-trigger'); browser('press','ArrowRight');
  browser('wait','[role=menu][aria-label="Reading layout choices"]');
  choose('menuitemradio','Comfortable layout');
  assert.equal(evaluate('[...document.querySelectorAll("[role=menuitemradio]")].find(node=>node.textContent.includes("Comfortable layout")).getAttribute("aria-checked")'),'true');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-menu-record]")).lineHeight'),'28px');
  browser('press','Escape');
  browser('wait','--fn','!document.querySelector(\'[role=menu][aria-label="Reading layout choices"]\')');
  assert.ok(evaluate('document.querySelector(\'[role=menu][aria-label="Local record commands"]\') !== null'));
  browser('wait','--fn','document.activeElement.classList.contains("mt-menu-submenu-trigger")');
  browser('press','Escape'); closed();
});

test('pending commands preserve their context and recover failure, cancellation, completion and restoration', () => {
  open('/components/menu','[data-menu-lab]'); commandMenu(); choose('menuitem','Rename local record…'); closed();
  assert.ok(evaluate('document.querySelector("[data-command-trigger]").disabled'));
  assert.match(evaluate('document.querySelector("[data-menu-record]").textContent'),/Local reading record/);
  click('Fail local rename');
  assert.match(evaluate('document.querySelector("[data-menu-lab] [role=status]").textContent'),/failed/);
  assert.ok(evaluate('document.activeElement.matches("[data-menu-record]")'));
  commandMenu(); choose('menuitem','Rename local record…'); closed(); click('Cancel local rename');
  assert.match(evaluate('document.querySelector("[data-menu-lab] [role=status]").textContent'),/cancelled/);
  commandMenu(); choose('menuitem','Rename local record…'); closed(); click('Complete local rename');
  assert.match(evaluate('document.querySelector("[data-menu-record]").textContent'),/Updated local reading record/);
  click('Restore local command context');
  assert.match(evaluate('document.querySelector("[data-menu-record]").textContent'),/Local reading record/);
});

test('context menu opens from an actual right mouse action and changes the same object as its visible alternative', () => {
  open('/components/context-menu','[data-context-lab]');
  assert.equal(evaluate('document.querySelector("[data-context-target]").tagName'),'DIV');
  browser('scrollintoview','[data-context-target]'); browser('focus','[data-context-target]');
  const point=evaluate('(() => {const r=document.querySelector("[data-context-target]").getBoundingClientRect();return {x:r.left+24,y:r.top+24};})()');
  browser('mouse','move',String(point.x),String(point.y)); browser('mouse','down','right'); browser('mouse','up','right');
  browser('wait','[role=menu][aria-label="Local reading context actions"]');
  choose('menuitem','Add local bookmark'); closed();
  assert.match(evaluate('document.querySelector("[data-context-bookmark]").textContent'),/included/);
  browser('wait','--fn','document.activeElement.matches("[data-context-target]")');
  click('Open local context actions');
  browser('wait','[role=menu][aria-label="Visible local context actions"]');
  choose('menuitem','Remove local bookmark'); closed();
  assert.match(evaluate('document.querySelector("[data-context-bookmark]").textContent'),/not included/);
});

test('menubar coordinates arrow navigation, real commands, checked views and unavailable menus', () => {
  open('/components/menubar','[data-menubar-lab]');
  const record='[role=menubar] [role=menuitem]';
  assert.equal(evaluate(`document.querySelectorAll('[role=menubar] [role=menuitem][tabindex="0"]').length`),1);
  browser('focus',record); browser('press','ArrowRight');
  assert.equal(evaluate('document.activeElement.textContent'),'View');
  browser('press','ArrowDown'); browser('wait','[role=menu][aria-label="Local View commands"]');
  choose('menuitemcheckbox','Show bar notes');
  assert.equal(evaluate('document.querySelector("[data-menubar-notes]") === null'),true);
  browser('press','Escape'); closed();
  browser('focus',record); browser('press','ArrowDown'); browser('wait','[role=menu][aria-label="Local Record commands"]');
  choose('menuitem','Add local copy'); closed();
  assert.match(evaluate('document.querySelector("[data-menubar-count]").textContent'),/Local copies: 1/);
  assert.ok(evaluate('[...document.querySelectorAll("[role=menubar] [role=menuitem]")].find(node=>node.textContent==="Unavailable").getAttribute("aria-disabled")==="true"'));
  click('Disable command bar');
  assert.ok(evaluate('[...document.querySelectorAll("[role=menubar] [role=menuitem]")].every(node=>node.disabled || node.getAttribute("aria-disabled")==="true")'));
});

test('menubar vertical and RTL settings change actual geometry and keyboard direction', () => {
  open('/components/menubar','[data-menubar-lab]'); click('Use vertical command bar');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[role=menubar]")).flexDirection'),'column');
  assert.equal(evaluate('document.querySelector("[role=menubar]").getAttribute("aria-orientation")'),'vertical');
  browser('focus','[role=menubar] [role=menuitem]'); browser('press','ArrowDown');
  assert.equal(evaluate('document.activeElement.textContent'),'View');
  click('Use horizontal command bar'); click('Use RTL command context');
  browser('focus','[role=menubar] [role=menuitem]'); browser('press','ArrowLeft');
  assert.equal(evaluate('document.activeElement.textContent'),'View');
});

test('menu guides reflow and actual popups remain bounded with reachable final commands at 320px', () => {
  browser('set','viewport','320','480'); open('/components/menu','[data-menu-lab]');
  for(const theme of ['light','dark']) {
    evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));`);
    for(const path of ['/components/menu','/components/context-menu','/components/menubar','/patterns/commands']) { open(path,'main h1'); browser('wait',`html.${theme}`); assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false,`${theme} ${path}`); }
    open('/components/menu','[data-menu-lab]'); commandMenu();
    assert.ok(evaluate('(() => {const r=document.querySelector("[role=menu]").getBoundingClientRect();return r.width<=innerWidth && r.height<=innerHeight && r.left>=0 && r.right<=innerWidth;})()'));
    browser('press','End');
    assert.match(evaluate('document.activeElement.textContent'),/Reading layout/);
    browser('press','Escape'); closed();
  }
});

test('menu text, visible checked marks and keyboard focus cues are readable and motion can be reduced', () => {
  browser('set','viewport','1440','1000'); open('/components/menu','[data-menu-lab]');
  for(const theme of ['light','dark']) {
    evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));`);
    open('/components/menu','[data-menu-lab]'); browser('wait',`html.${theme}`); commandMenu();
    const ratios=evaluate(`(() => {
      const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
      const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
      const lum=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const ratio=(a,b)=>(Math.max(lum(rgb(a)),lum(rgb(b)))+.05)/(Math.min(lum(rgb(a)),lum(rgb(b)))+.05);
      const surface=getComputedStyle(document.querySelector('[role=menu]')).backgroundColor;
      const active=getComputedStyle(document.activeElement);
      const label=getComputedStyle(document.querySelector('.mt-menu-group-label'));
      const choice=getComputedStyle(document.querySelector('[role=menuitemcheckbox]'));
      return {text:ratio(active.color,active.backgroundColor),focus:ratio(active.outlineColor,active.backgroundColor),group:ratio(label.color,surface),mark:ratio(choice.color,surface)};
    })()`);
    for(const key of ['text','group','mark']) assert.ok(ratios[key]>=4.5,`${theme} ${key}: ${ratios[key]}`);
    assert.ok(ratios.focus>=3,`${theme} focus: ${ratios.focus}`);
    assert.ok(evaluate('[...document.querySelectorAll(".mt-menu-item")].every(node=>node.getBoundingClientRect().height>=44)'));
    assert.ok(evaluate('document.querySelector("[role=menu] [role=group]").getAttribute("aria-labelledby").split(" ").some(id=>document.getElementById(id)?.textContent==="Local commands")'));
    browser('press','Escape'); closed();
  }
  browser('set','media','light','reduced-motion'); open('/components/menu','[data-menu-lab]'); commandMenu();
  assert.equal(evaluate('getComputedStyle(document.querySelector(".mt-menu-popup")).animationName'),'none');
  assert.ok(evaluate('getComputedStyle(document.querySelector(".mt-menu-item")).transitionDuration.split(",").every(duration=>parseFloat(duration)<=.00001)'));
  browser('press','Escape'); closed(); browser('set','media','light');
});

test('Tab and reverse Tab exit the command menu to a surviving task focus target', () => {
  open('/components/menu','[data-menu-lab]'); commandMenu(); browser('press','Tab'); closed();
  assert.ok(evaluate('document.activeElement.closest("main") !== null'));
  assert.equal(evaluate('document.activeElement.closest("[role=menu]")'),null);
  commandMenu(); browser('press','Shift+Tab'); closed();
  assert.ok(evaluate('document.activeElement.closest("main") !== null'));
});
