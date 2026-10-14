import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`mobtranslate-spring-${process.pid}`,base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
const browser=(...args)=>{let output;try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}catch(error){if(!error.stdout)throw error;output=error.stdout;}const result=JSON.parse(output);assert.equal(result.success,true,result.error);return result.data;};
const evaluate=code=>browser('eval',code).result;
const open=()=>{browser('open',`${base}/foundations/motion-physics`);browser('wait','[data-spring-ready=true]');};
const fill=(field,value)=>browser('fill',`[data-spring-field=${field}]`,value);
const activate=selector=>{browser('focus',selector);browser('press','Enter');};
const captured=field=>evaluate(`document.querySelector('[data-spring-parameter=${field}]').textContent`);
before(()=>{browser('set','viewport','1440','1000');browser('set','media','light');assert.equal(evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'),false);});
after(()=>browser('close'));

test('draft changes and invalid values cannot rewrite the captured response',()=>{
  open();fill('mass','2');assert.equal(captured('mass'),'1');
  browser('focus','[data-spring-field=damping]');browser('press','Control+A');browser('press','Backspace');
  browser('wait','--fn','document.querySelector("[data-spring-run]").disabled');
  assert.equal(evaluate('document.querySelector("[data-spring-field=damping]").value'),'');
  assert.ok(evaluate('document.querySelector("[data-spring-errors]").textContent.includes("Damping must")'));
  assert.equal(captured('damping'),'20');fill('damping','0');fill('duration','.101');activate('[data-spring-run]');
  browser('wait','--fn','document.querySelector("[data-spring-status]").textContent.includes("preview horizon")');
  assert.equal(captured('mass'),'2');assert.equal(captured('damping'),'0');assert.equal(captured('duration'),'0.101');
  assert.equal(evaluate('document.querySelector("[data-spring-regime]").textContent'),'underdamped');
  fill('mass','0');assert.equal(evaluate('document.querySelector("[data-spring-run]").disabled'),true);assert.equal(captured('mass'),'2');
});

test('all regimes and the full equivalent sample data are reachable',()=>{
  open();browser('set','media','light','reduced-motion');
  for(const [damping,regime] of [['1','underdamped'],['20','critical'],['100','overdamped']]){
    fill('damping',damping);activate('[data-spring-run]');browser('wait','--fn',`document.querySelector('[data-spring-regime]').textContent==='${regime}'`);
  }
  activate('[data-spring-full] summary');browser('wait','[data-spring-full][open]');
  const json=JSON.parse(evaluate('document.querySelector("[data-spring-full] code").textContent'));
  assert.equal(json.parameters.damping,100);assert.equal(json.samples.length,241);assert.equal(json.samples[0].time,0);assert.equal(json.samples.at(-1).time,4);
  assert.equal(evaluate('document.querySelector("[data-spring-live]").getAttribute("aria-live")'),'off');
  browser('set','media','light');
});

test('stop and reset own the last cursor update without stale animation callbacks',()=>{
  open();fill('duration','2');activate('[data-spring-run]');browser('wait','--fn','Number(document.querySelector("[data-spring-plot] line:last-child").getAttribute("x1"))>10');
  activate('[data-spring-stop]');const stopped=evaluate('document.querySelector("[data-spring-live]").textContent');
  browser('wait','400');assert.equal(evaluate('document.querySelector("[data-spring-live]").textContent'),stopped);
  activate('[data-spring-reset]');assert.ok(evaluate('document.querySelector("[data-spring-live]").textContent.startsWith("t=0.000 s; x=0.0000")'));
  assert.equal(evaluate('document.querySelector("[data-spring-plot] line:last-child").getAttribute("x1")'),'10');
  browser('wait','300');assert.ok(evaluate('document.querySelector("[data-spring-status]").textContent.startsWith("Cursor reset")'));
});

test('replaying supersedes the old capture and a changed motion preference stops movement',()=>{
  browser('set','media','light');open();
  // Hold elapsed model time while keeping native frame delivery and unrelated page callbacks intact.
  evaluate('const realNow=performance.now.bind(performance);Object.defineProperty(performance,"now",{configurable:true,value:()=>realNow()+1000000});');
  fill('duration','8');activate('[data-spring-run]');fill('initialVelocity','1');activate('[data-spring-run]');
  assert.equal(captured('initialVelocity'),'1');
  assert.ok(evaluate('document.querySelector("[data-spring-live]").textContent.includes("velocity=1.0000")'));
  browser('set','media','light','reduced-motion');browser('wait','100');
  assert.equal(evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'),true);
  assert.ok(evaluate('document.querySelector("[data-spring-status]").textContent.startsWith("Reduced motion is now enabled")'));
  assert.equal(evaluate('document.querySelector("[data-spring-plot] line:last-child").getAttribute("x1")'),'990');
  const endpoint=evaluate('document.querySelector("[data-spring-live]").textContent');browser('wait','300');assert.equal(evaluate('document.querySelector("[data-spring-live]").textContent'),endpoint);
  activate('[data-spring-run]');assert.ok(evaluate('document.querySelector("[data-spring-status]").textContent.startsWith("Reduced motion: captured")'));
  browser('set','media','light');
});

test('narrow theme views preserve controls, complete data and root bounds',()=>{
  browser('set','viewport','320','812');open();browser('set','media','light','reduced-motion');
  for(const theme of ['light','dark']){
    browser('eval',`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'));`);browser('wait',`html.${theme}`);
    fill('damping','0');fill('stiffness','1000');fill('mass','.1');fill('initialVelocity','-5');fill('duration','8');activate('[data-spring-run]');
    assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
    if(!evaluate('document.querySelector("[data-spring-full]").open'))activate('[data-spring-full] summary');
    const result=JSON.parse(evaluate('document.querySelector("[data-spring-full] code").textContent'));assert.equal(result.samples.length,481);assert.ok(result.samples.every(point=>Object.values(point).every(Number.isFinite)));
    assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
  }
  browser('eval','document.documentElement.style.fontSize="200%"');
  assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
  assert.ok(evaluate('[...document.querySelectorAll("[data-spring-run],[data-spring-stop],[data-spring-reset]")].every(x=>x.getBoundingClientRect().height>=44&&x.getBoundingClientRect().right<=innerWidth)'));
  browser('set','media','light');
});
