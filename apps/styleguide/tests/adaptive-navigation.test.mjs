import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const session=`styleguide-adaptive-navigation-${process.pid}`;
const base=process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
function browser(...args) {
  if(args[0]==='wait' && args[1]==='--fn') new Function(`return (${args[2]});`);
  const result=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,killSignal:'SIGKILL'}));
  assert.equal(result.success,true,result.error);return result.data;
}
const evaluate=script=>{new Function(script);return browser('eval',script).result;};
function open(query='') {browser('open',`${base}/patterns/navigation${query}`);browser('wait','[data-adaptive-lab]');browser('wait','--fn','!document.querySelector("[data-adaptive-layout]").textContent.includes("width: 0px")');browser('wait','--fn','document.documentElement.matches(".light,.dark")');}
const layout=()=>evaluate('document.querySelector(".adaptive-local-shell").dataset.layout');
const status=()=>evaluate('document.querySelector("[data-adaptive-status]").textContent');
const loaded=()=>evaluate('document.querySelector("[data-adaptive-heading]").textContent');
function click(name) {
  evaluate(`(() => {document.querySelectorAll('[data-adaptive-driver-target]').forEach(n=>n.removeAttribute('data-adaptive-driver-target'));const root=document.querySelector('.adaptive-local-drawer') ?? document.querySelector('[data-adaptive-lab]');const node=[...root.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(name)});if(!node)throw new Error('Missing local action');node.setAttribute('data-adaptive-driver-target','');node.scrollIntoView({block:'center'});return true;})()`);
  browser('click','[data-adaptive-driver-target]');
}
function destination(id,keyboard=false) {
  const selector=`[data-adaptive-nav] a[data-adaptive-destination="${id}"]`;
  browser('scrollintoview',selector);
  if(keyboard) {browser('focus',selector);browser('press','Enter');}else browser('click',selector);
}
function arrived(id) {
  try {browser('wait','--fn',`new URLSearchParams(location.search).get('demoDestination')===${JSON.stringify(id)} && document.activeElement.id==='adaptive-local-heading'`);}
  catch(error) {assert.fail(`${error.message}; ${JSON.stringify(evaluate('({url:location.href,heading:document.querySelector("[data-adaptive-heading]")?.textContent,focus:document.activeElement.outerHTML.slice(0,250),retained:document.querySelector("[data-adaptive-retained]")?.textContent,status:document.querySelector("[data-adaptive-status]")?.textContent})'))}`);}
}
function settledDrawer() {browser('wait','--fn','(() => {const node=document.querySelector(".adaptive-local-drawer");return node && !node.hasAttribute("data-starting-style") && node.getAnimations({subtree:true}).every(animation=>animation.playState==="finished");})()');}
after(()=>{try{browser('close');}catch{}});

test('persistent destinations use real URL state and retain draft reading and bookmark tasks through history',()=>{
  browser('set','viewport','1400','1000');open('?retained=example');assert.equal(layout(),'rail');
  assert.equal(evaluate('document.querySelector("[data-adaptive-nav]").tagName'),'NAV');
  assert.equal(evaluate('document.querySelectorAll("[data-adaptive-nav] a").length'),3);
  assert.equal(evaluate('document.querySelectorAll("[data-adaptive-nav] [aria-current=page]").length'),1);
  assert.ok(evaluate('[...document.querySelectorAll("[data-adaptive-nav] svg")].every(n=>n.getAttribute("aria-hidden")==="true")'));
  browser('fill','#adaptive-local-draft','A retained adaptive draft');destination('reading',true);arrived('reading');
  assert.match(loaded(),/reading settings/);assert.equal(evaluate('new URLSearchParams(location.search).get("retained")'),'example');
  click('Use compact local reading');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-adaptive-records]")).lineHeight'),'22.4px');
  destination('saved');arrived('saved');click('Bookmark local overview');assert.equal(evaluate('document.querySelector("[data-adaptive-saved]").children.length'),1);
  destination('overview');arrived('overview');assert.equal(evaluate('document.querySelector("#adaptive-local-draft").value'),'A retained adaptive draft');
  const length=evaluate('history.length');destination('overview');assert.equal(evaluate('history.length'),length);
  browser('back');arrived('saved');assert.ok(evaluate('document.querySelector("[data-adaptive-saved]") !== null'));
  browser('back');arrived('reading');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-adaptive-records]")).lineHeight'),'22.4px');
});

test('direct and invalid destination entries resolve actual content and a real URL correction',()=>{
  open('?demoDestination=saved#adaptive-workspace-arrival');assert.match(loaded(),/saved examples/);assert.ok(evaluate('document.querySelector("#adaptive-workspace-arrival") !== null'));
  open('?demoDestination=unavailable');assert.match(loaded(),/workspace overview/);assert.match(evaluate('document.querySelector("[data-adaptive-lab]").textContent'),/destination is invalid/);
  destination('overview');arrived('overview');assert.ok(evaluate('!document.querySelector("[data-adaptive-lab]").textContent.includes("destination is invalid")'));
});

