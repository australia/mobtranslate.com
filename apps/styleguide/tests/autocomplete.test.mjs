import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`styleguide-autocomplete-${process.pid}`;
const base=process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
function browser(...args){if(args[0]==='eval')new Function(args[1]);if(args[0]==='wait'&&args[1]==='--fn')new Function(`return (${args[2]});`);const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,killSignal:'SIGKILL'}));assert.equal(r.success,true,r.error);return r.data;}
const evaluate=s=>browser('eval',s).result;
function open(){browser('open',base+'/components/autocomplete');browser('wait','[data-autocomplete-lab]');browser('wait','--fn','document.documentElement.matches(".light,.dark")');}
function click(text){evaluate(`(() => {document.querySelectorAll('[data-ac-driver]').forEach(n=>n.removeAttribute('data-ac-driver'));const n=[...document.querySelectorAll('[data-autocomplete-lab] button')].find(n=>n.textContent===${JSON.stringify(text)});n.setAttribute('data-ac-driver','');n.scrollIntoView({block:'center'});return true;})()`);browser('click','[data-ac-driver]');}
const entries=()=>evaluate('Array.from(new FormData(document.querySelector("[data-autocomplete-lab] form")).entries())');
after(()=>{try{browser('close');}catch{}});

test('controlled restoration clearing and free text reflect actual native field values',()=>{
  open();click('Restore external local text');assert.equal(evaluate('document.querySelector("#autocomplete-local-note").value'),'Restored external local text');
  click('Clear local suggestion text');assert.equal(evaluate('document.querySelector("#autocomplete-local-note").value'),'');
  browser('fill','#autocomplete-local-note','An arbitrary English-only note');browser('wait','.mt-autocomplete-empty');assert.match(evaluate('document.querySelector(".mt-autocomplete-empty").textContent'),/No matching/);browser('press','Escape');assert.equal(entries()[0][1],'An arbitrary English-only note');
});

test('keyboard and pointer acceptance update text and actual option metadata without submitting',()=>{
  open();browser('fill','#autocomplete-local-note','reading');browser('press','ArrowDown');
  browser('wait','--fn','document.querySelector("#autocomplete-local-note").hasAttribute("aria-activedescendant")');
  assert.equal(evaluate('document.activeElement.id'),'autocomplete-local-note');assert.ok(evaluate('document.getElementById(document.activeElement.getAttribute("aria-activedescendant")) !== null'));
  browser('press','Enter');browser('wait','--fn','document.querySelector("#autocomplete-local-note").value==="Local reading notes"');
  assert.match(evaluate('document.querySelector("[data-autocomplete-metadata]").textContent'),/reading/);assert.match(evaluate('document.querySelector("[data-autocomplete-payload]").textContent'),/No native form/);
  assert.equal(evaluate('document.querySelector("[data-autocomplete-accept-count]").textContent'),'1');
  browser('fill','#autocomplete-local-note','saved');browser('wait','--fn','[...document.querySelectorAll(".mt-autocomplete-item")].some(n=>n.textContent==="Local saved examples")');browser('click','.mt-autocomplete-item');browser('wait','--fn','document.querySelector("#autocomplete-local-note").value==="Local saved examples"');
  assert.match(evaluate('document.querySelector("[data-autocomplete-metadata]").textContent'),/saved/);assert.equal(entries()[0][1],'Local saved examples');
  assert.equal(evaluate('document.querySelector("[data-autocomplete-accept-count]").textContent'),'2');
  browser('click','#autocomplete-local-note');browser('wait','.mt-autocomplete-item');browser('click','.mt-autocomplete-item');
  browser('wait','--fn','document.querySelector("[data-autocomplete-accept-count]").textContent==="3"');
  assert.equal(evaluate('document.querySelector("#autocomplete-local-note").value'),'Local saved examples');
});

test('drag-release acceptance reports the actual option exactly once after inserting its text',()=>{
  open();browser('fill','#autocomplete-local-note','Local');browser('wait','.mt-autocomplete-item');
  const center=selector=>evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  const input=center('#autocomplete-local-note'),item=center('.mt-autocomplete-item');
  browser('mouse','move',String(input.x),String(input.y));browser('mouse','down','left');browser('mouse','move',String(item.x),String(item.y));browser('wait','--fn','document.querySelector(".mt-autocomplete-item").hasAttribute("data-highlighted")');browser('mouse','up','left');
  browser('wait','--fn','document.querySelector("#autocomplete-local-note").value==="Local workspace overview"');
  assert.match(evaluate('document.querySelector("[data-autocomplete-metadata]").textContent'),/overview/);assert.equal(evaluate('document.querySelector("[data-autocomplete-accept-count]").textContent'),'1');
});

