import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`mobtranslate-header-${process.pid}`,base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
function browser(...args){const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}}));assert.equal(r.success,true,r.error);return r.data;}
const evaluate=code=>browser('eval',code).result;
function open(){browser('open',`${base}/foundations/typography`);browser('wait','main h1');}
function measured(){browser('wait','--fn','Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--styleguide-header-height"))-document.querySelector(".mobile-nav-header").getBoundingClientRect().height)<1');}
after(()=>browser('close'));

test('all title text, initial content and anchors stay visible at narrow widths and enlarged text',()=>{
  for(const width of [320,375])for(const scale of [100,200])for(const theme of ['light','dark']){
    browser('set','viewport',String(width),'812');open();
    evaluate(`document.documentElement.style.fontSize='${scale}%';localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'));window.scrollTo(0,0);`);
    browser('wait',`html.${theme}`);measured();
    const result=evaluate('(() => {const h=document.querySelector(".mobile-nav-header"),title=h.querySelector("span"),r=document.createRange();r.selectNodeContents(title);return {title:title.textContent,rects:[...r.getClientRects()].map(x=>({left:x.left,right:x.right,top:x.top,bottom:x.bottom})),header:h.getBoundingClientRect().toJSON(),heading:document.querySelector("main h1").getBoundingClientRect().toJSON(),width:innerWidth,root:document.documentElement.scrollWidth};})()');
    assert.equal(result.title,'MobTranslate styleguide');assert.ok(result.rects.length>0);
    assert.ok(evaluate('document.querySelector(".mobile-nav-trigger").getAttribute("aria-label").toLowerCase().includes(document.querySelector(".mobile-nav-trigger").textContent.trim().toLowerCase())'));
    for(const rect of result.rects){assert.ok(rect.left>=-1&&rect.right<=result.width+1,JSON.stringify(result));assert.ok(rect.top>=result.header.top-1&&rect.bottom<=result.header.bottom+1,JSON.stringify(result));}
    assert.ok(result.heading.top>=result.header.bottom);assert.ok(result.root<=width);
    browser('click','main a[href="#font-delivery-and-fallback-protection"]');
    assert.ok(evaluate('document.querySelector("#font-delivery-and-fallback-protection").getBoundingClientRect().top>=document.querySelector(".mobile-nav-header").getBoundingClientRect().bottom'));
    assert.ok(evaluate('Math.abs(document.querySelector(".mobile-nav-header").getBoundingClientRect().top)<1'));
  }
});

test('pointer focus inside a tall table preserves the chosen reading position',()=>{
  browser('set','viewport','320','812');open();evaluate('document.documentElement.style.fontSize="200%"');measured();
  const point=evaluate('(() => {const t=document.querySelector(".doc-table"),h=document.querySelector(".mobile-nav-header").getBoundingClientRect().height;window.scrollTo(0,scrollY+t.getBoundingClientRect().top+400);return {x:t.getBoundingClientRect().left+30,y:h+120};})()');
  const before=evaluate('scrollY');browser('mouse','move',String(point.x),String(point.y));browser('mouse','down');browser('mouse','up');
  browser('wait','--fn','document.activeElement.matches(".doc-table")');
  evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.ok(evaluate('!document.activeElement.matches(":focus-visible")'));
  assert.equal(evaluate('scrollY'),before);
});

test('live text resizing, native keyboard traversal and the desktop breakpoint retain usable navigation',()=>{
  browser('set','viewport','320','812');open();evaluate('document.documentElement.style.fontSize="200%"');measured();
  browser('focus','.skip-link');browser('press','Enter');assert.equal(evaluate('document.activeElement.id'),'main-content');
  for(const key of ['Tab','Tab','Tab','Tab','Shift+Tab','Shift+Tab','Shift+Tab']){
    browser('press',key);
    browser('wait','--fn','document.activeElement.getBoundingClientRect().top>=document.querySelector(".mobile-nav-header").getBoundingClientRect().bottom');
    assert.ok(evaluate('document.activeElement.closest("main")!==null'));
    assert.ok(evaluate('document.activeElement.getBoundingClientRect().top>=document.querySelector(".mobile-nav-header").getBoundingClientRect().bottom'));
  }
  evaluate('document.documentElement.style.fontSize="100%"');measured();
  browser('click','.mobile-nav-trigger');assert.equal(evaluate('document.querySelector("dialog").open'),true);browser('press','Escape');assert.equal(evaluate('document.activeElement.matches(".mobile-nav-trigger")'),true);
  browser('set','viewport','767','812');assert.notEqual(evaluate('getComputedStyle(document.querySelector(".mobile-nav-header")).display'),'none');
  browser('click','.mobile-nav-trigger');browser('set','viewport','768','812');
  browser('wait','--fn','!document.querySelector("dialog").open');measured();
  assert.equal(evaluate('getComputedStyle(document.querySelector(".mobile-nav-header")).display'),'none');
  assert.notEqual(evaluate('getComputedStyle(document.querySelector(".styleguide-desktop-nav")).display'),'none');
  browser('set','viewport','320','812');measured();assert.notEqual(evaluate('getComputedStyle(document.querySelector(".mobile-nav-header")).display'),'none');
});


test('text enlargement keeps an already-focused field inside the usable viewport',()=>{
 browser('set','viewport','320','1000');browser('open',`${base}/foundations/interaction-states`);browser('wait','[data-state-lab]');browser('focus','[data-state-lab] input:not([type=checkbox])');
 evaluate('document.documentElement.style.fontSize="200%"');measured();browser('wait','--fn','document.activeElement.getBoundingClientRect().top>=document.querySelector(".mobile-nav-header").getBoundingClientRect().bottom && document.activeElement.getBoundingClientRect().bottom<=innerHeight');
 assert.ok(evaluate('document.activeElement.matches("[data-state-lab] input:not([type=checkbox])")'));assert.equal(evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
});