test('held failed retried and cancelled requests retain the loaded URL and task until completion',()=>{
  open();browser('fill','#adaptive-local-draft','Held context');click('Hold local destination requests');
  destination('reading');assert.match(loaded(),/overview/);assert.equal(evaluate('new URLSearchParams(location.search).get("demoDestination")'),null);
  assert.match(status(),/reading requested/);assert.ok(evaluate('document.querySelector(".adaptive-local-result").getAttribute("aria-busy")==="true"'));
  assert.ok(evaluate('!document.querySelector("[data-adaptive-status]").closest("[aria-busy=true]")'));
  destination('saved');assert.match(status(),/reading requested/);
  click('Fail local destination');assert.match(status(),/failed/);assert.equal(evaluate('document.querySelector("#adaptive-local-draft").value'),'Held context');
  click('Retry local destination');click('Cancel local destination');assert.match(status(),/cancelled/);assert.match(loaded(),/overview/);
  destination('reading');click('Complete local destination');arrived('reading');assert.match(evaluate('document.querySelector("[data-adaptive-retained]").textContent'),/Held context/);
});

test('compact modal navigation contains focus and arrives below the fixed document header',()=>{
  browser('set','viewport','320','640');open();assert.equal(layout(),'drawer');
  assert.equal(evaluate('document.querySelectorAll("[data-adaptive-nav]").length'),0);
  click('Open local workspace navigation');browser('wait','.adaptive-local-drawer');
  settledDrawer();
  browser('wait','--fn','document.activeElement.textContent==="Local workspace navigation"');
  assert.equal(evaluate('document.querySelector(".adaptive-local-drawer").getAttribute("aria-modal")'),'true');
  for(let i=0;i<7;i++){browser('press','Tab');browser('wait','--fn','document.querySelector(".adaptive-local-drawer").contains(document.activeElement)');}
  destination('reading',true);arrived('reading');browser('wait','--fn','!document.querySelector(".adaptive-local-drawer")');
  assert.ok(evaluate('document.activeElement.getBoundingClientRect().top>=document.querySelector(".mobile-nav-header").getBoundingClientRect().bottom'));
  click('Open local workspace navigation');browser('press','Escape');browser('wait','--fn','!document.querySelector(".adaptive-local-drawer")');
  assert.match(evaluate('document.activeElement.textContent'),/Open local workspace navigation/);
});

test('drawer close cancels held requests and an explicit local completion closes to arrival',()=>{
  open();click('Hold local destination requests');click('Open local workspace navigation');browser('wait','.adaptive-local-drawer');settledDrawer();destination('saved');
  assert.match(evaluate('document.querySelector(".adaptive-local-drawer [role=status]").textContent'),/saved requested/);
  browser('press','Escape');browser('wait','--fn','!document.querySelector(".adaptive-local-drawer")');assert.match(status(),/cancelled/);assert.match(loaded(),/overview/);
  click('Open local workspace navigation');browser('wait','.adaptive-local-drawer');settledDrawer();destination('reading');click('Complete local destination');arrived('reading');browser('wait','--fn','!document.querySelector(".adaptive-local-drawer")');
});

test('resize preserves focused destinations and provides surviving opener and current-link targets',()=>{
  browser('set','viewport','1400','1000');open();browser('focus','[data-adaptive-nav] a[data-adaptive-destination="reading"]');
  browser('set','viewport','900','900');browser('wait','--fn','document.querySelector(".adaptive-local-shell").dataset.layout==="bar"');
  assert.equal(evaluate('document.activeElement.dataset.adaptiveDestination'),'reading');
  browser('set','viewport','320','640');browser('wait','--fn','document.querySelector(".adaptive-local-shell").dataset.layout==="drawer"');
  assert.match(evaluate('document.activeElement.textContent'),/Open local workspace navigation/);
  browser('set','viewport','1400','1000');browser('wait','--fn','document.querySelector(".adaptive-local-shell").dataset.layout==="rail"');
  assert.equal(evaluate('document.activeElement.getAttribute("aria-current")'),'page');
});

test('an open drawer becomes persistent without losing a pending task or trapping focus',()=>{
  browser('set','viewport','320','640');open();click('Hold local destination requests');click('Open local workspace navigation');browser('wait','.adaptive-local-drawer');settledDrawer();destination('reading');
  assert.match(status(),/reading requested/);
  browser('set','viewport','1400','1000');browser('wait','--fn','!document.querySelector(".adaptive-local-drawer")');
  assert.equal(layout(),'rail');assert.equal(evaluate('document.activeElement.getAttribute("aria-current")'),'page');
  assert.match(status(),/reading requested/);assert.equal(evaluate('document.querySelectorAll("[data-adaptive-nav]").length'),1);
  click('Complete local destination');arrived('reading');
});

