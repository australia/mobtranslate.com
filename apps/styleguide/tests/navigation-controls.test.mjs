import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const session = `styleguide-navigation-controls-${process.pid}`;
const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
function browser(...args) {
  if (args[0] === 'wait' && args[1] === '--fn') new Function(`return (${args[2]});`);
  const result = JSON.parse(execFileSync('agent-browser', ['--session',session,'--json',...args], {encoding:'utf8',timeout:150000,killSignal:'SIGKILL'}));
  assert.equal(result.success,true,result.error); return result.data;
}
const evaluate = script => { new Function(script); return browser('eval',script).result; };
function open(path,lab) { browser('open',base+path);browser('wait',lab);browser('wait','--fn','document.documentElement.matches(".light,.dark")'); }
function click(label) {
  evaluate(`(() => {const node=[...document.querySelectorAll('main button')].find(item=>item.textContent.trim()===${JSON.stringify(label)});if(!node)throw new Error('Named button missing');node.scrollIntoView({block:'center'});return true;})()`);
  browser('find','role','button','click','--name',label,'--exact');
}
function tab(label) {
  evaluate(`[...document.querySelectorAll('[role=tab]')].find(node=>node.textContent===${JSON.stringify(label)}).scrollIntoView({block:'center'});true`);
  browser('find','role','tab','click','--name',label,'--exact');
}
function focusTab(label) {
  const id=evaluate(`[...document.querySelectorAll('[role=tab]')].find(node=>node.textContent===${JSON.stringify(label)}).id`);
  browser('scrollintoview',`#${id}`);browser('focus',`#${id}`);
}
const selected = () => evaluate('document.querySelector("[role=tab][aria-selected=true]").textContent');
after(()=>browser('close'));

test('manual tabs separate focus from selection and preserve actual parent-owned draft after unmount',()=>{
  open('/components/tabs','[data-tabs-lab]');
  browser('fill','#navigation-local-draft','Retained local revision');focusTab('Draft');browser('press','ArrowRight');
  assert.equal(evaluate('document.activeElement.textContent'),'Preview');assert.equal(selected(),'Draft');
  browser('press','Enter');assert.equal(selected(),'Preview');
  assert.equal(evaluate('document.querySelector("[data-tabs-preview]").textContent'),'Retained local revision');
  assert.equal(evaluate('document.querySelector("#navigation-local-draft") === null'),true);
  tab('Draft');assert.equal(evaluate('document.querySelector("#navigation-local-draft").value'),'Retained local revision');
  assert.ok(evaluate('document.querySelector("[role=tab][aria-selected=true]").classList.contains("local-tab-active")'));
});

test('tab names and active panel relationships connect and unavailable views reject selection',()=>{
  open('/components/tabs','[data-tabs-lab]');
  assert.equal(evaluate('document.querySelector("[role=tablist]").getAttribute("aria-label")'),'Local record views');
  assert.ok(evaluate(`(() => {const tab=document.querySelector('[role=tab][aria-selected=true]');const panel=document.getElementById(tab.getAttribute('aria-controls'));return panel?.getAttribute('aria-labelledby').split(' ').includes(tab.id) && panel.getAttribute('role')==='tabpanel';})()`));
  tab('Remote review unavailable');assert.equal(selected(),'Draft');
  focusTab('Draft');browser('press','End');assert.equal(evaluate('document.activeElement.textContent'),'Local history');browser('press','Enter');assert.equal(selected(),'Local history');
  browser('press','Home');assert.equal(evaluate('document.activeElement.textContent'),'Draft');
});

test('automatic tabs retain hidden panels and allow disabled view discovery without selection',()=>{
  open('/components/tabs','[data-tabs-lab]');click('Activate local tabs on focus');click('Keep local panels mounted');
  focusTab('Draft');browser('press','ArrowRight');assert.equal(selected(),'Preview');
  assert.ok(evaluate('document.querySelector("#navigation-local-draft") !== null'));
  assert.ok(evaluate('document.querySelector("#navigation-local-draft").closest("[role=tabpanel]").hidden'));
  browser('press','ArrowRight');assert.equal(evaluate('document.activeElement.textContent'),'Remote review unavailable');assert.equal(selected(),'Preview');browser('press','Enter');assert.equal(selected(),'Preview');
  browser('press','ArrowRight');assert.equal(selected(),'Local history');
  browser('press','ArrowRight');assert.equal(selected(),'Draft');
  browser('press','Tab');assert.ok(evaluate('document.activeElement.closest("[role=tabpanel]") !== null'));
});

test('local preview check supports pending failure cancellation completion and surviving focus',()=>{
  open('/components/tabs','[data-tabs-lab]');tab('Preview');click('Request local preview check');
  assert.ok(evaluate('[...document.querySelectorAll("[data-tabs-lab] button")].find(node=>node.textContent==="Request local preview check").disabled'));
  click('Fail local preview check');assert.match(evaluate('document.querySelector("[role=tabpanel]").textContent'),/failed.*retained/i);
  assert.ok(evaluate('document.activeElement.matches("[role=tabpanel]")'));
  click('Request local preview check');click('Cancel local preview check');assert.match(evaluate('document.querySelector("[role=tabpanel]").textContent'),/No local check requested/);
  click('Request local preview check');click('Complete local preview check');assert.match(evaluate('document.querySelector("[role=tabpanel]").textContent'),/No remote review or publication/);
  click('Restore local tab draft');assert.equal(selected(),'Draft');assert.equal(evaluate('document.querySelector("#navigation-local-draft").value'),'English-only local draft');
});

