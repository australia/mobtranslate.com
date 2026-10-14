import {after,test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const session=`mobtranslate-token-export-${process.pid}`,base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
function browser(...args){let output;try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}catch(error){throw new Error(error.stdout?.toString()||error.message);}const r=JSON.parse(output);assert.equal(r.success,true,r.error);return r.data;}
const evaluate=code=>browser('eval',code).result;
function open(width=1440){browser('set','viewport',String(width),'1000');browser('open',`${base}/tokens`);browser('wait','[data-token-query]');browser('wait','--fn','document.querySelector("[data-token-catalogue] tbody tr td:nth-of-type(3)").textContent !== "Not available in this render"');browser('fill','main input[type=search]','var(--radius-lg)');}
function exported(){return JSON.parse(decodeURIComponent(evaluate('document.querySelector("a[download]").getAttribute("href").split(",").slice(1).join(",")')));}
after(()=>browser('close'));
test('CSS/JSON dependency inclusion preserves actual references and requested selection',()=>{
  open();const fragment=exported();assert.ok(fragment.tokens.some(t=>t.name==='--radius'));assert.ok(!fragment.tokens.some(t=>t.name==='--radius-lg'));
  browser('focus','[data-token-dependencies]');browser('press','Space');const closure=exported();assert.ok(closure.tokens.some(t=>t.name==='--radius-lg'));assert.deepEqual(closure.requested,fragment.requested);
  evaluate('window.copiedTokenCss="";Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>window.copiedTokenCss=text}})');
  browser('focus','[data-token-copy]');browser('press','Enter');browser('wait','--fn','window.copiedTokenCss.length > 0');assert.ok(evaluate('window.copiedTokenCss.includes("--radius-lg: 1rem")'));
  browser('focus','[data-token-reference-details] summary');browser('press','Enter');assert.ok(evaluate('document.querySelector("[data-token-reference-details]").textContent.includes("var(--radius-lg)")'));
});
test('export context stays independent from page theme and clipboard rejection retains data',()=>{
  open();browser('select','[data-token-export-theme]','dark');browser('wait','--fn','JSON.parse(decodeURIComponent(document.querySelector("a[download]").getAttribute("href").split(",").slice(1).join(","))).theme === "dark"');assert.equal(exported().theme,'dark');
  evaluate('Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:()=>Promise.reject(new Error("controlled rejection"))}})');browser('focus','[data-token-copy]');browser('press','Enter');browser('wait','--fn','document.querySelector("main [role=status]").textContent.includes("Clipboard unavailable")');
  assert.ok(exported().tokens.length>0);
});
test('expanded graph and dependency controls reflow at 320px/200% text',()=>{
  open(320);browser('focus','[data-token-dependencies]');browser('press','Space');browser('focus','[data-token-reference-details] summary');browser('press','Enter');
  for(const theme of ['light','dark']){evaluate(`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'));`);browser('wait',`html.${theme}`);assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));}
  evaluate('document.documentElement.style.fontSize="200%"');assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
});
