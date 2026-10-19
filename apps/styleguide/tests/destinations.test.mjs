import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const session = `styleguide-destinations-${process.pid}`;
const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
function browser(...args) {
  if (args[0] === 'wait' && args[1] === '--fn') new Function(`return (${args[2]});`);
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding:'utf8', timeout:150000, killSignal:'SIGKILL' }));
  assert.equal(result.success, true, result.error);
  return result.data;
}
const evaluate = script => { new Function(script); return browser('eval', script).result; };
function open(path, lab) {
  browser('open', base + path); browser('wait', lab);
  browser('wait', '--fn', 'document.documentElement.matches(".light,.dark")');
}
function click(name) {
  evaluate(`(() => {document.querySelectorAll('[data-destination-driver-target]').forEach(n=>n.removeAttribute('data-destination-driver-target'));const node=[...document.querySelectorAll('main button')].find(n=>{const copy=n.cloneNode(true);copy.querySelectorAll('[aria-hidden=true]').forEach(part=>part.remove());return (n.getAttribute('aria-label') || copy.textContent.trim())===${JSON.stringify(name)};});if(!node)throw new Error('Missing button');node.setAttribute('data-destination-driver-target','');node.scrollIntoView({block:'center'});return true;})()`);
  browser('click','[data-destination-driver-target]');
}
const localRecords = () => evaluate('document.querySelector("[data-local-page-records]")?.textContent ?? ""');
const currentPage = () => evaluate('document.querySelector("[data-pagination-lab] [aria-current=page]")?.textContent ?? null');
const status = () => evaluate('document.querySelector("[data-pagination-lab] [role=status]").textContent');
after(() => { try { browser('close'); } catch {} });

test('destination navigation uses native structure and opens and closes by keyboard', () => {
  open('/components/navigation-menu','[data-destination-lab]');
  assert.deepEqual(evaluate(`(() => {const n=document.querySelector('[aria-label="Local destination navigation"]');return [n.tagName,n.querySelector('ul').tagName,n.querySelector('li').tagName,n.querySelector('.mt-navigation-menu-icon').tagName];})()`), ['NAV','UL','LI','SPAN']);
  browser('scrollintoview','[data-destination-trigger]'); browser('focus','[data-destination-trigger]'); browser('press','ArrowDown');
  browser('wait','.mt-navigation-menu-popup');
  assert.equal(evaluate('document.querySelector("[data-destination-trigger]").getAttribute("aria-expanded")'),'true');
  assert.ok(evaluate('document.querySelector(".local-destinations-open") !== null'));
  assert.equal(evaluate('document.querySelector(".mt-navigation-menu-popup a").getAttribute("href")'),'#navigation-local-overview');
  browser('press','Escape');
  browser('wait','--fn','document.querySelector("[data-destination-trigger]").getAttribute("aria-expanded") === "false"');
  assert.ok(evaluate('document.activeElement.matches("[data-destination-trigger]")'));
});

test('same-page destinations retain the draft and focus the actual arriving heading', () => {
  open('/components/navigation-menu','[data-destination-lab]');
  browser('fill','#destination-local-draft','Retained navigation evidence');
  click('Local destinations'); browser('wait','.mt-navigation-menu-popup a[href="#navigation-local-details"]');
  browser('focus','.mt-navigation-menu-popup a[href="#navigation-local-details"]');browser('press','Enter');
  browser('wait','--fn','document.activeElement.id === "navigation-local-details"');
  assert.equal(evaluate('location.hash'),'#navigation-local-details');
  assert.equal(evaluate('document.querySelector("#destination-local-draft").value'),'Retained navigation evidence');
  assert.match(evaluate('document.querySelector("[data-destination-lab]").textContent'),/Retained navigation evidence/);
});

test('unavailable destinations reject pointer hover click and keyboard activation', () => {
  open('/components/navigation-menu','[data-destination-lab]');
  const selector='[data-destination-lab] button[aria-disabled=true]';
  browser('scrollintoview',selector); browser('hover',selector); browser('wait','250');
  assert.equal(evaluate('document.querySelector(".local-destinations-open")'),null);
  browser('click',selector); browser('focus',selector);
  for (const key of ['Enter','Space','ArrowDown']) browser('press',key);
  assert.equal(evaluate('document.querySelector(".local-destinations-open")'),null);
  assert.ok(evaluate('!document.querySelector(".mt-navigation-menu-popup")?.textContent.includes("Unexpected unavailable")'));
  click('Local destinations');browser('wait','.mt-navigation-menu-popup');
  browser('hover',selector);browser('wait','250');
  assert.ok(evaluate('!document.querySelector(".mt-navigation-menu-popup")?.textContent.includes("Unexpected unavailable")'));
  assert.ok(evaluate('!document.querySelector("[data-destination-lab] [role=status]").textContent.includes("group: unavailable")'));
});

