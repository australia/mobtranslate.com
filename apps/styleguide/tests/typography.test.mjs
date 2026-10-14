import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile(new URL('../public/fonts/roboto-flex.json',import.meta.url),'utf8'));
const session=`mobtranslate-typography-${process.pid}`,base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
function browser(...args){const result=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}}));assert.equal(result.success,true,result.error);return result.data;}
const evaluate=code=>browser('eval',code).result;
function open(width=1440){browser('set','viewport',String(width),'1000');browser('open',`${base}/foundations/typography`);browser('wait','[data-type-text]');}
function ready(){browser('wait','--fn','document.querySelector("[data-type-font-status]")?.textContent.startsWith("Local variable font loaded")');}
function variable(){browser('select','[data-type-family]','local-variable');ready();}
function activate(selector){browser('focus',selector);browser('press','Enter');}
function width(){return evaluate('(() => {const r=document.createRange();r.selectNodeContents(document.querySelector("[data-typography-preview]"));return r.getBoundingClientRect().width;})()');}
function axis(tag,key){browser('focus',`[data-type-axis=${tag}]`);browser('press',key);}
after(()=>browser('close'));

test('multiline user text, spacing and numeric features are real presentation settings',()=>{
  open();const text='First line\nSecond line 0123456789';browser('fill','[data-type-text]',text);
  browser('select','[data-type-tracking]','0.12');browser('select','[data-type-leading]','3');
  browser('focus','[data-type-tabular]');browser('press','Space');
  const result=evaluate('(() => {const p=document.querySelector("[data-typography-preview]"),s=getComputedStyle(p);return {text:p.textContent,spacing:s.letterSpacing,leading:s.lineHeight,numeric:s.fontVariantNumeric,white:s.whiteSpace};})()');
  assert.equal(result.text,text);assert.equal(result.spacing,'2.88px');assert.equal(result.leading,'72px');assert.equal(result.numeric,'tabular-nums');assert.equal(result.white,'pre-wrap');
  assert.ok(evaluate('document.querySelector("[data-type-text]").clientHeight>=document.querySelector("[data-type-text]").scrollHeight'));
});

test('delivered font bytes load and width/grade coordinates affect the real face',()=>{
  open();const root=evaluate('getComputedStyle(document.documentElement).getPropertyValue("--font-sans")');variable();
  const loaded=evaluate('[...document.fonts].filter(face=>face.family.includes("Styleguide Roboto Flex")).map(face=>face.status)');assert.deepEqual(loaded,['loaded']);
  const bytes=browser('eval',`(async()=>{const b=await (await fetch('/fonts/roboto-flex.ttf')).arrayBuffer();return {length:b.byteLength,sha:[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('')};})()`).result;
  assert.equal(bytes.length,manifest.font.bytes);assert.equal(bytes.sha,manifest.font.sha256);
  browser('fill','[data-type-text]','Hamburgefonts 0123456789');axis('wdth','Home');const narrow=width();assert.equal(evaluate('document.querySelector("[data-type-axis=wdth]").value'),'25');axis('wdth','End');const wide=width();assert.equal(evaluate('document.querySelector("[data-type-axis=wdth]").value'),'151');assert.ok(wide>narrow+50,JSON.stringify({narrow,wide}));
  activate('[data-type-axis-reset]');const normal=width();axis('GRAD','Home');assert.ok(Math.abs(width()-normal)<0.2);axis('GRAD','End');assert.ok(Math.abs(width()-normal)<0.2);
  axis('opsz','Home');const smallOptical=width();axis('opsz','End');assert.ok(Math.abs(width()-smallOptical)>50);assert.equal(evaluate('getComputedStyle(document.querySelector("[data-typography-preview]")).fontSize'),'24px');
  axis('wght','End');assert.ok(evaluate('getComputedStyle(document.querySelector("[data-typography-preview]")).fontVariationSettings.includes("1000")'));
  activate('[data-type-advanced] summary');assert.equal(evaluate('document.querySelectorAll("[data-type-axis]").length'),13);
  activate('[data-type-axis-reset]');assert.equal(evaluate('document.querySelector("[data-type-axis=wght]").value'),'400');
  assert.equal(evaluate('getComputedStyle(document.documentElement).getPropertyValue("--font-sans")'),root);
});