test('live vertical and RTL tab settings change first-key direction and indicator geometry',()=>{
  open('/components/tabs','[data-tabs-lab]');click('Use vertical local tabs');focusTab('Draft');browser('press','ArrowDown');assert.equal(evaluate('document.activeElement.textContent'),'Preview');browser('press','Enter');
  assert.equal(evaluate('document.querySelector("[role=tablist]").getAttribute("aria-orientation")'),'vertical');
  assert.equal(evaluate('getComputedStyle(document.querySelector(".mt-tabs-list")).flexDirection'),'column');
  browser('wait','--fn',`(() => {const tab=document.querySelector('[role=tab][aria-selected=true]').getBoundingClientRect();const i=document.querySelector('.mt-tabs-indicator').getBoundingClientRect();return i.height>0 && Math.abs(i.height-tab.height)<1 && Math.abs(i.top-tab.top)<1;})()`);
  click('Use vertical local tabs');click('Use RTL local tabs');focusTab('Draft');browser('press','ArrowLeft');assert.equal(evaluate('document.activeElement.textContent'),'Preview');browser('press','Enter');
  browser('wait','--fn',`(() => {const tab=document.querySelector('[role=tab][aria-selected=true]').getBoundingClientRect();const i=document.querySelector('.mt-tabs-indicator').getBoundingClientRect();return i.width>0 && Math.abs(i.width-tab.width)<1 && Math.abs(i.left-tab.left)<1;})()`);
});

test('toolbar is named and commands change actual formatting and count with independent restoration',()=>{
  open('/components/toolbar','[data-toolbar-lab]');
  assert.equal(evaluate('document.querySelector("[role=toolbar]").getAttribute("aria-label")'),'Local sample actions');
  click('Bold local text');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-toolbar-sample]")).fontWeight'),'700');
  click('Italic local text');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-toolbar-sample]")).fontStyle'),'italic');
  click('Duplicate local sample');assert.match(evaluate('document.querySelector("[data-toolbar-sample]").textContent'),/copies: 1/);
  click('Remote publish unavailable');assert.match(evaluate('document.querySelector("[data-toolbar-sample]").textContent'),/copies: 1/);
  click('Restore local toolbar sample');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-toolbar-sample]")).fontWeight'),'400');assert.match(evaluate('document.querySelector("[data-toolbar-sample]").textContent'),/copies: 0/);
});

test('toolbar composite keys discover unavailable controls, reject activation and can skip them',()=>{
  open('/components/toolbar','[data-toolbar-lab]');browser('scrollintoview','[role=toolbar]');browser('focus','[role=toolbar] button');browser('press','ArrowLeft');
  assert.equal(evaluate('document.activeElement.tagName'),'A');browser('press','ArrowLeft');assert.equal(evaluate('document.activeElement.textContent'),'Remote publish unavailable');
  browser('press','Enter');assert.match(evaluate('document.querySelector("[data-toolbar-sample]").textContent'),/copies: 0/);
  click('Skip unavailable toolbar action');browser('focus','[role=toolbar] button');browser('press','ArrowLeft');browser('press','ArrowLeft');assert.equal(evaluate('document.activeElement.textContent'),'Duplicate local sample');
  browser('press','ArrowLeft');browser('press','ArrowLeft');assert.equal(evaluate('document.activeElement.textContent'),'Bold local text');browser('press','Tab');assert.ok(evaluate('document.activeElement.closest("[role=toolbar]") === null'));
});

test('live toolbar direction and disabled root preserve recovery and real link destinations',()=>{
  open('/components/toolbar','[data-toolbar-lab]');click('Use vertical local toolbar');browser('focus','[role=toolbar] button');browser('press','ArrowDown');assert.equal(evaluate('document.activeElement.textContent'),'Italic local text');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[role=toolbar]")).flexDirection'),'column');
  click('Use vertical local toolbar');click('Use RTL local toolbar');browser('focus','[role=toolbar] button');browser('press','ArrowLeft');assert.equal(evaluate('document.activeElement.textContent'),'Italic local text');
  click('Disable local toolbar buttons');click('Bold local text');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-toolbar-sample]")).fontWeight'),'400');
  assert.ok(evaluate('document.querySelector("[role=toolbar]").classList.contains("local-toolbar-disabled")'));
  assert.equal(evaluate('document.querySelector(".mt-toolbar-link").tagName'),'A');browser('scrollintoview','.mt-toolbar-link');browser('click','.mt-toolbar-link');assert.ok(evaluate('location.hash==="#toolbar-task-context"'));
  click('Restore local toolbar sample');click('Bold local text');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-toolbar-sample]")).fontWeight'),'700');
});

