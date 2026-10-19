import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`mobtranslate-text-visibility-${process.pid}`,base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
function browser(...args){let output;try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}catch(error){throw new Error(error.stdout?.toString()||error.message);}const r=JSON.parse(output);assert.equal(r.success,true,r.error);return r.data;}
const evaluate=code=>browser('eval',code).result;
function open(path='/guides/accessibility',width=1440){browser('set','viewport',String(width),'1000');browser('open',base+path);browser('wait','main h1');if(path==='/guides/accessibility')browser('wait','--fn','document.querySelector("[data-text-measurement]").textContent.includes("240 CSS px")');}
function expand(){browser('focus','[data-text-expand]');browser('press','Enter');}
function painted(){evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');}
after(()=>browser('close'));
test('ellipsis retains complete content and native disclosure reveals the same value',()=>{
 open();const original=evaluate('document.querySelector("[data-text-content]").value');browser('select','[data-text-width]','160');browser('select','[data-text-mode]','ellipsis');browser('wait','--fn','document.querySelector("[data-text-measurement]").textContent.includes("clips visually")');
 assert.equal(evaluate('document.querySelector("[data-text-preview]").textContent'),original);assert.equal(evaluate('getComputedStyle(document.querySelector("[data-text-preview]")).textOverflow'),'ellipsis');const height=evaluate('document.querySelector("[data-text-preview]").getBoundingClientRect().height');
 expand();browser('wait','--fn','document.querySelector("[data-text-expand]").getAttribute("aria-expanded")==="true"');assert.ok(evaluate('document.activeElement===document.querySelector("[data-text-expand]")'));assert.ok(evaluate('document.querySelector("[data-text-preview]").getBoundingClientRect().height')>height);assert.equal(evaluate('document.querySelector("[data-text-preview]").textContent'),original);
 assert.ok(evaluate('document.getElementById(document.querySelector("[data-text-expand]").getAttribute("aria-controls"))===document.querySelector("[data-text-preview]")'));expand();assert.equal(evaluate('document.querySelector("[data-text-expand]").getAttribute("aria-expanded")'),'false');
});
test('specimen scaling preserves width and padding while wrapping grows naturally',()=>{
 open();browser('select','[data-text-width]','160');const before=evaluate('(() => {const n=document.querySelector("[data-text-preview]"),s=getComputedStyle(n);return {font:parseFloat(s.fontSize),padding:s.paddingBlockStart,width:n.clientWidth,height:n.clientHeight};})()');browser('select','[data-text-scale]','200');painted();const after=evaluate('(() => {const n=document.querySelector("[data-text-preview]"),s=getComputedStyle(n);return {font:parseFloat(s.fontSize),padding:s.paddingBlockStart,width:n.clientWidth,height:n.clientHeight};})()');assert.equal(after.font,before.font*2);assert.equal(after.padding,before.padding);assert.equal(after.width,before.width);assert.ok(after.height>before.height);
});
test('long expanded content keeps its disclosure focused and visible before the text',()=>{
 open('/guides/accessibility',320);browser('fill','[data-text-content]','Local retained identifier: '+'x'.repeat(180));browser('select','[data-text-width]','160');browser('select','[data-text-mode]','ellipsis');browser('select','[data-text-scale]','200');evaluate('document.documentElement.style.fontSize="200%"');expand();painted();
 assert.ok(evaluate('document.activeElement===document.querySelector("[data-text-expand]")'));assert.ok(evaluate('document.activeElement.getBoundingClientRect().top>=document.querySelector(".mobile-nav-header").getBoundingClientRect().bottom'));assert.ok(evaluate('document.activeElement.getBoundingClientRect().bottom<=innerHeight'));assert.ok(evaluate('Boolean(document.querySelector("[data-text-expand]").compareDocumentPosition(document.querySelector("[data-text-preview]")) & Node.DOCUMENT_POSITION_FOLLOWING)'));
});
test('empty, multiline and unbroken edits retain their actual values without a character cutoff',()=>{
 open('/guides/accessibility',320);browser('select','[data-text-mode]','ellipsis');expand();browser('focus','[data-text-content]');browser('press','Control+A');browser('press','Backspace');browser('wait','--fn','document.querySelector("[data-text-preview]").textContent==="No preview text entered."');assert.equal(evaluate('document.querySelector("[data-text-preview]").textContent'),'No preview text entered.');const value='Local retained value: '+'x'.repeat(180)+'\nA second local line.';browser('fill','[data-text-content]',value);assert.equal(evaluate('document.querySelector("[data-text-preview]").textContent'),value);assert.equal(evaluate('document.querySelector("[data-text-expand]").getAttribute("aria-expanded")'),'true');browser('select','[data-text-mode]','wrap');assert.equal(evaluate('document.querySelector("[data-text-preview]").textContent'),value);assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
});
test('compared guides and real writing/theme actions remain bounded at 320px with 200% text',()=>{
 for(const path of ['/guides/accessibility','/guides/design-principles','/foundations/inclusive-participation','/foundations/writing','/guides/theming']){
  open(path,320);if(path==='/foundations/writing')browser('fill','main label:nth-child(3) input','Retry the current local comparison without discarding my entered notes');
  for(const theme of ['light','dark']){evaluate(`document.documentElement.style.fontSize='200%';localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'));`);browser('wait',`html.${theme}`);painted();assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'),`${path} ${theme}`);}
  if(path==='/foundations/writing'){browser('focus','[data-writing-preview] button');browser('press','Enter');assert.match(evaluate('document.querySelector("main [role=status]").textContent'),/No request was sent/);}
  if(path==='/guides/theming'){browser('focus','[data-local-theme] button');browser('press','Enter');assert.match(evaluate('document.querySelector("[data-local-theme] + [role=status]").textContent'),/No entry was changed/);}
 }
});