test('orientation and direction changes reach real related-guide destinations', () => {
  open('/components/navigation-menu','[data-destination-lab]');
  click('Use vertical local navigation');
  assert.equal(evaluate('getComputedStyle(document.querySelector(".mt-navigation-menu-list")).flexDirection'),'column');
  browser('focus','[data-destination-trigger]'); browser('press','ArrowDown');
  assert.match(evaluate('document.activeElement.textContent'),/Related guides/);
  browser('press','ArrowRight'); browser('wait','.mt-navigation-menu-popup a[href="/components/tabs"]');
  browser('click','.mt-navigation-menu-popup a[href="/components/tabs"]');
  browser('wait','--fn','location.pathname === "/components/tabs"');
  browser('back'); browser('wait','[data-destination-lab]');
  click('Restore local navigation layout');click('Use RTL local navigation');
  browser('focus','[data-destination-trigger]');browser('press','ArrowLeft');
  assert.match(evaluate('document.activeElement.textContent'),/Related guides/);
  browser('press','ArrowDown');browser('wait','.mt-navigation-menu-popup');
  assert.equal(evaluate('document.querySelector(".mt-navigation-menu-popup").dir'),'rtl');
});

test('breadcrumbs expose ancestry links current page and hidden separators with narrow RTL wrapping', () => {
  open('/components/breadcrumbs','[data-breadcrumb-lab]');
  assert.deepEqual(evaluate(`(() => {const n=document.querySelector('[aria-label="Navigation documentation path"]');return [n.tagName,n.querySelector('ol').tagName,n.querySelectorAll('li').length,n.querySelectorAll('a').length,n.querySelector('[aria-current=page]').tagName];})()`),['NAV','OL',3,2,'SPAN']);
  assert.ok(evaluate('[...document.querySelectorAll(".mt-breadcrumbs-separator")].every(n=>n.getAttribute("aria-hidden")==="true")'));
  click('Use long breadcrumb labels'); click('Use RTL local breadcrumbs'); click('Use slash breadcrumb separator');
  browser('set','viewport','320','640');
  assert.ok(evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
  assert.ok(evaluate('[...document.querySelectorAll("[data-breadcrumb-lab] a")].every(n=>n.getBoundingClientRect().height>=44)'));
  assert.equal(evaluate(`document.querySelector('[data-breadcrumb-lab] a[href="/patterns/navigation"]').getAttribute('href')`),'/patterns/navigation');
  browser('click','[data-breadcrumb-lab] a[href="/patterns/navigation"]');
  browser('wait','--fn','location.pathname === "/patterns/navigation"');
  browser('set','viewport','1280','900');
});

test('local pagination separates requested and loaded records and never submits its enclosing form', () => {
  open('/components/pagination','[data-pagination-lab]');
  assert.equal(currentPage(),'1'); click('Local page 2');
  assert.equal(currentPage(),'1'); assert.match(localRecords(),/local record 1/); assert.doesNotMatch(localRecords(),/local record 5/);
  assert.ok(evaluate('[...document.querySelectorAll("[data-pagination-lab] nav button")].every(n=>n.disabled && n.type==="button")'));
  assert.equal(evaluate('document.activeElement.id'),'local-paging-heading');
  click('Complete local page load'); assert.equal(currentPage(),'2'); assert.match(localRecords(),/local record 5/); assert.doesNotMatch(localRecords(),/local record 1/);
  assert.doesNotMatch(status(),/Unexpected/);
  click('Local page 3'); click('Fail local page load'); assert.equal(currentPage(),'2'); assert.match(status(),/failed/);
  click('Retry requested local page'); click('Cancel local page load'); assert.equal(currentPage(),'2'); assert.match(status(),/cancelled/);
  click('Local page 5'); click('Complete local page load'); assert.equal(currentPage(),'5'); assert.match(localRecords(),/local record 17/);
  assert.equal(evaluate('document.querySelector("[data-local-page-records]").children.length'),1);
  assert.ok(evaluate(`document.querySelector('[data-pagination-lab] button[aria-label="Go to next page"]').disabled`));
});

test('empty and smaller collections reset current-page truth and preserve recoverability', () => {
  open('/components/pagination','[data-pagination-lab]');
  click('Toggle empty local collection'); assert.equal(currentPage(),null); assert.equal(localRecords(),''); assert.match(status(),/no page selected/);
  click('Toggle empty local collection'); click('Use small local collection'); assert.equal(currentPage(),'1');
  assert.equal(evaluate('document.querySelector("[data-local-page-records]").children.length'),3);
  assert.ok(evaluate(`document.querySelector('[data-pagination-lab] button[aria-label="Go to next page"]').disabled`));
  click('Use RTL local pagination'); assert.match(evaluate('getComputedStyle(document.querySelector("[data-pagination-lab] .mt-pagination-nav svg")).transform'),/matrix\(-1/);
});

test('addressable native page links retain query parameters and load real subsets through history', () => {
  open('/components/pagination?retained=example','[data-route-pagination-lab]');
  const selector='[data-route-pagination-lab] a[aria-label="Open route page 3"]';
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(selector)}).tagName`),'A');
  assert.match(evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('href')`),/retained=example&demoPage=3#routed-local-results/);
  browser('scrollintoview',selector); browser('click',selector); browser('wait','--fn','document.querySelector("[data-route-page]")?.textContent.includes("page 3 of 5")');
  assert.match(evaluate('document.querySelector("[data-route-pagination-lab] ol").textContent'),/record 9/);
  assert.equal(evaluate('document.querySelector("[data-route-pagination-lab] [aria-current=page]").textContent'),'3');
  assert.equal(evaluate('location.hash'),'#routed-local-results');
  browser('back'); browser('wait','--fn','document.querySelector("[data-route-page]")?.textContent.includes("page 1 of 5")');
  open('/components/pagination?demoPage=5','[data-route-pagination-lab]');
  assert.equal(evaluate('document.querySelector("[data-route-pagination-lab] ol").children.length'),1);
  for (const query of ['0','999','unavailable']) {
    open(`/components/pagination?demoPage=${query}`,'[data-route-pagination-lab]');
    assert.match(evaluate('document.querySelector("[data-route-pagination-lab] [role=status]").textContent'),/invalid/);
    assert.equal(evaluate('document.querySelector("[data-route-pagination-lab] [aria-current=page]").textContent'),'1');
  }
});

