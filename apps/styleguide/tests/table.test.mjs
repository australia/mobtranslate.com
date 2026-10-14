import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`styleguide-table-${process.pid}`;
function browser(...args){
  if(args[0]==='eval')new Function(args[1]);
  if(args[0]==='wait'&&args[1]==='--fn')new Function(`return (${args[2]});`);
  let output;
  try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,killSignal:'SIGKILL'});}
  catch(error){throw new Error(`Browser ${args[0]} failed: ${error.stdout??''} ${error.stderr??''}`,{cause:error});}
  const result=JSON.parse(output);assert.equal(result.success,true,result.error);return result.data;
}
const evaluate=source=>browser('eval',source).result;
function open(route='/components/table'){
  browser('open',(process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003')+route);
  browser('wait','[data-table-lab]');browser('wait','--fn','document.documentElement.matches(".light,.dark")');
}
function click(text){
  evaluate(`(() => {document.querySelectorAll('[data-table-driver]').forEach(n=>n.removeAttribute('data-table-driver'));const n=[...document.querySelectorAll('[data-table-lab] button')].find(n=>n.textContent===${JSON.stringify(text)});if(!n)throw Error('Missing task control');n.setAttribute('data-table-driver','');n.scrollIntoView({block:'center'});return true;})()`);
  browser('click','[data-table-driver]');
}
function check(name){browser('find','role','checkbox','click','--name',name,'--exact');}
function action(name){browser('find','role','button','click','--name',name,'--exact');}
const ids=()=>evaluate('[...document.querySelectorAll("[data-table-lab] tbody tr[data-record-id]")].map(n=>n.dataset.recordId)');
const status=()=>evaluate('document.querySelector("[data-table-status]").textContent');
after(()=>{try{browser('close');}catch{}});

test('native table retains caption scoped headers footer and correct loaded totals',()=>{
  open();assert.deepEqual(ids(),['audio','bookmarks','drafts']);
  assert.match(evaluate('document.querySelector("[data-table-lab] caption").textContent'),/loaded fixture only/);
  assert.equal(evaluate('document.querySelectorAll("[data-table-lab] thead th[scope=col]").length'),4);
  assert.equal(evaluate('document.querySelectorAll("[data-table-lab] tbody th[scope=row]").length'),3);
  assert.equal(evaluate('document.querySelector("[data-table-total]").textContent'),'53');
  assert.equal(evaluate('document.querySelector("[data-table-lab] table").getAttribute("role")'),null);
  assert.match(status(),/6 of 6 loaded.*Page 1 of 2.*0 selected/);
});
test('keyboard sort changes actual order and header state while preserving the sort control',()=>{
  open();browser('focus','#table-sort');browser('press','Enter');
  assert.deepEqual(ids(),['checklist','reading','examples']);
  assert.equal(evaluate('document.querySelector("#table-sort").closest("th").getAttribute("aria-sort")'),'descending');
  assert.equal(evaluate('document.activeElement.id'),'table-sort');
  browser('press','Space');assert.deepEqual(ids(),['audio','bookmarks','drafts']);
  assert.equal(evaluate('document.querySelector("#table-sort").closest("th").getAttribute("aria-sort")'),'ascending');
});
test('mixed current-page selection and paging preserve IDs and explicit off-page scope',()=>{
  open();check('Select Local audio preparation');
  assert.equal(evaluate('document.querySelector("[data-table-lab] thead .mt-checkbox").getAttribute("aria-checked")'),'mixed');
  check('Select visible page');assert.match(status(),/3 selected; 0 outside/);
  assert.equal(evaluate('document.querySelector("[data-table-lab] thead .mt-checkbox").getAttribute("aria-checked")'),'true');
  action('Go to next page');assert.deepEqual(ids(),['examples','reading','checklist']);
  assert.match(status(),/Page 2 of 2.*3 selected; 3 outside/);
  assert.equal(evaluate('document.querySelector("[data-table-lab] thead .mt-checkbox").getAttribute("aria-checked")'),'false');
  check('Select Local reading notes');action('Go to previous page');
  assert.match(status(),/4 selected; 1 outside/);
  assert.equal(evaluate('document.querySelectorAll("[data-table-lab] tbody tr[data-selected]").length'),3);
  check('Select visible page');assert.match(status(),/1 selected; 1 outside/);
});
test('detail and all-selected summary remain real snapshots through filtering and clearing',()=>{
  open();check('Select Local audio preparation');action('View Local audio preparation');
  action('Go to next page');check('Select Local reading notes');click('Create local selection summary');
  const snapshot=evaluate('document.querySelector("[data-table-bundle]").textContent');
  assert.match(snapshot,/Local reading notes/);assert.match(snapshot,/Local audio preparation/);
  browser('fill','#table-filter','reading');assert.deepEqual(ids(),['reading']);
  assert.match(status(),/1 of 6 loaded.*Page 1 of 1.*2 selected; 1 outside/);
  assert.match(evaluate('document.querySelector("[data-table-result]").textContent'),/Local audio preparation: English-only preparation notes/);
  assert.equal(evaluate('document.querySelector("[data-table-total]").textContent'),'18');
  click('Clear all collection selections');assert.match(status(),/0 selected/);
  assert.equal(evaluate('document.querySelector("[data-table-bundle]").textContent'),snapshot);
  assert.equal(evaluate('[...document.querySelectorAll("[data-table-lab] button")].find(n=>n.textContent==="Create local selection summary").disabled'),true);
});
test('filtered empty state preserves query focus and offers actual recovery without fake records',()=>{
  open();browser('fill','#table-filter','not-a-loaded-title');assert.deepEqual(ids(),[]);
  assert.equal(evaluate('document.activeElement.id'),'table-filter');assert.match(status(),/0 of 6 loaded/);
  assert.equal(evaluate('document.querySelector("[data-table-lab] tbody td").colSpan'),4);
  assert.match(evaluate('document.querySelector("[data-table-lab] tbody td").textContent'),/No loaded titles match/);
  assert.equal(evaluate('document.querySelector("[data-table-lab] thead .mt-checkbox").getAttribute("aria-disabled")'),'true');
  assert.equal(evaluate('document.querySelector("[data-table-total]").textContent'),'0');
  click('Clear title filter');assert.equal(ids().length,3);assert.equal(evaluate('document.querySelector("[data-table-total]").textContent'),'53');
});
test('real wrapper ref keyboard scrolling logical alignment and density keep native table ownership',()=>{
  browser('set','viewport','320','640');open();click('Focus collection table');
  assert.equal(evaluate('document.activeElement.getAttribute("aria-label")'),'Loaded local collection comparison');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-table-container]")).overflowX'),'auto');
  assert.ok(evaluate('(() => {const n=document.querySelector("[data-table-container]");return n.scrollWidth>n.clientWidth&&n.getBoundingClientRect().right<=innerWidth+1;})()'));
  browser('press','ArrowRight');browser('wait','--fn','document.querySelector("[data-table-container]").scrollLeft>0');
  const regular=evaluate('getComputedStyle(document.querySelector("[data-table-lab] tbody td")).paddingTop');assert.equal(regular,'12px');
  click('Use compact cell padding');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-table-lab] tbody td")).paddingTop'),'8px');
  click('Use RTL table direction');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-table-container]")).direction'),'rtl');
  assert.equal(evaluate('getComputedStyle(document.querySelector("caption")).textAlign'),'start');
  assert.equal(evaluate('document.querySelector("[data-table-lab]").lang'),'en');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-table-status]")).direction'),'ltr');
  browser('focus','[data-table-container]');browser('press','ArrowLeft');
  browser('wait','--fn','document.querySelector("[data-table-container]").scrollLeft<0');
  assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  assert.ok(evaluate('[...document.querySelectorAll("[data-table-lab] button,.mt-checkbox-label")].every(n=>n.getBoundingClientRect().height>=44)'));
  browser('set','viewport','1400','1000');
});
test('both guides and themes reflow with readable table text and actionable narrow RTL controls',()=>{
  browser('set','viewport','320','640');
  for(const theme of ['light','dark']){
    open();evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});true`);
    for(const route of ['/components/table','/patterns/data-display']){
      open(route);browser('wait',`html.${theme}`);click('Use RTL table direction');
      assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      assert.ok(evaluate('[...document.querySelectorAll("[data-table-lab] > div > button")].every(n=>{const r=n.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth+1;})'));
      const ratios=evaluate(`(() => {const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});const rgb=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};const lum=c=>rgb(c).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const bg=n=>{for(let p=n;p;p=p.parentElement){const c=getComputedStyle(p).backgroundColor;if(rgb(c)[3]===255)return c;}return getComputedStyle(document.documentElement).getPropertyValue('--color-background');};return [...document.querySelectorAll('[data-table-lab] caption,[data-table-lab] th,[data-table-lab] td')].map(n=>{const a=lum(getComputedStyle(n).color),b=lum(bg(n));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});})()`);
      for(const ratio of ratios)assert.ok(ratio>=4.5,`${route} ${theme}: ${ratio}`);
    }
  }
  browser('set','viewport','1400','1000');
});
