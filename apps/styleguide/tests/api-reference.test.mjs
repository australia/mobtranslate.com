import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`mobtranslate-api-reference-${process.pid}`;
const browser=(...args)=>{
  let output;
  try {output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}
  catch(error){if(!error.stdout)throw error;output=error.stdout;}
  const result=JSON.parse(output);assert.equal(result.success,true,result.error);return result.data;
};
const evaluate=code=>browser('eval',code).result;
const base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
const open=(hash='')=>{browser('open',`${base}/guides/api-reference${hash}`);browser('wait','[data-api-ready=true]');};
const choose=name=>{browser('select','#api-export',name);browser('wait',`[data-api-entry=${name}]`);};
before(()=>browser('set','viewport','1440','1000'));
after(()=>browser('close'));

test('compiler register exposes real local and inherited contracts without losing the selected export',()=>{
  open();browser('wait','[data-api-entry=Button]');
  assert.equal(evaluate('document.querySelector("#api-export").options.length'),318);
  assert.ok(evaluate('document.querySelector("[data-api-prop=loading]").textContent.includes("boolean")'));
  browser('fill','#api-query','not-an-export');
  assert.ok(evaluate('document.querySelector("main").textContent.includes("No exported names match")'));
  assert.equal(evaluate('document.querySelector("[data-api-entry]").getAttribute("data-api-entry")'),'Button');
  browser('find','role','button','click','--name','Clear API filters','--exact');
  assert.equal(evaluate('document.activeElement.id'),'api-query');
  choose('AlertTitle');
  assert.ok(evaluate('Array.from({length:6},(_,i)=>String(i+1)).every(value=>document.querySelector("[data-api-prop=headingLevel] td").textContent.includes(value))'));
  browser('select','#api-prop-scope','all');browser('fill','#api-prop-query','aria-label');
  assert.ok(evaluate('document.querySelector("[data-api-prop=aria-label]").textContent.includes("Inherited declaration")'));
  assert.equal(evaluate('location.hash'),'#api-AlertTitle');
});

test('direct export links expose type-only declarations, callable hooks and token values',()=>{
  open('#api-ButtonProps');browser('wait','[data-api-entry=ButtonProps]');
  assert.ok(evaluate('document.querySelector("[data-api-entry]").textContent.includes("Type-only export")'));
  assert.ok(evaluate('document.querySelector("[data-api-entry] pre").textContent.includes("interface ButtonProps")'));
  choose('useToastManager');
  assert.ok(evaluate('document.querySelector("[data-api-entry]").textContent.includes("Runtime export")'));
  assert.ok(evaluate('document.querySelector("[data-api-entry] pre").textContent.includes("ToastManager")'));
  choose('semanticColors');
  assert.ok(evaluate('document.querySelector("[data-api-entry] pre").textContent.includes("Compiler-resolved value type") && document.querySelector("[data-api-entry] pre").textContent.includes("primary")'));
});

test('failed or mismatched responses preserve recovery and never expose a stale contract',()=>{
  open();
  evaluate('window.apiOriginalFetch=window.fetch;window.fetch=()=>Promise.reject(new Error("Fixture request failure"))');
  browser('select','#api-export','NumberField');browser('wait','--fn','document.querySelector("[data-api-status]").textContent.includes("Could not load NumberField")');
  assert.equal(evaluate('document.querySelector("[data-api-entry]")'),null);
  evaluate('window.fetch=window.apiOriginalFetch');
  browser('find','role','button','click','--name','Retry API reference','--exact');browser('wait','[data-api-entry=NumberField]');
  evaluate('window.fetch=async (...args)=>{const response=await window.apiOriginalFetch(...args);const data=await response.json();return new Response(JSON.stringify({...data,revision:"different"}),{status:200})}');
  browser('select','#api-export','Alert');browser('wait','--fn','document.querySelector("[data-api-status]").textContent.includes("Could not load Alert")');
  assert.equal(evaluate('document.querySelector("[data-api-entry]")'),null);
  evaluate('window.fetch=window.apiOriginalFetch');browser('find','role','button','click','--name','Retry API reference','--exact');browser('wait','[data-api-entry=Alert]');
});

test('a late superseded response cannot replace the current export',()=>{
  open();
  evaluate('window.apiOriginalFetch=window.fetch;window.apiHeld=false;window.fetch=(...args)=>String(args[0]).endsWith("/Slider.json")?new Promise(resolve=>{window.apiHeld=true;window.apiRelease=async()=>resolve(await window.apiOriginalFetch(args[0]))}):window.apiOriginalFetch(...args)');
  browser('select','#api-export','Slider');browser('wait','--fn','window.apiHeld===true');
  choose('Table');evaluate('window.apiRelease()');
  browser('wait','--fn','document.querySelector("[data-api-status]").textContent.includes("Table reference loaded")');
  assert.equal(evaluate('document.querySelector("[data-api-entry]").getAttribute("data-api-entry")'),'Table');
  evaluate('window.fetch=window.apiOriginalFetch');
});

test('320px reference reflows in both themes and code remains keyboard accessible',()=>{
  browser('set','viewport','320','812');
  for(const theme of ['light','dark']) {
    open('#api-NumberField');browser('wait','[data-api-entry=NumberField]');
    evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'))`);browser('wait',`html.${theme}`);
    browser('select','#api-prop-scope','all');browser('fill','#api-prop-query','onValueChange');
    assert.ok(evaluate('document.querySelector("[data-api-prop=onValueChange]").textContent.includes("value")'));
    assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    browser('focus','[data-api-entry] pre');browser('press','ArrowRight');
    assert.equal(evaluate('document.activeElement.tagName'),'PRE');
  }
});
