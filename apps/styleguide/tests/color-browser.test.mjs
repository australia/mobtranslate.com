import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(new URL('../public/fixtures/color-source.json',import.meta.url),'utf8'));
const session=`mobtranslate-color-${process.pid}`,base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
const browser=(...args)=>{let output;try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}catch(error){if(!error.stdout)throw error;output=error.stdout;}const result=JSON.parse(output);assert.equal(result.success,true,result.error);return result.data;};
const evaluate=code=>browser('eval',code).result;
const open=(width=1440)=>{browser('set','viewport',String(width),'1000');browser('open',`${base}/foundations/color-schemes`);browser('wait','[data-color-proposal-ready=true]');};
const fill=(field,value)=>browser('fill',`[data-color-input=${field}]`,value);
const select=(field,value)=>browser('select',`[data-color-input=${field}]`,value);
const activate=selector=>{browser('focus',selector);browser('press','Enter');};
const capture=()=>activate('[data-color-capture]');
const full=()=>{if(!evaluate('document.querySelector("[data-color-full]").open'))activate('[data-color-full] summary');return JSON.parse(evaluate('document.querySelector("[data-color-full] code").textContent'));};
before(()=>browser('set','media','light'));
after(()=>browser('close'));

test('draft/invalid values preserve capture and generation stays locally scoped',()=>{
  open();const root=evaluate('getComputedStyle(document.documentElement).getPropertyValue("--color-primary")');
  fill('sourceHex','#395d75');assert.equal(full().input.sourceHex,'#b45e2a');
  fill('sourceHex','invalid');assert.equal(evaluate('document.querySelector("[data-color-capture]").disabled'),true);assert.equal(full().input.sourceHex,'#b45e2a');
  fill('sourceHex','#395d75');capture();assert.equal(full().input.sourceHex,'#395d75');
  assert.equal(evaluate('getComputedStyle(document.documentElement).getPropertyValue("--color-primary")'),root);
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-color-preview]")).getPropertyValue("--color-primary").trim()'),full().preview.primary);
  activate('[data-color-preview] button');assert.ok(evaluate('document.querySelector("[data-color-status]").textContent.includes("activated locally")'));
});
test('HCT gamut, theme, variants and effective specification are inspectable',()=>{
  open();select('sourceMode','hct');fill('hue','360');fill('chroma','150');fill('tone','95');capture();
  const result=full();assert.equal(result.input.requestedHct.chroma,150);assert.ok(result.source.chroma<150);assert.ok(Math.abs(result.source.tone-95)<1);
  browser('focus','[data-color-input=tone]');browser('press','Control+A');browser('press','Backspace');assert.equal(evaluate('document.querySelector("[data-color-capture]").disabled'),true);
  fill('tone','50');select('variant','fidelity');capture();assert.equal(full().effectiveSpec,'2021');
  browser('focus','[data-color-input=isDark]');browser('press','Space');select('contrastLevel','1');capture();assert.equal(full().input.isDark,true);assert.equal(full().input.contrastLevel,1);
  browser('select','[data-color-role-select]','on_primary');assert.ok(evaluate('document.querySelector("[data-color-role-detail]").textContent.includes("primary")'));
  browser('select','[data-color-palette-select]','tertiary');assert.equal(evaluate(`document.querySelectorAll('[aria-label="Captured tonal palette"] tbody tr').length`),11);
});
test('harmonization changes the custom result without altering semantic roles',()=>{
  open();const before=full();browser('focus','[data-color-input=harmonize]');browser('press','Space');capture();const after=full();
  assert.notEqual(after.custom.result.hex,before.custom.result.hex);assert.deepEqual(after.roles,before.roles);assert.equal(after.custom.original.hex,'#386b4f');
});
test('actual fixture extraction selects a ranked seed and requires separate capture',()=>{
  open();const before=full().source.hex;activate('[data-color-extract]');browser('wait','--fn','document.querySelector("[data-color-status]").textContent.startsWith("SDK selected")');
  const seed=evaluate('document.querySelector("[data-color-input=sourceHex]").value');assert.ok(fixture.bands.some(band=>band.hex===seed));assert.equal(full().source.hex,before);
  capture();assert.equal(full().input.sourceHex,seed);assert.equal(evaluate(`document.querySelector('img[src="/fixtures/color-source.svg"]').naturalWidth`),fixture.width);
});
test('held extraction cannot duplicate work or overwrite a competing draft edit',()=>{
  open();evaluate(`const image=document.querySelector('img[src="/fixtures/color-source.svg"]');window.colorDecodeCount=0;image.decode=()=>{window.colorDecodeCount++;return new Promise(resolve=>window.finishColorDecode=resolve);};`);
  activate('[data-color-extract]');activate('[data-color-extract]');assert.equal(evaluate('window.colorDecodeCount'),1);
  assert.equal(evaluate('document.querySelector("[data-color-extract]").disabled'),false);assert.equal(evaluate('document.querySelector("[data-color-extract]").getAttribute("aria-disabled")'),'true');
  fill('sourceHex','#123456');evaluate('window.finishColorDecode()');browser('wait','--fn','document.querySelector("[data-color-status]").textContent.includes("draft source was retained")');
  assert.equal(evaluate('document.querySelector("[data-color-input=sourceHex]").value'),'#123456');assert.equal(full().input.sourceHex,'#b45e2a');
});
test('decode failure retains source and capture with a reachable trigger',()=>{
  open();evaluate(`document.querySelector('img[src="/fixtures/color-source.svg"]').decode=()=>Promise.reject(new Error('controlled decode failure'));`);
  activate('[data-color-extract]');browser('wait','--fn','document.querySelector("[data-color-status]").textContent.includes("extraction failed")');assert.equal(full().input.sourceHex,'#b45e2a');
  assert.equal(evaluate('document.querySelector("[data-color-extract]").disabled'),false);
});
test('both themes, full output and enlarged text reflow at a narrow viewport',()=>{
  open(320);for(const theme of ['light','dark']){browser('eval',`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'));`);browser('wait',`html.${theme}`);assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));const proposal=full();assert.ok(proposal.roles.length>30);
    const expected=`rgb(${[1,3,5].map(index=>parseInt(proposal.preview.onSurface.slice(index,index+2),16)).join(', ')})`;
    assert.equal(evaluate('getComputedStyle(document.querySelector("[data-color-preview] p")).color'),expected);
    assert.equal(evaluate('getComputedStyle(document.querySelector("[data-color-preview] h3")).color'),expected);
  }
  browser('eval','document.documentElement.style.fontSize="200%"');assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
  assert.ok(evaluate('[...document.querySelectorAll("[data-color-capture],[data-color-extract],[data-color-preview] button")].every(x=>x.getBoundingClientRect().height>=44&&x.getBoundingClientRect().right<=innerWidth)'));
});
