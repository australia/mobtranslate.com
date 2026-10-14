import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`mobtranslate-watches-${process.pid}`;
const base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
const browser=(...args)=>{
  let output;
  try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}
  catch(error){if(!error.stdout)throw error;output=error.stdout;}
  const response=JSON.parse(output);assert.equal(response.success,true,response.error);return response.data;
};
const evaluate=code=>browser('eval',code).result;
const open=()=>{browser('open',`${base}/foundations/watches`);browser('wait','[data-watch-ready=true]');};
const save=()=>{browser('focus','[data-watch-save]');browser('press','Enter');browser('wait','[data-watch-snapshot]');};
before(()=>browser('set','viewport','320','812'));
after(()=>browser('close'));

test('all round and rectangular settings retain readable scrolling and a bounded touch target',()=>{
  open();
  for(const shape of ['round','rectangular'])for(const size of ['160','204','240'])for(const scale of ['1','1.25','1.5','2']) {
    browser('select','#watch-shape',shape);browser('select','#watch-size',size);browser('select','#watch-scale',scale);
    browser('wait','--fn',`parseFloat(getComputedStyle(document.querySelector('[data-watch-viewport]')).fontSize)===${14*Number(scale)}`);
    const geometry=evaluate(`(()=>{const display=document.querySelector('[data-watch-display]').getBoundingClientRect();const viewport=document.querySelector('[data-watch-viewport]').getBoundingClientRect();const action=document.querySelector('[data-watch-save]');const range=document.createRange();range.selectNodeContents(action);const button=action.getBoundingClientRect();const dx=Math.max(Math.abs(viewport.left-display.left-display.width/2),Math.abs(viewport.right-display.left-display.width/2))+3;const dy=Math.max(Math.abs(viewport.top-display.top-display.height/2),Math.abs(viewport.bottom-display.top-display.height/2))+3;return {diameter:display.width,inside:Math.hypot(dx,dy)<=display.width/2-2,target:[button.width,button.height],lines:range.getClientRects().length,overflow:document.documentElement.scrollWidth>innerWidth};})()`);
    assert.equal(geometry.diameter,Number(size));
    if(shape==='round')assert.equal(geometry.inside,true,`${size}, ${scale}: focus envelope inside circle`);
    assert.ok(geometry.target.every(value=>value>=44),`${shape} ${size} ${scale}`);
    assert.equal(geometry.lines,1,`${shape} ${size} ${scale}: short action label stays on one line`);
    assert.equal(geometry.overflow,false,`${shape} ${size} ${scale}`);
  }
});

test('native keyboard scrolling reaches the real Save action and captures the entered draft',()=>{
  open();browser('select','#watch-size','160');browser('select','#watch-scale','2');
  browser('fill','#watch-note','An English interface note with a full source reminder. '.repeat(8));
  browser('focus','[data-watch-viewport]');browser('press','PageDown');
  browser('wait','--fn','document.querySelector("[data-watch-viewport]").scrollTop>0');
  browser('press','Tab');
  browser('wait','--fn','document.activeElement.hasAttribute("data-watch-save")');
  browser('press','Enter');browser('wait','[data-watch-snapshot]');
  assert.equal(evaluate('document.querySelector("[data-watch-snapshot]").textContent'),evaluate('document.querySelector("#watch-note").value'));
  assert.ok(evaluate('document.querySelector("[data-watch-status]").textContent.includes("No remote transfer")'));
  browser('wait','--fn','(()=>{const v=document.querySelector("[data-watch-viewport]").getBoundingClientRect(),b=document.querySelector("[data-watch-save]").getBoundingClientRect();return b.top-6>=v.top && b.bottom+6<=v.bottom;})()');
});

test('editing and shape changes preserve a saved snapshot until a new Save; clear retains the draft',()=>{
  open();browser('fill','#watch-note','Original local draft');save();
  browser('fill','#watch-note','Revised local draft');browser('select','#watch-shape','rectangular');browser('select','#watch-size','240');
  assert.equal(evaluate('document.querySelector("[data-watch-snapshot]").textContent'),'Original local draft');
  save();assert.equal(evaluate('document.querySelector("[data-watch-snapshot]").textContent'),'Revised local draft');
  browser('find','role','button','click','--name','Clear local saved snapshot','--exact');
  browser('wait','--fn','!document.querySelector("[data-watch-snapshot]")');
  assert.equal(evaluate('document.querySelector("#watch-note").value'),'Revised local draft');
});

test('a whitespace draft disables Save without overwriting an existing snapshot',()=>{
  open();browser('fill','#watch-note','Keep this local snapshot');save();
  browser('fill','#watch-note','   ');
  browser('wait','--fn','document.querySelector("[data-watch-save]").disabled');
  assert.equal(evaluate('document.querySelector("[data-watch-snapshot]").textContent'),'Keep this local snapshot');
  assert.ok(evaluate('document.querySelector("[data-watch-viewport]").textContent.includes("No note entered")'));
  browser('fill','#watch-note','Recovered draft');save();
  assert.equal(evaluate('document.querySelector("[data-watch-snapshot]").textContent'),'Recovered draft');
});

test('both themes and long unbroken text preserve 320px reflow and a usable retained task',()=>{
  for(const theme of ['light','dark']) {
    open();evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'))`);browser('wait',`html.${theme}`);
    browser('fill','#watch-note','LongInterfaceLabel'.repeat(12));browser('select','#watch-scale','2');save();
    assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    assert.equal(evaluate('document.querySelector("[data-watch-viewport]").scrollWidth>document.querySelector("[data-watch-viewport]").clientWidth'),false);
    assert.equal(evaluate('document.querySelector("[data-watch-snapshot]").textContent'), 'LongInterfaceLabel'.repeat(12));
  }
});
