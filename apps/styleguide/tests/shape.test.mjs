import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`mobtranslate-shape-${process.pid}`,base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
function browser(...args){const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}}));assert.equal(r.success,true,r.error);return r.data;}
const evaluate=code=>browser('eval',code).result;
function open(width=1440){browser('set','viewport',String(width),'1000');browser('open',`${base}/foundations/shape`);browser('wait','[data-shape-lab]');}
function toggle(selector){browser('focus',selector);browser('press','Space');}
function settle(property,value){browser('wait','--fn',`getComputedStyle(document.querySelector('[data-shape-surface]')).${property}===${JSON.stringify(value)}`);}
before(()=>browser('set','media','light'));
after(()=>browser('close'));

test('actual tokens, logical direction and retained base corners drive CSS',()=>{
  open();const root=evaluate('getComputedStyle(document.documentElement).getPropertyValue("--radius-md")');
  toggle('[data-shape-individual]');browser('select','[data-shape-corner=borderStartStartRadius]','--radius-none');browser('select','[data-shape-corner=borderStartEndRadius]','--radius-2xl');
  settle('borderTopLeftRadius','0px');settle('borderTopRightRadius','32px');toggle('[data-shape-rtl]');settle('borderTopLeftRadius','32px');settle('borderTopRightRadius','0px');
  browser('select','[data-shape-alternate]','--radius-sm');browser('focus','[data-shape-toggle]');browser('press','Enter');settle('borderTopLeftRadius','4px');
  assert.equal(evaluate('document.querySelector("[data-shape-toggle]").getAttribute("aria-pressed")'),'true');
  browser('select','[data-shape-corner=borderStartStartRadius]','--radius-md');browser('press','Tab');browser('focus','[data-shape-toggle]');browser('press','Enter');settle('borderTopRightRadius','8px');settle('borderTopLeftRadius','32px');
  assert.equal(evaluate('getComputedStyle(document.documentElement).getPropertyValue("--radius-md")'),root);
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-shape-surface]")).overflow'),'visible');
});

test('native corner transitions interrupt toward the latest state and reduced motion stays functional',()=>{
  open();evaluate('document.querySelector("[data-shape-surface]").style.transitionDuration="1s"');
  browser('focus','[data-shape-toggle]');browser('press','Enter');assert.ok(evaluate('document.querySelector("[data-shape-surface]").getAnimations().length>0'));
  browser('press','Enter');settle('borderTopLeftRadius','16px');assert.equal(evaluate('document.querySelector("[data-shape-toggle]").getAttribute("aria-pressed")'),'false');
  browser('select','[data-shape-alternate]','--radius-full');browser('focus','[data-shape-toggle]');
  browser('set','media','light','reduced-motion');assert.equal(evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'),true);
  browser('press','Enter');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-shape-surface]")).transitionProperty'),'none');settle('borderTopLeftRadius','9999px');
  assert.equal(evaluate('document.querySelector("[data-shape-surface]").getAnimations().length'),0);
  browser('set','media','light');
});

test('nested geometry and cut/round area agree with independent reference cases',()=>{
  open();assert.equal(evaluate('document.querySelector("[data-shape-inner]").getAttribute("rx")'),'34');
  browser('focus','[data-shape-outer-input]');browser('press','End');browser('focus','[data-shape-padding-input]');browser('press','End');
  assert.equal(evaluate('document.querySelector("[data-shape-inner]").getAttribute("rx")'),'32');assert.equal(evaluate('document.querySelector("[data-shape-inner]").getAttribute("width")'),'120');
  assert.ok(evaluate('document.querySelector("[data-shape-cut]").getAttribute("d").includes("72 8")'));
  assert.ok(evaluate('document.querySelector("[data-shape-area]").textContent.includes("8192.00")'));
  browser('focus','[data-shape-outer-input]');browser('press','Home');assert.equal(evaluate('document.querySelector("[data-shape-inner]").getAttribute("rx")'),'0');
  assert.ok(evaluate('document.querySelector("[data-shape-optical]").textContent.includes("inner corner is square")'));
});

test('disclosure, exported CSS and enlarged narrow layouts remain readable in both themes',()=>{
  open(320);toggle('[data-shape-individual]');browser('focus','[data-shape-css] summary');browser('press','Enter');
  assert.ok(evaluate('document.querySelector("[data-shape-css] code").textContent.includes("border-start-start-radius")'));
  browser('focus','[data-shape-surface] summary');browser('press','Enter');assert.ok(evaluate('document.querySelector("[data-shape-surface] details").open'));
  for(const theme of ['light','dark']){evaluate(`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'));`);browser('wait',`html.${theme}`);assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));}
  evaluate('document.documentElement.style.fontSize="200%"');assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
  assert.ok(evaluate('document.querySelector("[data-shape-toggle]").getBoundingClientRect().height>=44&&document.querySelector("[data-shape-toggle]").getBoundingClientRect().right<=innerWidth'));
  assert.ok(evaluate('document.querySelector("[data-shape-lab] svg").getBoundingClientRect().right<=innerWidth'));
});
