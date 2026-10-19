import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003',session=`enlarged-actions-${process.pid}`;
function browser(...args){const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000}));assert.equal(r.success,true,r.error);return r.data;}
const evaluate=code=>browser('eval',code).result;
after(()=>browser('close'));

test('all text-button sizes retain complete hit areas and task recovery at 320px and 200% text',()=>{
  browser('set','viewport','320','1000');
  for(const theme of ['light','dark'])for(const [size,minimum] of [['sm',72],['md',88],['lg',96]]) {
    browser('open',`${base}/components/button`);browser('wait','[data-button-lab]');
    evaluate(`document.documentElement.style.fontSize='200%';localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'));`);
    browser('wait',`html.${theme}`);
    evaluate('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
    browser('select','[data-button-lab] .grid label:nth-child(2) select',size);
    const measured=evaluate('(()=>{const b=document.querySelector("[data-action-button]"),box=b.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(b);return {root:document.documentElement.scrollWidth,width:innerWidth,box:box.toJSON(),text:[...r.getClientRects()].map(x=>x.toJSON())};})()');
    assert.equal(measured.root,320,JSON.stringify({theme,size,measured}));
    assert.ok(measured.box.height>minimum,JSON.stringify({theme,size,measured}));
    assert.ok(measured.text.length>1,'The real action label wraps');
    for(const r of measured.text)assert.ok(r.left>=measured.box.left&&r.right<=measured.box.right&&r.top>=measured.box.top&&r.bottom<=measured.box.bottom,JSON.stringify({theme,size,r,box:measured.box}));
    browser('focus','[data-action-button]');browser('press','Enter');
    browser('wait','--fn','document.querySelector("[data-button-lab] [role=status]").textContent.includes("pending")');
    assert.equal(evaluate('document.documentElement.scrollWidth'),320);
    browser('find','role','button','click','--name','Cancel example action','--exact');
    browser('wait','--fn','document.querySelector("[data-button-lab] [role=status]").textContent.includes("cancelled")&&document.activeElement.hasAttribute("data-action-button")');
    assert.equal(evaluate('document.documentElement.scrollWidth'),320);
  }
});
