import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`rtl-contract-${process.pid}`,base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
function browser(...args){const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000}));assert.equal(r.success,true,r.error);return r.data;}
const evaluate=code=>browser('eval',code).result;
after(()=>browser('close'));

test('navigation symbols follow effective nested direction rather than any RTL ancestor',()=>{
  for(const [route,selector] of [['breadcrumbs','.mt-breadcrumbs-chevron'],['pagination','.mt-pagination-nav svg']]) {
    browser('open',`${base}/components/${route}`);browser('wait',selector);
    evaluate('document.documentElement.dir="rtl"');
    // Both working examples deliberately start with an explicit local LTR region.
    assert.equal(evaluate(`getComputedStyle(document.querySelector('${selector}')).direction`),'ltr');
    assert.match(evaluate(`getComputedStyle(document.querySelector('${selector}')).transform`),/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/,route);
    browser('find','role','button','click','--name',`Use RTL local ${route}`,'--exact');
    assert.equal(evaluate(`getComputedStyle(document.querySelector('${selector}')).transform`),'matrix(-1, 0, 0, -1, 0, 0)',route);
  }
});

test('RTL audio layout retains LTR timeline geometry and forward keyboard seeking',()=>{
  browser('set','viewport','320','1000');
  browser('open',`${base}/patterns/audio`);browser('wait','--fn','document.querySelector("#local-test-audio")?.duration===6');
  browser('find','role','button','click','--name','Use RTL audio layout','--exact');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-audio-lab]")).direction'),'rtl');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-audio-lab] .mt-slider")).direction'),'ltr');
  assert.equal(evaluate('getComputedStyle(document.querySelector("#local-test-audio")).direction'),'ltr');
  browser('focus','[data-audio-lab] .mt-slider input[type=range]');browser('press','ArrowRight');
  browser('wait','--fn','document.querySelector("#local-test-audio").currentTime>=.09');
  browser('press','ArrowLeft');browser('wait','--fn','document.querySelector("#local-test-audio").currentTime===0');
  browser('focus','#local-audio-volume');browser('press','Home');browser('press','ArrowRight');
  browser('wait','--fn','document.querySelector("#local-test-audio").volume>=.049');
  evaluate("document.documentElement.style.fontSize='200%'");
  evaluate('document.fonts.ready');
  assert.equal(evaluate('document.documentElement.scrollWidth'),320);
  const reference=evaluate('(()=>{const r=document.querySelector(".doc-links a[href*=HTMLMediaElement]").getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};})()');
  assert.ok(reference.left>=0&&reference.right<=320&&reference.height>=44,JSON.stringify(reference));
});

test('indeterminate progress follows effective direction while a local LTR exception stays LTR',()=>{
  browser('open',`${base}/components/progress`);browser('wait','.mt-progress-indicator[data-indeterminate]');
  browser('set','media','light');
  evaluate('document.documentElement.dir="rtl"');
  const animation=()=>evaluate('getComputedStyle(document.querySelector(".mt-progress-indicator[data-indeterminate]")).animationDirection');
  assert.equal(animation(),'reverse');
  evaluate('document.querySelector(".mt-progress-indicator[data-indeterminate]").closest(".mt-progress").dir="ltr"');
  assert.equal(animation(),'normal');
  browser('find','role','button','click','--name','Complete one local step','--exact');
  for(const direction of ['ltr','rtl']) {
    evaluate(`document.querySelector('.mt-progress').dir='${direction}'`);
    const edges=evaluate('(()=>{const i=document.querySelector(".mt-progress-indicator").getBoundingClientRect(),t=document.querySelector(".mt-progress-track").getBoundingClientRect();return {left:Math.abs(i.left-t.left),right:Math.abs(i.right-t.right)};})()');
    assert.ok(edges[direction==='rtl'?'right':'left']<1,JSON.stringify({direction,edges}));
  }
});

test('vertical tab indicator follows the local direction inside an opposite-direction document',()=>{
  browser('open',`${base}/components/tabs`);browser('wait','[data-tabs-lab]');
  evaluate('document.documentElement.dir="rtl"');
  browser('find','role','button','click','--name','Use vertical local tabs','--exact');
  browser('wait','--fn','(()=>{const i=document.querySelector(".mt-tabs-indicator").getBoundingClientRect(),l=document.querySelector(".mt-tabs-list").getBoundingClientRect();return i.height>0&&Math.abs(i.right-l.right)<3;})()');
  browser('find','role','button','click','--name','Use RTL local tabs','--exact');
  browser('wait','--fn','(()=>{const i=document.querySelector(".mt-tabs-indicator").getBoundingClientRect(),l=document.querySelector(".mt-tabs-list").getBoundingClientRect();return i.height>0&&Math.abs(i.left-l.left)<3;})()');
});
