import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`styleguide-select-${process.pid}`;
const base=process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
function browser(...args){if(args[0]==='eval')new Function(args[1]);if(args[0]==='wait'&&args[1]==='--fn')new Function(`return (${args[2]});`);const result=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,killSignal:'SIGKILL'}));assert.equal(result.success,true,result.error);return result.data;}
const evaluate=script=>browser('eval',script).result;
function open(){browser('open',base+'/components/select');browser('wait','[data-select-lab]');browser('wait','--fn','document.documentElement.matches(".light,.dark")');}
function click(label){evaluate(`(() => {const n=[...document.querySelectorAll('[data-select-lab] button')].find(n=>n.textContent===${JSON.stringify(label)});document.querySelectorAll('[data-select-driver]').forEach(n=>n.removeAttribute('data-select-driver'));n.setAttribute('data-select-driver','');n.scrollIntoView({block:'center'});return true;})()`);browser('click','[data-select-driver]');}
function choose(id,label){browser('scrollintoview',id);browser('click',id);browser('wait','.mt-select-positioner:not([hidden]) [role=option]');evaluate(`(() => {document.querySelectorAll('[data-select-option-driver]').forEach(n=>n.removeAttribute('data-select-option-driver'));const n=[...document.querySelectorAll('.mt-select-positioner:not([hidden]) [role=option]')].find(n=>n.textContent.trim()===${JSON.stringify(label)});n.setAttribute('data-select-option-driver','');n.scrollIntoView({block:'center'});return true;})()`);browser('click','[data-select-option-driver]');if(id==='#select-collection-trigger')browser('press','Escape');browser('wait','--fn','!document.querySelector(".mt-select-positioner:not([hidden])")');}
const entries=()=>evaluate('Array.from(new FormData(document.querySelector("[data-select-lab] form")).entries())');
after(()=>{try{browser('close');}catch{}});

test('required correction names the actual trigger and keyboard selection changes the real display',()=>{
  open();click('Submit local select preferences');assert.match(evaluate('document.querySelector("[role=alert]").textContent'),/Choose reading spacing/);assert.equal(evaluate('document.activeElement.id'),'select-spacing-trigger');
  assert.equal(evaluate('document.querySelector("#select-spacing-trigger").getAttribute("aria-labelledby")'),'select-spacing-label');
  browser('press','ArrowDown');browser('wait','.mt-select-positioner:not([hidden]) [role=option]');browser('press','End');assert.equal(evaluate('document.activeElement.getAttribute("aria-disabled")'),'true');browser('press','Enter');assert.equal(evaluate('document.querySelector("#select-spacing-trigger").getAttribute("aria-expanded")'),'true');browser('press','ArrowUp');browser('press','Enter');browser('wait','--fn','!document.querySelector(".mt-select-positioner:not([hidden])")');
  assert.match(evaluate('document.querySelector("#select-spacing-trigger").textContent'),/Compact reading/);assert.deepEqual(entries(),[['spacing','compact']]);
  assert.equal(evaluate('document.activeElement.id'),'select-spacing-trigger');
});

test('multiple values serialize separately and disabled values are omitted then restored without data loss',()=>{
  open();choose('#select-spacing-trigger','Roomy reading');choose('#select-collection-trigger','Local examples');choose('#select-collection-trigger','Local notes');
  assert.deepEqual(entries(),[['spacing','roomy'],['collection','examples'],['collection','notes']]);
  assert.match(evaluate('document.querySelector("#select-collection-trigger").textContent'),/Local examples, Local notes/);
  click('Disable local selectors');assert.deepEqual(entries(),[]);assert.ok(evaluate('document.querySelector("#select-spacing-trigger").disabled'));
  click('Restore editable local selectors');assert.deepEqual(entries(),[['spacing','roomy'],['collection','examples'],['collection','notes']]);
  click('Make local selectors read only');browser('focus','#select-spacing-trigger');browser('press','Enter');assert.equal(evaluate('document.querySelector("#select-spacing-trigger").getAttribute("aria-expanded")'),'false');assert.equal(entries().length,3);
});

