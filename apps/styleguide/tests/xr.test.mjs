import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
const session=`mobtranslate-xr-${process.pid}`;
const browser=(...args)=>{
  let output;try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}catch(error){if(!error.stdout)throw error;output=error.stdout;}
  const response=JSON.parse(output);assert.equal(response.success,true,response.error);return response.data;
};
const evaluate=code=>browser('eval',code).result;
const open=()=>{browser('open',`${base}/foundations/xr`);browser('wait','[data-xr-ready=true]');};
const click=name=>browser('find','role','button','click','--name',name,'--exact');
const result=selector=>Number(evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent.replace('°','')`));
before(()=>browser('set','viewport','1440','1000'));
after(()=>browser('close'));

test('known physical geometry and proportional scaling produce the expected angular values',()=>{
  open();browser('fill','#xr-width','2');browser('fill','#xr-height','2');browser('fill','#xr-distance','1');
  browser('wait','--fn','document.querySelector("[data-xr-horizontal]").textContent==="90.000°"');
  assert.equal(result('[data-xr-vertical]'),90);
  browser('fill','#xr-width','4');browser('fill','#xr-height','4');browser('fill','#xr-distance','2');
  assert.equal(result('[data-xr-horizontal]'),90);assert.equal(result('[data-xr-vertical]'),90);
  browser('fill','#xr-distance','4');assert.ok(result('[data-xr-horizontal]')<90);
  assert.ok(evaluate('document.querySelector("[data-xr-results] svg desc").textContent.includes("screen pixels are not physical metres")'));
});

test('invalid values hide current geometry while preserving a frozen proposal and recovery',()=>{
  open();click('Capture geometry proposal');
  const snapshot=evaluate('document.querySelector("[data-xr-proposal] pre").textContent');
  browser('fill','#xr-distance','0');browser('wait','--fn','!document.querySelector("[data-xr-results]")');
  assert.equal(evaluate('document.querySelector("#xr-distance").getAttribute("aria-invalid")'),'true');
  assert.equal(evaluate('document.querySelector("[data-xr-proposal] pre").textContent'),snapshot);
  click('Reset geometry inputs');browser('wait','[data-xr-results]');
  browser('fill','#xr-target','1');browser('wait','#xr-target-error');
  assert.ok(evaluate('document.querySelector("#xr-target-error").textContent.includes("fit within both")'));
  assert.equal(evaluate('document.querySelector("[data-xr-results]")'),null);
  click('Reset geometry inputs');browser('fill','#xr-width','1.2');click('Capture geometry proposal');
  assert.equal(JSON.parse(evaluate('document.querySelector("[data-xr-proposal] pre").textContent')).width,1.2);
  browser('focus','#xr-width');browser('press','Control+A');browser('press','Backspace');browser('wait','--fn','!document.querySelector("[data-xr-results]")');
  assert.equal(JSON.parse(evaluate('document.querySelector("[data-xr-proposal] pre").textContent')).width,1.2);
});

test('support true/false, unavailable API and rejection never start an immersive session',()=>{
  open();
  evaluate('window.xrSessionCalls=0;window.xrModeCalls=[];Object.defineProperty(navigator,"xr",{configurable:true,value:{isSessionSupported:async mode=>{window.xrModeCalls.push(mode);return true},requestSession:()=>{window.xrSessionCalls++}}})');
  click('Check browser support');browser('wait','--fn','document.querySelector("[data-xr-support]").textContent.includes("Support reported for immersive-vr")');
  assert.deepEqual(evaluate('window.xrModeCalls'),['immersive-vr']);assert.equal(evaluate('window.xrSessionCalls'),0);
  evaluate('navigator.xr.isSessionSupported=async()=>false');click('Check browser support');browser('wait','--fn','document.querySelector("[data-xr-support]").textContent.includes("No support reported")');
  evaluate('navigator.xr.isSessionSupported=async()=>{throw new Error("Fixture rejection")}');click('Check browser support');browser('wait','--fn','document.querySelector("[data-xr-support]").textContent.includes("Could not check")');
  evaluate('Object.defineProperty(navigator,"xr",{configurable:true,value:undefined})');click('Check browser support');browser('wait','--fn','document.querySelector("[data-xr-support]").textContent.includes("not exposed")');
  assert.ok(evaluate('document.querySelector("[data-xr-results]")!==null'));
  assert.equal(evaluate('window.xrSessionCalls'),0);
});

test('changing mode invalidates a held capability response while a new query can finish',()=>{
  open();
  evaluate('window.xrSessionCalls=0;window.xrHeld=false;Object.defineProperty(navigator,"xr",{configurable:true,value:{isSessionSupported:mode=>mode==="immersive-vr"?new Promise(resolve=>{window.xrHeld=true;window.xrRelease=()=>resolve(true)}):Promise.resolve(false),requestSession:()=>{window.xrSessionCalls++}}})');
  click('Check browser support');browser('wait','--fn','window.xrHeld===true');browser('select','#xr-mode','immersive-ar');
  browser('wait','--fn','document.querySelector("[data-xr-support]").textContent.includes("Not checked for immersive-ar")');
  click('Check browser support');browser('wait','--fn','document.querySelector("[data-xr-support]").textContent.includes("No support reported for immersive-ar")');
  evaluate('window.xrRelease()');assert.ok(evaluate('document.querySelector("[data-xr-support]").textContent.includes("No support reported for immersive-ar")'));
  assert.equal(evaluate('window.xrSessionCalls'),0);
});

test('keyboard capture and invalid-input recovery remain operable at 320px in both themes',()=>{
  browser('set','viewport','320','812');
  for(const theme of ['light','dark']) {
    open();evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'))`);browser('wait',`html.${theme}`);
    browser('focus','[data-xr-capture]');browser('press','Enter');browser('wait','[data-xr-proposal]');
    assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    browser('fill','#xr-height','0.001');browser('wait','#xr-height-error');
    assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    click('Reset geometry inputs');browser('wait','[data-xr-results]');
    assert.equal(result('[data-xr-aspect]'),1.6);
  }
});