test('navigation control guides and last controls remain reachable in both themes at 320px',()=>{
  browser('set','viewport','320','640');
  for(const theme of ['light','dark']) {
    open('/components/tabs','[data-tabs-lab]');evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));`);
    for(const [path,lab] of [['/components/tabs','[data-tabs-lab]'],['/components/toolbar','[data-toolbar-lab]'],['/patterns/navigation','[data-tabs-lab]']]) {
      open(path,lab);browser('wait',`html.${theme}`);assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${theme} ${path}`);
    }
    open('/components/tabs','[data-tabs-lab]');focusTab('Draft');browser('press','End');browser('press','Enter');assert.equal(selected(),'Local history');
    browser('wait','--fn',`(() => {const t=document.querySelector('[role=tab][aria-selected=true]').getBoundingClientRect();const list=document.querySelector('.mt-tabs-scroller').getBoundingClientRect();return t.left>=list.left-1 && t.right<=list.right+1;})()`);
    assert.ok(evaluate('document.querySelector(".mt-tabs-scroller").scrollHeight<=document.querySelector(".mt-tabs-scroller").clientHeight')) ;
    browser('wait','--fn',`(() => {const tab=document.querySelector('[role=tab][aria-selected=true]').getBoundingClientRect();const i=document.querySelector('.mt-tabs-indicator').getBoundingClientRect();return i.width>0 && Math.abs(i.left-tab.left)<1 && Math.abs(i.width-tab.width)<1;})()`);
    click('Use RTL local tabs');focusTab('Draft');browser('press','Enter');browser('press','End');browser('press','Enter');
    browser('wait','--fn',`(() => {const t=document.querySelector('[role=tab][aria-selected=true]').getBoundingClientRect();const s=document.querySelector('.mt-tabs-scroller').getBoundingClientRect();const i=document.querySelector('.mt-tabs-indicator').getBoundingClientRect();return t.left>=s.left-1 && t.right<=s.right+1 && Math.abs(i.left-t.left)<1 && Math.abs(i.width-t.width)<1;})()`);
    click('Use vertical local tabs');tab('Preview');assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${theme} vertical RTL tabs`);
    click('Request local preview check');assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${theme} vertical RTL pending`);click('Cancel local preview check');
    open('/components/toolbar','[data-toolbar-lab]');assert.ok(evaluate('[...document.querySelectorAll(".mt-toolbar-button,.mt-toolbar-link")].every(node=>node.getBoundingClientRect().height>=44)'));
  }
  browser('set','viewport','1440','1000');
});

test('selected and unselected tab text, toolbar commands and focus cues are readable with reduced motion',()=>{
  for(const theme of ['light','dark']) {
    open('/components/tabs','[data-tabs-lab]');evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));`);
    open('/components/tabs','[data-tabs-lab]');browser('wait',`html.${theme}`);focusTab('Draft');
    const ratioScript=`(() => {
      const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
      const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
      const lum=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const contrast=(a,b)=>(Math.max(lum(rgb(a)),lum(rgb(b)))+.05)/(Math.min(lum(rgb(a)),lum(rgb(b)))+.05);
      const bg=getComputedStyle(document.documentElement).getPropertyValue('--color-background');
      const text=[...document.querySelectorAll('[role=tab]:not([data-disabled]),.mt-toolbar-button:not([data-disabled]),.mt-toolbar-link')].map(node=>({label:node.textContent,ratio:contrast(getComputedStyle(node).color,node.getAttribute('aria-pressed')==='true'?getComputedStyle(node).backgroundColor:bg)}));
      if(document.activeElement.matches('[role=tab]')) text.push({label:'tab focus',ratio:contrast(getComputedStyle(document.activeElement).outlineColor,bg),minimum:3});
      const indicator=document.querySelector('.mt-tabs-indicator');if(indicator)text.push({label:'selection indicator',ratio:contrast(getComputedStyle(indicator).backgroundColor,bg),minimum:3});
      return text;
    })()`;
    for(const pair of evaluate(ratioScript)) assert.ok(pair.ratio>=(pair.minimum ?? 4.5),`${theme} ${pair.label}: ${pair.ratio}`);
    assert.equal(evaluate('getComputedStyle(document.activeElement).outlineStyle'),'solid');
    assert.equal(evaluate('getComputedStyle(document.activeElement).outlineWidth'),'2px');
    open('/components/toolbar','[data-toolbar-lab]');click('Bold local text');
    for(const pair of evaluate(ratioScript)) assert.ok(pair.ratio>=(pair.minimum ?? 4.5),`${theme} ${pair.label}: ${pair.ratio}`);
  }
  browser('set','media','light','reduced-motion');open('/components/tabs','[data-tabs-lab]');focusTab('Draft');
  assert.ok(evaluate('getComputedStyle(document.querySelector(".mt-tabs-indicator")).transitionDuration.split(",").every(v=>parseFloat(v)<=.00001)'));
  browser('set','media','light');
});