test('narrow compact bars preserve native link semantics bottom DOM placement and actual bookmark effects',()=>{
  browser('set','viewport','320','640');open();click('Use compact destination bar');browser('wait','--fn','document.querySelector(".adaptive-local-shell").dataset.layout==="bar"');
  assert.ok(evaluate('document.querySelector(".adaptive-local-content").compareDocumentPosition(document.querySelector("[data-adaptive-nav]")) & Node.DOCUMENT_POSITION_FOLLOWING'));
  assert.ok(evaluate('[...document.querySelectorAll("[data-adaptive-nav] a")].every(n=>n.getBoundingClientRect().height>=64)'));
  assert.ok(evaluate('[...document.querySelectorAll("[data-adaptive-nav] a span")].every(n=>n.getBoundingClientRect().height<=parseFloat(getComputedStyle(n).lineHeight)+1)'));
  assert.equal(evaluate('document.querySelectorAll("[data-adaptive-nav] [role=tab],[data-adaptive-nav] [role=menuitem]").length'),0);
  assert.equal(evaluate('document.querySelectorAll(".adaptive-local-unavailable a").length'),0);
  destination('saved',true);arrived('saved');click('Bookmark local overview');assert.match(evaluate('document.querySelector("[data-adaptive-saved]").textContent'),/overview bookmark/);
  assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
});

test('modified keyboard activation opens a separate native destination lifecycle and retains the original draft',()=>{
  browser('set','viewport','1400','1000');open('?retained=native');browser('fill','#adaptive-local-draft','Original page remains local');
  const before=browser('tab','list').tabs;
  browser('focus','[data-adaptive-nav] a[data-adaptive-destination="reading"]');browser('press','Control+Enter');
  browser('wait','[data-adaptive-records]');
  const tabs=browser('tab','list').tabs;
  assert.equal(tabs.length,before.length+1);assert.match(tabs.find(tab=>tab.active).url,/retained=native&demoDestination=reading/);
  assert.match(evaluate('document.querySelector("[data-adaptive-retained]").textContent'),/English-only adaptive workspace draft/);
  browser('tab','close');assert.equal(browser('tab','list').tabs.find(tab=>tab.active).tabId,before.find(tab=>tab.active).tabId);browser('wait','#adaptive-local-draft');
  assert.equal(evaluate('document.querySelector("#adaptive-local-draft").value'),'Original page remains local');
  assert.equal(evaluate('new URLSearchParams(location.search).get("demoDestination")'),null);
});

test('both themes RTL current/focus contrast reduced motion and constrained drawer geometry remain usable',()=>{
  for(const theme of ['light','dark']) {
    browser('set','viewport','320','480');open();evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));true`);open();browser('wait',`html.${theme}`);
    click('Use compact destination bar');browser('wait','--fn','document.querySelector(".adaptive-local-shell").dataset.layout==="bar"');click('Use RTL local workspace');
    browser('focus','[data-adaptive-nav] a[data-adaptive-destination="overview"]');browser('press','Tab');
    const rows=evaluate(`(() => {const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});const rgb=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};const lum=c=>rgb(c).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);const page=getComputedStyle(document.documentElement).getPropertyValue('--color-background');return [...document.querySelectorAll('[data-adaptive-nav] a')].map(n=>{const s=getComputedStyle(n);return {text:contrast(s.color,s.backgroundColor),focus:contrast(s.outlineColor,page),width:s.outlineWidth,style:s.outlineStyle,focused:n===document.activeElement};});})()`);
    for(const row of rows)assert.ok(row.text>=4.5,`${theme}: ${JSON.stringify(row)}`);
    const focused=rows.find(row=>row.focused);assert.ok(focused.focus>=3 && focused.style!=='none' && parseFloat(focused.width)>=2);
    assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    click('Use compact destination bar');browser('wait','--fn','document.querySelector(".adaptive-local-shell").dataset.layout==="drawer"');click('Open local workspace navigation');browser('wait','.adaptive-local-drawer');settledDrawer();
    assert.equal(evaluate('document.querySelector(".adaptive-local-drawer").dir'),'rtl');
    browser('wait','--fn','(() => {const r=document.querySelector(".adaptive-local-drawer").getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight+1;})()');
    assert.ok(evaluate('(() => {const popup=document.querySelector(".adaptive-local-drawer");return popup.scrollWidth<=popup.clientWidth && [...popup.querySelectorAll("button")].every(node=>{const range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect();const button=node.getBoundingClientRect();return text.left>=button.left-1 && text.right<=button.right+1;});})()'));
    assert.ok(evaluate('(() => {const r=document.querySelector(".adaptive-local-drawer").getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight+1;})()'));
    click('Close local workspace navigation');browser('wait','--fn','!document.querySelector(".adaptive-local-drawer")');
  }
  browser('set','media','reduced-motion','reduce');click('Open local workspace navigation');browser('wait','.adaptive-local-drawer');
  assert.ok(evaluate('parseFloat(getComputedStyle(document.querySelector(".adaptive-local-drawer")).transitionDuration)<=.00001'));
  browser('press','Escape');browser('set','media','reduced-motion','no-preference');browser('set','viewport','1400','1000');
});
