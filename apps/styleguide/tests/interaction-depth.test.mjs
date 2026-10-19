import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),session=`mobtranslate-interaction-depth-${process.pid}`,base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
function run(args,input){let output;try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',input,maxBuffer:20*1024*1024,timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}catch(error){throw new Error(error.stdout?.toString()||error.message);}const r=JSON.parse(output);assert.equal(r.success,true,r.error);return r.data;}
const browser=(...args)=>run(args),evaluate=code=>run(['eval','--stdin'],code).result;
function open(path,width=1440){browser('set','viewport',String(width),'1000');browser('open',base+path);browser('wait','main h1');browser('wait','--fn','document.documentElement.matches(".light,.dark")');}
function press(selector){browser('focus',selector);browser('press','Enter');}
function clickTable(text){evaluate(`(() => {const node=Array.from(document.querySelectorAll('[data-table-lab] button')).find(n=>n.textContent===${JSON.stringify(text)});if(!node)throw Error('Missing table action');document.querySelectorAll('[data-table-driver]').forEach(n=>n.removeAttribute('data-table-driver'));node.setAttribute('data-table-driver','');})()`);press('[data-table-driver]');}
const order=()=>evaluate('Array.from(document.querySelectorAll("[data-item-id]")).map(n=>n.dataset.itemId)');
function drag(id,type){evaluate(`document.querySelector('[data-item-id=${id}]').dispatchEvent(new DragEvent('${type}',{bubbles:true,cancelable:true,dataTransfer:window.dragData}))`);}
after(()=>browser('close'));
test('request failure is distinct from validation; outcomes retain text and restore focus',()=>{
 open('/foundations/interaction-states');browser('wait','[data-state-lab]');press('[data-state-submit]');browser('wait','--fn','document.querySelector("[data-state-lab] input:not([type=checkbox])").getAttribute("aria-invalid")==="true"');
 browser('fill','[data-state-lab] input:not([type=checkbox])','retained local query');press('[data-state-submit]');browser('wait','--fn','document.querySelector("[data-state-submit]").disabled');
 press('[data-state-outcome=error]');browser('wait','--fn','document.querySelector("[data-state-lab] [role=status]").textContent.includes("request failed")');
 assert.equal(evaluate('document.querySelector("[data-state-lab] input:not([type=checkbox])").value'),'retained local query');assert.equal(evaluate('document.querySelector("[data-state-lab] input:not([type=checkbox])").getAttribute("aria-invalid")'),'false');assert.ok(evaluate('document.activeElement===document.querySelector("[data-state-lab] input:not([type=checkbox])")'));
 press('[data-state-submit]');press('[data-state-outcome=cancelled]');browser('wait','--fn','document.querySelector("[data-state-lab] [role=status]").textContent.includes("cancelled")');assert.ok(evaluate('document.activeElement===document.querySelector("[data-state-lab] input:not([type=checkbox])")'));
 assert.equal(evaluate('document.querySelector("[data-state-lab] input:not([type=checkbox])").value'),'retained local query');
});
test('native drag event handlers expose one moving item, cancel safely and match button ordering',()=>{
 open('/foundations/input-gestures',320);browser('wait','[data-reorder-lab]');const original=order();evaluate('window.dragData=new DataTransfer()');drag('entry','dragstart');browser('wait','[data-dragging]');
 assert.equal(evaluate('document.querySelectorAll("[data-dragging]").length'),1);assert.match(evaluate('document.querySelector("[data-reorder-status]").textContent'),/Moving Entry text/);assert.deepEqual(order(),original);
 const axe=readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');const report=evaluate(`${axe}\n;(async()=>{const r=await axe.run(document);return {scope:'Authored dragstart-handler state at 320px; synthetic native event, not physical gesture evidence',violations:r.violations,incomplete:r.incomplete,overflow:document.documentElement.scrollWidth>innerWidth}})()`);assert.deepEqual(report.violations,[]);assert.equal(report.overflow,false);if(process.env.STYLEGUIDE_INTERACTION_REPORT)writeFileSync(process.env.STYLEGUIDE_INTERACTION_REPORT,JSON.stringify(report,null,2)+'\n');
 drag('entry','dragend');browser('wait','--fn','!document.querySelector("[data-dragging]")');assert.deepEqual(order(),original);assert.match(evaluate('document.querySelector("[data-reorder-status]").textContent'),/cancelled/);
 drag('entry','dragstart');browser('wait','[data-dragging]');drag('review','drop');drag('entry','dragend');browser('wait','--fn','document.querySelector("[data-reorder-status]").textContent.includes("position 3")');const dropped=order();assert.deepEqual(dropped,['source','review','entry']);
 press('[data-reorder-lab] > button');press('button[aria-label="Move Entry text down"]');press('button[aria-label="Move Entry text down"]');assert.deepEqual(order(),dropped);assert.ok(evaluate('document.activeElement.closest("li").dataset.itemId==="entry"'));
});
test('selection guide runs the actual page aggregate and preserves completed snapshot',()=>{
 open('/patterns/selection');browser('wait','[data-table-lab]');browser('find','role','checkbox','click','--name','Select visible page','--exact');assert.match(evaluate('document.querySelector("[data-table-status]").textContent'),/3 selected/);
 browser('find','role','button','click','--name','Collection page 2','--exact');assert.match(evaluate('document.querySelector("[data-table-status]").textContent'),/3 outside this page/);clickTable('Create local selection summary');const snapshot=evaluate('document.querySelector("[data-table-bundle]").textContent');assert.match(snapshot,/Actual local summary snapshot/);
 clickTable('Clear all collection selections');assert.match(evaluate('document.querySelector("[data-table-status]").textContent'),/0 selected/);assert.equal(evaluate('document.querySelector("[data-table-bundle]").textContent'),snapshot);
});
test('all compared guides retain usable controls at 320px and 200% root text in both themes',()=>{
 for(const path of ['/foundations/interaction-states','/foundations/input-gestures','/patterns/selection']){open(path,320);if(path.endsWith('interaction-states')){browser('fill','[data-state-lab] input:not([type=checkbox])','local query');press('[data-state-submit]');browser('wait','[data-state-outcome=error]');}
 for(const theme of ['light','dark']){evaluate(`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'))`);browser('wait',`html.${theme}`);evaluate('document.documentElement.style.fontSize="200%"');evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'),`${path} ${theme}`);}
 }
});
