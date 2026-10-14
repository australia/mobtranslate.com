import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`mobtranslate-spacing-${process.pid}`,base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
function browser(...args){let output;try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}catch(error){throw new Error(error.stdout?.toString()||error.message);}const r=JSON.parse(output);assert.equal(r.success,true,r.error);return r.data;}
const evaluate=code=>browser('eval',code).result;
const style=property=>evaluate(`getComputedStyle(document.querySelector('[data-spacing-preview]')).${property}`);
function open(width=1440){browser('set','viewport',String(width),'1000');browser('open',`${base}/foundations/spacing`);browser('wait','--fn','document.querySelector("[data-spacing-measured]").textContent.includes("CSS px")');}
function toggle(selector){browser('focus',selector);browser('press','Space');}
function select(name,value){browser('select',`[data-spacing-control=${name}]`,value);}
after(()=>browser('close'));
test('padding, gap, margin and density remain independent; logical sides reverse',()=>{
 open();select('gap','--spacing-12');select('leading','--spacing-2');select('trailing','--spacing-6');select('margin','--spacing-3');
 assert.equal(style('gap'),'48px');assert.equal(style('paddingLeft'),'8px');assert.equal(style('paddingRight'),'24px');assert.equal(style('marginInlineStart'),'12px');
 toggle('[data-spacing-density]');assert.equal(style('paddingBlockStart'),'8px');assert.equal(style('gap'),'48px');assert.equal(style('paddingInlineEnd'),'24px');
 browser('focus','[data-spacing-action]');browser('press','Enter');assert.equal(evaluate('document.querySelector("[data-spacing-action]").getAttribute("aria-pressed")'),'true');
 toggle('[data-spacing-rtl]');assert.equal(style('paddingLeft'),'24px');assert.equal(style('paddingRight'),'8px');assert.equal(style('paddingInlineStart'),'8px');assert.equal(evaluate('document.querySelector("[data-spacing-action]").getAttribute("aria-pressed")'),'true');
 assert.ok(evaluate('Array.from(document.querySelectorAll("[data-spacing-preview] button")).every(b=>b.getBoundingClientRect().height>=44)'));
});
test('local text growth preserves distances; oversized combinations stay in the scroll region',()=>{
 open(320);toggle('[data-spacing-long]');const gap=style('gap'),padding=style('paddingInlineStart');const height=evaluate('document.querySelector("[data-spacing-action]").getBoundingClientRect().height');
 browser('select','[data-spacing-scale]','200');assert.equal(style('gap'),gap);assert.equal(style('paddingInlineStart'),padding);assert.equal(style('fontSize'),'32px');assert.ok(evaluate('document.querySelector("[data-spacing-action]").getBoundingClientRect().height')>height);
 for(const theme of ['light','dark']){evaluate(`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'))`);browser('wait',`html.${theme}`);assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));}
 for(const name of ['leading','trailing','margin','gap'])select(name,'--spacing-24');evaluate('document.documentElement.style.fontSize="200%"');
 assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));assert.ok(evaluate('document.querySelector(".spacing-page-boundary").scrollWidth>document.querySelector(".spacing-page-boundary").clientWidth'));
 browser('focus','[data-spacing-action]');assert.ok(evaluate('document.activeElement===document.querySelector("[data-spacing-action]")'));assert.ok(evaluate('document.querySelector("[data-spacing-action]").getBoundingClientRect().height>=44'));
});
test('live inherited token overrides update real geometry and measured readout',()=>{
 open();evaluate('document.documentElement.style.setProperty("--spacing-4","20px")');browser('wait','--fn','document.querySelector("[data-spacing-measured]").textContent.includes("20px")');assert.equal(style('gap'),'20px');assert.equal(style('paddingInlineStart'),'20px');
 const readout=evaluate('Object.fromEntries(Array.from(document.querySelectorAll("[data-spacing-measured] div")).map(row=>[row.querySelector("dt").textContent,row.querySelector("dd").textContent]))');assert.equal(readout.gap,'20px');assert.equal(readout.leading,'20px');
 assert.ok(evaluate('Array.from(document.querySelectorAll("[data-spacing-preview] button")).every(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>=44})'));
});