test('pending failure cancellation and completion preserve drafts and change actual preview only on completion',()=>{
  open();choose('#select-spacing-trigger','Compact reading');choose('#select-collection-trigger','Local notes');click('Submit local select preferences');
  assert.match(evaluate('document.querySelector("[data-select-loaded]").textContent'),/roomy.*examples/);assert.match(evaluate('document.querySelector("[data-select-payload]").textContent'),/compact.*notes/);
  click('Fail local select preferences');assert.match(evaluate('document.querySelector("[data-select-status]").textContent'),/failed/);assert.equal(evaluate('document.activeElement.hasAttribute("data-select-preview-heading")'),true);
  click('Submit local select preferences');click('Cancel local select preferences');assert.match(evaluate('document.querySelector("[data-select-status]").textContent'),/cancelled/);
  click('Submit local select preferences');click('Complete local select preferences');assert.match(evaluate('document.querySelector("[data-select-records]").textContent'),/local notes record/);assert.equal(evaluate('getComputedStyle(document.querySelector("[data-select-records]")).lineHeight'),'22.4px');
  click('Clear local select choices');assert.match(evaluate('document.querySelector("#select-spacing-trigger").textContent'),/Choose local reading spacing/);assert.deepEqual(entries(),[['spacing','']]);
});

test('unavailable items reject pointer activation and retain the real current choice',()=>{
  open();choose('#select-spacing-trigger','Roomy reading');browser('click','#select-spacing-trigger');browser('wait','.mt-select-positioner:not([hidden]) [role=option][aria-disabled=true]');
  assert.ok(evaluate('document.querySelector(".local-spacing-open") !== null'));
  browser('click','.mt-select-positioner:not([hidden]) [role=option][aria-disabled=true]');browser('press','Escape');
  assert.deepEqual(entries(),[['spacing','roomy']]);
});

test('empty applied collections have real recovery and retain the required selected spacing',()=>{
  open();choose('#select-spacing-trigger','Roomy reading');click('Submit local select preferences');click('Complete local select preferences');
  assert.equal(evaluate('document.querySelector("[data-select-records]").children.length'),0);assert.match(evaluate('document.querySelector("[data-select-lab]").textContent'),/No local collections selected/);
  choose('#select-collection-trigger','Local references');click('Submit local select preferences');click('Complete local select preferences');assert.match(evaluate('document.querySelector("[data-select-records]").textContent'),/local references record/);
});

test('both themes narrow geometry RTL and target sizes remain usable',()=>{
  browser('set','viewport','320','640');
  for(const theme of ['light','dark']){open();evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));true`);open();browser('wait',`html.${theme}`);click('Use RTL local selectors');browser('scrollintoview','#select-spacing-trigger');browser('click','#select-spacing-trigger');browser('wait','.mt-select-positioner:not([hidden]) [role=option]');
    browser('wait','--fn','(() => {const r=document.querySelector(".mt-select-popup").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight+1;})()');
    assert.equal(evaluate('document.querySelector(".mt-select-popup").dir'),'rtl');assert.ok(evaluate('[...document.querySelectorAll(".mt-select-item")].every(n=>n.getBoundingClientRect().height>=44)'));
    const ratios=evaluate(`(() => {const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});const rgb=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};const lum=c=>rgb(c).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const bg=n=>{for(let p=n;p;p=p.parentElement){const c=getComputedStyle(p).backgroundColor;if(rgb(c)[3]===255)return c;}return getComputedStyle(document.documentElement).getPropertyValue('--color-background');};return [...document.querySelectorAll('.mt-select-item:not([data-disabled]),.mt-select-group-label,#select-spacing-trigger')].map(n=>{const a=lum(getComputedStyle(n).color),b=lum(bg(n));return {label:n.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});})()`);
    for(const row of ratios)assert.ok(row.ratio>=4.5,`${theme} ${row.label}: ${row.ratio}`);
    browser('press','Escape');assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  }
  browser('set','viewport','1400','1000');
});
