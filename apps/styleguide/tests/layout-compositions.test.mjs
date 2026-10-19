import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003',session=`mobtranslate-compositions-${process.pid}`;
const browser=(...args)=>{let output;try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}catch(error){if(!error.stdout)throw error;output=error.stdout;}const result=JSON.parse(output);assert.equal(result.success,true,result.error);return result.data;};
const evaluate=code=>browser('eval',code).result;
const open=(width=1600)=>{browser('set','viewport',String(width),'1000');browser('open',`${base}/foundations/layout-compositions`);browser('wait','[data-composition-ready=true]');};
const activate=selector=>{browser('focus',selector);browser('press','Enter');};
const width=key=>{browser('focus','#composition-width');browser('press',key);browser('wait','--fn',key==='Home'?'document.querySelector("[data-composition-container]").getBoundingClientRect().width<640':'document.querySelector("[data-composition-container]").getBoundingClientRect().width>900');};
const select=id=>{if(evaluate('document.querySelector("[data-composition-list]").hidden'))activate('[data-composition-back]');activate(`[data-composition-open="${id}"]`);browser('wait','--fn','document.activeElement.hasAttribute("data-composition-heading")');};
before(()=>browser('set','viewport','1600','1000'));
after(()=>browser('close'));

test('the actual narrow container reflows on a wide viewport and preserves a keyboard return path',()=>{
  open();width('Home');
  assert.ok(evaluate('document.querySelector("[data-composition-measure]").textContent.includes("Single pane")'));
  select('a');assert.equal(evaluate('document.querySelector("[data-composition-list]").hidden'),true);
  browser('fill','#composition-note','Retained A');activate('[data-composition-save]');
  assert.equal(evaluate('document.querySelector("[data-composition-saved]").textContent'),'Saved note: Retained A');
  activate('[data-composition-back]');browser('wait','--fn','document.activeElement.dataset.compositionOpen==="a"');
  select('b');browser('fill','#composition-note','Retained B');activate('[data-composition-back]');select('a');
  assert.equal(evaluate('document.querySelector("#composition-note").value'),'Retained A');
  browser('fill','#composition-note','New unsaved A');assert.equal(evaluate('document.querySelector("[data-composition-saved]").textContent'),'Saved note: Retained A');
  browser('select','#composition-mode','supporting');browser('select','#composition-record','b');
  assert.equal(evaluate('document.querySelector("#composition-note").value'),'Retained B');
  browser('select','#composition-record','a');browser('select','#composition-mode','feed');
  assert.equal(evaluate('document.querySelector("#composition-note").value'),'New unsaved A');
  assert.equal(evaluate('document.querySelector("[data-composition-saved]").textContent'),'Saved note: Retained A');
});

test('resizing moves focus before the selected collection is hidden',()=>{
  open();width('End');select('b');browser('focus','[data-composition-open="b"]');
  // Resize the actual containing viewport while focus remains on its collection item.
  browser('set','viewport','320','812');browser('wait','--fn','document.querySelector("[data-composition-list]").hidden');
  browser('wait','--fn','document.activeElement.hasAttribute("data-composition-heading")');
  assert.equal(evaluate('document.activeElement.textContent'),'Example B');
  activate('[data-composition-back]');browser('wait','--fn','document.activeElement.dataset.compositionOpen==="b"');
});

test('pane preferences are keyboard adjustable, bounded and retained while stacked',()=>{
  open();width('End');browser('focus','#composition-share');browser('press','End');
  assert.equal(evaluate('document.querySelector("#composition-share").value'),'70');
  const ratio=evaluate('(()=>{const a=document.querySelector("[data-composition-list]").getBoundingClientRect(),b=document.querySelector("[data-composition-task]").getBoundingClientRect();return a.width/b.width;})()');
  assert.ok(Math.abs(ratio-70/30)<.03,ratio);
  width('Home');assert.equal(evaluate('document.querySelector("#composition-share").value'),'70');width('End');
  browser('select','#composition-mode','supporting');assert.equal(evaluate('document.querySelector("#composition-share").value'),'66');
  browser('focus','#composition-share');browser('press','Home');assert.equal(evaluate('document.querySelector("#composition-share").value'),'30');
  browser('select','#composition-mode','list-detail');assert.equal(evaluate('document.querySelector("#composition-share").value'),'70');
});

test('feed tracks and supporting context respond to real container geometry',()=>{
  open();width('End');browser('select','#composition-mode','feed');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-composition-list] ul")).gridTemplateColumns.split(" ").length'),3);
  width('Home');assert.equal(evaluate('getComputedStyle(document.querySelector("[data-composition-list] ul")).gridTemplateColumns.split(" ").length'),1);
  select('c');activate('[data-composition-back]');browser('wait','--fn','document.activeElement.dataset.compositionOpen==="c"');
  browser('select','#composition-mode','supporting');
  assert.ok(evaluate('(()=>{const a=document.querySelector("[data-composition-task]").getBoundingClientRect(),b=document.querySelector("[data-composition-support]").getBoundingClientRect();return b.top>=a.bottom;})()'));
  width('End');assert.ok(evaluate('(()=>{const a=document.querySelector("[data-composition-task]").getBoundingClientRect(),b=document.querySelector("[data-composition-support]").getBoundingClientRect();return Math.abs(a.top-b.top)<1&&b.left>a.right;})()'));
  browser('focus','#composition-rtl');browser('press','Space');
  assert.ok(evaluate('(()=>{const a=document.querySelector("[data-composition-task]").getBoundingClientRect(),b=document.querySelector("[data-composition-support]").getBoundingClientRect();return b.right<a.left;})()'));
  assert.equal(evaluate('document.querySelector("[data-composition-task]").compareDocumentPosition(document.querySelector("[data-composition-support]")) & Node.DOCUMENT_POSITION_FOLLOWING'),4);
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-composition-support] p")).direction'),'ltr');
  assert.equal(evaluate('document.querySelector("#composition-note").dir'),'auto');
  const glyphFixture='\u05d0 \u05d1 123'; // Unicode glyph fixture, not a translated message.
  browser('fill','#composition-note',glyphFixture);activate('[data-composition-save]');
  assert.equal(evaluate('document.querySelector("[data-composition-saved] bdi").textContent'),glyphFixture);
  assert.equal(evaluate('document.querySelector("[data-composition-saved] bdi").getAttribute("lang")'),'');
});

test('all compositions retain long exact notes, wrapping actions and root bounds in both themes',()=>{
  open(320);const long='Exact-'+ 'LongUnbrokenText'.repeat(120);
  for(const theme of ['light','dark']){
    browser('eval',`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'));`);browser('wait',`html.${theme}`);
    for(const mode of ['list-detail','feed','supporting']){
      browser('select','#composition-mode',mode);if(mode!=='supporting')select('a');else browser('select','#composition-record','a');
      browser('fill','#composition-note',long);activate('[data-composition-save]');
      assert.equal(evaluate('document.querySelector("[data-composition-saved]").textContent'),'Saved note: '+long);
      assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
      assert.ok(evaluate('[...document.querySelectorAll(".composition-shell button")].filter(x=>x.getClientRects().length).every(x=>x.getBoundingClientRect().height>=44)'));
    }
  }
});
