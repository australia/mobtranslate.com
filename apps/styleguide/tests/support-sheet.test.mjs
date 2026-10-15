
import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`styleguide-support-sheet-${process.pid}`;
function browser(...args){if(args[0]==='eval')new Function(args[1]);if(args[0]==='wait'&&args[1]==='--fn')new Function(`return (${args[2]});`);const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,killSignal:'SIGKILL'}));assert.equal(r.success,true,r.error);return r.data;}
const evaluate=s=>browser('eval',s).result;
function open(){browser('open',(process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003')+'/components/drawer');browser('wait','[data-standard-sheet-lab]');browser('wait','--fn','document.documentElement.matches(".light,.dark")');}
function click(name){evaluate(`(()=>{document.querySelectorAll('[data-sheet-driver]').forEach(n=>n.removeAttribute('data-sheet-driver'));const n=[...document.querySelectorAll('[data-standard-sheet-lab] button')].find(n=>n.textContent===${JSON.stringify(name)});if(!n)throw Error('Missing panel action');n.setAttribute('data-sheet-driver','');n.scrollIntoView({block:'center'});return true;})()`);browser('click','[data-sheet-driver]');}
const ids=()=>evaluate('[...document.querySelectorAll("[data-standard-record]")].map(n=>n.dataset.standardRecord)');
const panel=()=>{click('Open filters');browser('wait','--fn','document.activeElement.id==="standard-support-heading"');};
after(()=>{try{browser('close');}catch{}});

test('standard panel coexists with primary editing and applies actual records while cancel retains the applied filter',()=>{
 browser('set','viewport','1400','1000');open();panel();assert.equal(evaluate('document.querySelectorAll("[role=dialog]").length'),0);
 browser('fill','#standard-sheet-draft','Primary editing remains available');assert.deepEqual(ids(),['reading','comparison','recovery']);
 browser('focus','[data-standard-sheet-filter]');browser('press','Space');assert.equal(ids().length,3);click('Apply filters');assert.deepEqual(ids(),['reading','recovery']);
 assert.equal(evaluate('document.querySelector("#standard-sheet-draft").value'),'Primary editing remains available');assert.ok(evaluate('!!document.querySelector("[data-standard-support-panel]")'));
 click('Close panel');assert.equal(evaluate('document.activeElement.textContent'),'Open filters');panel();assert.equal(evaluate('document.querySelector("[data-standard-sheet-filter]").checked'),true);
 browser('focus','[data-standard-sheet-filter]');browser('press','Space');click('Close panel');panel();assert.equal(evaluate('document.querySelector("[data-standard-sheet-filter]").checked'),true);assert.deepEqual(ids(),['reading','recovery']);
});

test('height cycle changes the real region footprint without remounting task state and native keyboard scroll stays local',()=>{
 open();panel();evaluate('window.originalPanel=document.querySelector("[data-standard-support-panel]");true');const heights=[];
 for(let index=0;index<4;index++){heights.push(evaluate('document.querySelector("[data-standard-support-panel]").getBoundingClientRect().height'));if(index<3)click('Cycle height');}
 assert.deepEqual(heights,[256,384,512,256]);assert.equal(evaluate('window.originalPanel===document.querySelector("[data-standard-support-panel]")'),true);
 browser('scrollintoview','[data-standard-support-panel]');browser('focus','[data-standard-support-panel]');const body=evaluate('scrollY');browser('press','PageDown');browser('wait','--fn','document.querySelector("[data-standard-support-panel]").scrollTop>0');assert.equal(evaluate('scrollY'),body);
});

test('standard panel reflows to the logical trailing side and then below content without losing the active control',()=>{
 browser('set','viewport','1400','1000');open();panel();
 assert.equal(evaluate('getComputedStyle(document.querySelector("[data-standard-sheet-shell]")).display'),'grid');
 assert.ok(evaluate('document.querySelector("[data-standard-support-panel]").getBoundingClientRect().left>document.querySelector("[data-standard-sheet-primary]").getBoundingClientRect().right'));
 click('Use RTL panel');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-standard-support-panel] p")).direction'),'ltr');assert.ok(evaluate('document.querySelector("[data-standard-support-panel]").getBoundingClientRect().right<document.querySelector("[data-standard-sheet-primary]").getBoundingClientRect().left'));
 browser('focus','[data-standard-sheet-filter]');browser('set','viewport','320','640');
 browser('wait','--fn','getComputedStyle(document.querySelector("[data-standard-sheet-shell]")).display==="flex"');
 assert.equal(evaluate('document.activeElement.matches("[data-standard-sheet-filter]")'),true);
 assert.ok(evaluate('document.querySelector("[data-standard-support-panel]").getBoundingClientRect().top>=document.querySelector("[data-standard-sheet-primary]").getBoundingClientRect().bottom'));
 assert.equal(evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
});

test('both themes at doubled root text retain actual primary and panel tasks with keyboard close recovery',()=>{
 browser('set','viewport','320','640');for(const theme of ['light','dark']){
  open();evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));document.documentElement.style.fontSize='200%';true`);browser('wait',`html.${theme}`);panel();
  browser('fill','#standard-sheet-draft','Retained narrow primary draft');browser('focus','[data-standard-sheet-filter]');browser('press','Space');browser('press','Tab');assert.equal(evaluate('document.activeElement.textContent'),'Apply filters');browser('press','Enter');assert.deepEqual(ids(),['reading','recovery']);
  browser('focus','[data-standard-support-panel]');browser('press','Tab');assert.equal(evaluate('document.activeElement.textContent'),'Close panel');browser('press','Enter');assert.equal(evaluate('document.activeElement.textContent'),'Open filters');
  assert.equal(evaluate('document.querySelector("#standard-sheet-draft").value'),'Retained narrow primary draft');assert.equal(evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
 }browser('set','viewport','1400','1000');
});