test('destination guides reflow in both themes and expose readable current text focus and boundaries', () => {
  browser('set','viewport','320','640');
  const ratios = selector => evaluate(`(() => {
    const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
    const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
    const lum=color=>rgb(color).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    const page=getComputedStyle(document.documentElement).getPropertyValue('--color-background');
    const background=n=>{for(let p=n;p;p=p.parentElement){const color=getComputedStyle(p).backgroundColor;if(rgb(color)[3]===255)return color;}return page;};
    return [...document.querySelectorAll(${JSON.stringify(selector)})].map(n=>{const s=getComputedStyle(n);return {label:n.textContent,text:contrast(s.color,background(n)),border:contrast(s.borderTopColor,background(n.parentElement)),focus:contrast(s.outlineColor,background(n.parentElement))};});
  })()`);
  for (const theme of ['light','dark']) {
    open('/components/pagination','[data-pagination-lab]');
    evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));true`);
    for (const [path,lab] of [['/components/pagination','[data-pagination-lab]'],['/components/breadcrumbs','[data-breadcrumb-lab]'],['/components/navigation-menu','[data-destination-lab]']]) {
      open(path,lab);browser('wait',`html.${theme}`);
      assert.ok(evaluate('document.documentElement.scrollWidth <= innerWidth+1'),`${theme} ${path}`);
    }
    click('Local destinations');browser('wait','.mt-navigation-menu-popup');
    const bounds=evaluate('(() => {const r=document.querySelector(".mt-navigation-menu-popup").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()');
    assert.ok(bounds.left>=0 && bounds.right<=320 && bounds.top>=0 && bounds.bottom<=640,JSON.stringify(bounds));
    assert.ok(evaluate('[...document.querySelectorAll(".mt-navigation-menu-popup a")].every(n=>n.getBoundingClientRect().height>=44)'));
    for (const row of ratios('.mt-navigation-menu-popup a,.mt-navigation-menu-trigger:not([aria-disabled=true]),.mt-navigation-menu-link[aria-current=page]')) assert.ok(row.text>=4.5,`${theme} navigation ${row.label}: ${row.text}`);
    browser('focus','.mt-navigation-menu-popup a[href="#navigation-local-details"]');browser('press','ArrowUp');
    assert.ok(ratios('.mt-navigation-menu-popup a:focus')[0].focus>=3);
    assert.ok(evaluate('getComputedStyle(document.activeElement).outlineStyle !== "none" && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2'));
    browser('press','Escape');
    open('/components/pagination','[data-pagination-lab]');
    browser('scrollintoview','[data-pagination-lab] button[aria-label="Local page 2"]');browser('focus','[data-pagination-lab] button[aria-label="Local page 2"]');
    for (const row of ratios('[data-pagination-lab] .mt-pagination-btn:not(:disabled)')) {
      assert.ok(row.text>=4.5,`${theme} ${row.label}: ${row.text}`);assert.ok(row.border>=3,`${theme} boundary ${row.label}: ${row.border}`);
    }
    assert.ok(ratios('[data-pagination-lab] button:focus')[0].focus>=3);
    assert.ok(evaluate('getComputedStyle(document.activeElement).outlineStyle !== "none" && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2'));
    assert.ok(evaluate('[...document.querySelectorAll("[data-pagination-lab] .mt-pagination-btn")].every(n=>n.getBoundingClientRect().height>=44)'));
    open('/components/breadcrumbs','[data-breadcrumb-lab]');
    for (const row of ratios('[data-breadcrumb-lab] a,[data-breadcrumb-lab] [aria-current=page]')) assert.ok(row.text>=4.5,`${theme} breadcrumb ${row.label}: ${row.text}`);
  }
  browser('set','media','reduced-motion','reduce');
  open('/components/navigation-menu','[data-destination-lab]');
  assert.ok(evaluate('parseFloat(getComputedStyle(document.querySelector("[data-destination-trigger]")).transitionDuration)<=.00001'));
  browser('set','media','reduced-motion','no-preference');browser('set','viewport','1280','900');
});