test('two instances have independent text list ids and valid active descendants',()=>{
  open();browser('fill','#autocomplete-local-note','reading');browser('press','ArrowDown');const first=evaluate('document.querySelector("#autocomplete-local-note").getAttribute("aria-controls")');
  browser('fill','#autocomplete-independent','saved');browser('press','ArrowDown');const second=evaluate('document.querySelector("#autocomplete-independent").getAttribute("aria-controls")');
  assert.ok(first && second && first!==second);assert.equal(evaluate('document.querySelector("#autocomplete-local-note").value'),'reading');assert.equal(evaluate('document.querySelector("#autocomplete-independent").value'),'saved');
  assert.ok(evaluate('document.getElementById(document.querySelector("#autocomplete-independent").getAttribute("aria-activedescendant")) !== null'));
  const ids=evaluate('Array.from(document.querySelectorAll("[id]")).map(n=>n.id)');assert.equal(ids.length,new Set(ids).size);
});

test('disabled read-only and unavailable suggestions reject editing or activation with truthful form semantics',()=>{
  open();browser('fill','#autocomplete-local-note','Reviewed');browser('wait','.mt-autocomplete-item[aria-disabled=true]');browser('click','.mt-autocomplete-item[aria-disabled=true]');assert.equal(evaluate('document.querySelector("#autocomplete-local-note").value'),'Reviewed');browser('press','Escape');
  click('Make local suggestion inputs read only');browser('focus','#autocomplete-local-note');browser('press','ArrowDown');assert.equal(evaluate('document.querySelector("#autocomplete-local-note").getAttribute("aria-expanded")'),'false');assert.equal(entries()[0][1],'Reviewed');
  click('Disable local suggestion inputs');assert.deepEqual(entries(),[]);click('Restore external local text');assert.equal(entries()[0][1],'Restored external local text');
});

test('native submitted text has real pending failure cancellation retry and completion effects',()=>{
  open();click('Submit local suggestion text');assert.ok(evaluate('document.querySelector("[role=alert]") !== null'));assert.equal(evaluate('document.activeElement.id'),'autocomplete-local-note');
  browser('fill','#autocomplete-local-note','A submitted local draft');browser('press','Escape');click('Submit local suggestion text');assert.match(evaluate('document.querySelector("[data-autocomplete-loaded]").textContent'),/initial/);assert.match(evaluate('document.querySelector("[data-autocomplete-payload]").textContent'),/A submitted local draft/);
  click('Fail local suggestion text');assert.match(evaluate('document.querySelector("[data-autocomplete-status]").textContent'),/failed/);assert.equal(evaluate('document.querySelector("#autocomplete-local-note").value'),'A submitted local draft');
  click('Submit local suggestion text');click('Cancel local suggestion text');assert.match(evaluate('document.querySelector("[data-autocomplete-status]").textContent'),/cancelled/);
  click('Submit local suggestion text');click('Complete local suggestion text');assert.equal(evaluate('document.querySelector("[data-autocomplete-loaded]").textContent'),'A submitted local draft');assert.ok(evaluate('document.activeElement.hasAttribute("data-autocomplete-heading")'));
});

test('narrow RTL popup bounds targets and both-theme text contrast are usable',()=>{
  browser('set','viewport','320','640');
  for(const theme of ['light','dark']){open();evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));true`);open();browser('wait',`html.${theme}`);click('Use RTL local suggestions');browser('fill','#autocomplete-local-note','Local');browser('wait','.mt-autocomplete-popup');
    browser('wait','--fn','(() => {const r=document.querySelector(".mt-autocomplete-popup").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight+1;})()');assert.equal(evaluate('document.querySelector(".mt-autocomplete-popup").dir'),'rtl');assert.ok(evaluate('[...document.querySelectorAll(".mt-autocomplete-item")].every(n=>n.getBoundingClientRect().height>=44)'));
    assert.equal(evaluate('document.querySelector(".mt-autocomplete-empty").getBoundingClientRect().height'),0);assert.equal(evaluate('document.querySelector(".mt-autocomplete-empty").getAttribute("aria-live")'),'polite');
    const rows=evaluate(`(() => {const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});const rgb=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};const lum=c=>rgb(c).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const bg=n=>{for(let p=n;p;p=p.parentElement){const c=getComputedStyle(p).backgroundColor;if(rgb(c)[3]===255)return c;}return getComputedStyle(document.documentElement).getPropertyValue('--color-background');};return [...document.querySelectorAll('.mt-autocomplete-item:not([data-disabled]),#autocomplete-local-note')].map(n=>{const a=lum(getComputedStyle(n).color),b=lum(bg(n));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});})()`);for(const ratio of rows)assert.ok(ratio>=4.5,`${theme}: ${ratio}`);
    browser('press','Escape');assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  }browser('set','viewport','1400','1000');
});