test('a loading API rejection keeps fallback/input and keyboard retry returns to the actual face',()=>{
  open();browser('fill','[data-type-text]','Retained through loading failure');
  evaluate('window.originalTypeLoad=document.fonts.load.bind(document.fonts);document.fonts.load=()=>Promise.reject(new Error("controlled loading API rejection"));');
  browser('select','[data-type-family]','local-variable');browser('wait','--fn','document.querySelector("[data-type-font-status]").textContent.includes("could not load")');
  assert.ok(evaluate('[...document.querySelectorAll("[data-type-axis]")].every(x=>x.disabled)'));
  assert.ok(!evaluate('getComputedStyle(document.querySelector("[data-typography-preview]")).fontFamily').includes('Styleguide Roboto Flex'));
  assert.equal(evaluate('document.querySelector("[data-type-text]").value'),'Retained through loading failure');
  evaluate('document.fonts.load=window.originalTypeLoad');activate('[data-type-font-retry]');ready();
  assert.equal(evaluate('document.activeElement.hasAttribute("data-type-font-retry")'),true);
  assert.equal(evaluate('document.querySelector("[data-typography-preview]").textContent'),'Retained through loading failure');
});

test('superseded held loading cannot overwrite the current family or edits',()=>{
  open();evaluate('window.originalTypeLoad=document.fonts.load.bind(document.fonts);document.fonts.load=(...args)=>new Promise(resolve=>window.finishTypeLoad=()=>window.originalTypeLoad(...args).then(resolve));');
  browser('select','[data-type-family]','local-variable');browser('wait','--fn','typeof window.finishTypeLoad==="function"');assert.ok(evaluate('document.querySelector("[data-type-axis=wght]").disabled'));
  assert.ok(!evaluate('getComputedStyle(document.querySelector("[data-typography-preview]")).fontFamily').includes('Styleguide Roboto Flex'));
  browser('select','[data-type-family]','--font-mono');browser('fill','[data-type-text]','Edited while loading');
  evaluate('window.finishTypeLoad();document.fonts.load=window.originalTypeLoad');
  browser('wait','--fn','[...document.fonts].some(face=>face.family.includes("Styleguide Roboto Flex")&&face.status==="loaded")');
  assert.equal(evaluate('document.querySelector("[data-type-family]").value'),'--font-mono');
  assert.equal(evaluate('document.querySelector("[data-typography-preview]").textContent'),'Edited while loading');
  assert.equal(evaluate('document.querySelector("[data-type-font-status]")'),null);
});

test('axes, output and user spacing reflow in both themes at 320px and 200% text',()=>{
  open(320);variable();activate('[data-type-advanced] summary');activate('[data-type-css] summary');
  for(const theme of ['light','dark']){evaluate(`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'));`);browser('wait',`html.${theme}`);assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));}
  evaluate('document.documentElement.style.fontSize="200%"');assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
  assert.ok(evaluate('[...document.querySelectorAll("[data-type-axis]")].every(x=>x.getBoundingClientRect().height>=44&&x.getBoundingClientRect().right<=innerWidth)'));
  browser('select','[data-type-tracking]','0.12');browser('select','[data-type-leading]','1.5');
  evaluate('const p=document.querySelector("[data-typography-preview]");p.style.wordSpacing="0.16em";p.style.marginBlockEnd="2em";');
  assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
  activate('[data-type-font-fallback]');assert.equal(evaluate('document.querySelector("[data-type-family]").value'),'--font-sans');
});
