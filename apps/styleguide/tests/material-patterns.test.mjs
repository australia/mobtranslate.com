import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`material-patterns-${process.pid}`;
function browser(...args){if(args[0]==='eval')new Function(args[1]);if(args[0]==='wait'&&args[1]==='--fn')new Function(`return (${args[2]});`);let output;try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,killSignal:'SIGKILL'});}catch(error){throw new Error(`${args[0]} failed: ${error.stdout??''}`,{cause:error});}const r=JSON.parse(output);assert.equal(r.success,true,r.error);return r.data;}
const evaluate=s=>browser('eval',s).result;
function open(route,lab){browser('open',(process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003')+route);browser('wait',`[data-${lab}-lab]`);browser('wait','--fn','document.documentElement.matches(".light,.dark")');}
function click(text){evaluate(`(() => {document.querySelectorAll('[data-material-driver]').forEach(n=>n.removeAttribute('data-material-driver'));const n=[...document.querySelectorAll('main button')].find(n=>n.textContent===${JSON.stringify(text)});if(!n)throw Error('Missing control');n.setAttribute('data-material-driver','');n.scrollIntoView({block:'center'});return true;})()`);browser('click','[data-material-driver]');}
const menu=name=>{browser('wait','[role=menu]');return browser('find','role','menuitem','click','--name',name,'--exact');};
const action=name=>browser('find','role','button','click','--name',name,'--exact');
const fab=()=>{browser('scrollintoview','#action-fab-trigger');browser('click','#action-fab-trigger');};
after(()=>{try{browser('close');}catch{}});
test('split alternatives run once and become the actual next primary command',()=>{
  open('/patterns/action-groups','action-groups');browser('fill','#action-group-title','Actual comparison draft');click('More actions');menu('Add comparison draft');
  assert.equal(evaluate('document.querySelectorAll("[data-action-drafts] li").length'),1);assert.match(evaluate('document.querySelector("[data-action-drafts]").textContent'),/comparison: Actual comparison draft/);assert.equal(evaluate('document.querySelector("#action-primary").textContent'),'Add comparison draft');
  click('Add comparison draft');assert.equal(evaluate('document.querySelectorAll("[data-action-drafts] li").length'),2);
  assert.equal(evaluate('document.querySelectorAll("#action-split-trigger button,#action-fab-trigger button").length'),0);
});
test('FAB opens a real menu and Escape preserves drafts and restores launcher focus',()=>{
  open('/patterns/action-groups','action-groups');fab();browser('wait','[role=menu]');assert.equal(evaluate('document.querySelectorAll("[data-action-drafts] li").length'),0);
  browser('press','Escape');browser('wait','--fn','document.querySelector("[role=menu]")===null');assert.equal(evaluate('document.activeElement.id'),'action-fab-trigger');
  fab();menu('Add reading draft from FAB');assert.equal(evaluate('document.querySelectorAll("[data-action-drafts] li").length'),1);
  assert.ok(evaluate('document.querySelector("#action-fab-trigger").getBoundingClientRect().height>=56'));
});
test('invalid menu creation reaches the real linked field without a fabricated outcome',()=>{
  open('/patterns/action-groups','action-groups');browser('fill','#action-group-title','   ');click('More actions');menu('Add reading draft');browser('wait','--fn','document.activeElement.id==="action-group-title"');
  assert.equal(evaluate('document.querySelector("#action-group-title").getAttribute("aria-invalid")'),'true');assert.equal(evaluate('document.querySelectorAll("[data-action-drafts] li").length'),0);
  browser('fill','#action-group-title','Corrected local title');click('Add reading draft');assert.match(evaluate('document.querySelector("[data-action-drafts]").textContent'),/Corrected local title/);
});
test('pending creation gates duplicate launchers and applies only actual completion snapshots',()=>{
  open('/patterns/action-groups','action-groups');click('Hold local draft creation');click('More actions');menu('Add comparison draft');
  assert.ok(evaluate('[...document.querySelectorAll("#action-primary,#action-split-trigger,#action-fab-trigger")].every(n=>n.disabled)'));assert.equal(evaluate('document.querySelector("#action-group-title").readOnly'),true);
  browser('wait','--fn','document.activeElement.matches("[data-action-groups-status]")');assert.equal(evaluate('document.querySelector("[role=progressbar]").hasAttribute("aria-valuenow")'),false);
  click('Fail local draft creation');assert.equal(evaluate('document.querySelectorAll("[data-action-drafts] li").length'),0);assert.match(evaluate('document.querySelector("[data-action-groups-status]").textContent'),/failed/);
  browser('fill','#action-group-title','Retained completion snapshot');click('Add comparison draft');click('Complete local draft creation');assert.match(evaluate('document.querySelector("[data-action-drafts]").textContent'),/comparison: Retained completion snapshot/);
  click('Add comparison draft');click('Cancel local draft creation');assert.equal(evaluate('document.querySelectorAll("[data-action-drafts] li").length'),1);
});
test('app bar saves separate real notes and Back restores the surviving originating control',()=>{
  open('/patterns/app-bars','app-bar');click('Open Local reading collection');browser('wait','--fn','document.activeElement.matches("[data-appbar-heading]")');browser('fill','#appbar-note','Retained reading note');click('Save local note');assert.match(evaluate('document.querySelector("[data-appbar-result]").textContent'),/Local reading collection: Retained reading note/);
  click('Back to collections');browser('wait','--fn','document.activeElement.textContent==="Open Local reading collection"');click('Open Local comparison collection');assert.equal(evaluate('document.querySelector("#appbar-note").value'),'');browser('fill','#appbar-note','Independent comparison note');click('Back to collections');click('Open Local reading collection');assert.equal(evaluate('document.querySelector("#appbar-note").value'),'Retained reading note');
});
test('app bar overflow changes actual density and scope and sticky position remains locally bounded',()=>{
  open('/patterns/app-bars','app-bar');const before=evaluate('getComputedStyle(document.querySelector("[data-appbar-list] button")).paddingTop');click('Workspace options');browser('find','role','menuitemcheckbox','click','--name','Compact collection rows','--exact');browser('wait','--fn','getComputedStyle(document.querySelector("[data-appbar-list] button")).paddingTop==="8px"');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-appbar-list] button")).paddingTop'),'8px');assert.notEqual(before,'8px');
  browser('find','role','menuitemcheckbox','click','--name','Show workspace scope');browser('press','Escape');assert.equal(evaluate('document.querySelector(".material-appbar-content > p")?.textContent.includes("Three English")??false'),false);
  evaluate('document.querySelector("[data-app-bar-workspace]").scrollTop=220;true');assert.ok(evaluate('(() => {const root=document.querySelector("[data-app-bar-workspace]").getBoundingClientRect(),bar=document.querySelector("[data-local-app-bar]").getBoundingClientRect();return Math.abs(bar.top-root.top-2)<2&&bar.bottom<=root.bottom;})()'));
});
test('carousel navigation actually centers every endpoint and transfers boundary focus to native scrolling',()=>{
  browser('set','viewport','320','640');open('/patterns/lists-carousel','collections');
  for(let index=1;index<5;index++){click('Next local slide');browser('wait','--fn',`document.querySelector('[data-carousel-status]').textContent.includes('slide ${index+1} of 5')`);assert.ok(evaluate(`(() => {const root=document.querySelector('[data-local-carousel]').getBoundingClientRect(),n=document.querySelector('[data-slide-id="collection-${index+1}"]').getBoundingClientRect();return Math.abs((n.left+n.width/2)-(root.left+root.width/2))<2;})()`));}
  assert.equal(evaluate('document.activeElement.matches("[data-local-carousel]")'),true);assert.equal(evaluate('[...document.querySelectorAll("[data-collections-lab] button")].find(n=>n.textContent==="Next local slide").disabled'),true);
  for(let index=3;index>=0;index--){click('Previous local slide');browser('wait','--fn',`document.querySelector('[data-carousel-status]').textContent.includes('slide ${index+1} of 5')`);}
  browser('set','viewport','1400','1000');
});
test('list and carousel load the same retained IDs and filtering has honest empty recovery',()=>{
  open('/patterns/lists-carousel','collections');action('Open list Local collection 3');const loaded=evaluate('document.querySelector("[data-collection-result]").textContent');assert.match(loaded,/retained content for collection 3/);action('Open carousel Local collection 3');assert.equal(evaluate('document.querySelector("[data-collection-result]").textContent'),loaded);
  browser('fill','#collections-filter','does-not-match');assert.equal(evaluate('document.querySelectorAll("[data-slide-id],[data-collection-list] li").length'),0);assert.match(evaluate('document.querySelector("[data-carousel-status]").textContent'),/No loaded titles match/);assert.equal(evaluate('document.querySelector("[data-collection-result]").textContent'),loaded);click('Clear collection filter');assert.equal(evaluate('document.querySelectorAll("[data-collection-list] li").length'),5);
});
test('RTL carousel measures real native scroll and explicit commands without LTR sign assumptions',()=>{
  browser('set','viewport','320','640');open('/patterns/lists-carousel','collections');click('Use RTL collections');click('Next local slide');browser('wait','--fn','document.querySelector("[data-carousel-status]").textContent.includes("slide 2 of 5")');
  browser('focus','[data-local-carousel]');const before=evaluate('document.querySelector("[data-local-carousel]").scrollLeft');browser('press','ArrowLeft');browser('wait','--fn',`document.querySelector('[data-local-carousel]').scrollLeft<${before}-1`);assert.equal(evaluate('getComputedStyle(document.querySelector("[data-local-carousel]")).direction'),'rtl');browser('set','viewport','1400','1000');
});
test('both themes keep all new patterns within 320px RTL bounds with reachable named controls',()=>{
  browser('set','viewport','320','640');for(const theme of ['light','dark']){open('/patterns/action-groups','action-groups');evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});true`);
    for(const [route,lab,toggle] of [['/patterns/action-groups','action-groups','Use RTL action groups'],['/patterns/app-bars','app-bar','Use RTL app bar workspace'],['/patterns/lists-carousel','collections','Use RTL collections']]){open(route,lab);browser('wait',`html.${theme}`);click(toggle);assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth+1'),route);assert.ok(evaluate(`[...document.querySelectorAll('[data-${lab}-lab] button')].every(n=>!n.getClientRects().length||n.getBoundingClientRect().height>=44)`),route);if(lab==='app-bar'){click('Open Local reading collection');assert.ok(evaluate('document.querySelector("[data-appbar-heading]").getBoundingClientRect().top>=document.querySelector("[data-local-app-bar]").getBoundingClientRect().bottom-1'));assert.ok(evaluate('document.querySelector(".material-appbar-title").getBoundingClientRect().width>=192'));browser('click','#appbar-note');browser('fill','#appbar-note','Narrow RTL retained note');assert.ok(evaluate('(() => {const field=document.querySelector("#appbar-note").getBoundingClientRect(),bar=document.querySelector("[data-local-app-bar]").getBoundingClientRect(),root=document.querySelector("[data-app-bar-workspace]").getBoundingClientRect();return field.top>=bar.bottom-1&&field.bottom<=root.bottom+1;})()'));}if(lab==='action-groups'){click('More actions');browser('wait','[role=menu]');assert.ok(evaluate('(() => {const r=document.querySelector("[role=menu]").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;})()'));browser('press','Escape');}}
  }browser('set','viewport','1400','1000');
});
test('coverage map contains all 36 reference families and actual navigable local guidance',()=>{
  browser('open',(process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003')+'/guides/material-coverage');browser('wait','[data-material-map]');assert.equal(evaluate('document.querySelectorAll("[data-material-map] tbody tr").length'),36);assert.ok(evaluate('[...document.querySelectorAll("[data-material-map] tbody td a")].every(n=>n.getAttribute("href").startsWith("/"))'));
});
