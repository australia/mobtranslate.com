import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const session=`mobtranslate-icons-${process.pid}`,base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
function browser(...args){const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}}));assert.equal(r.success,true,r.error);return r.data;}
const evaluate=code=>browser('eval',code).result;
function open(width=1440){browser('set','viewport',String(width),'1000');browser('open',`${base}/foundations/iconography`);browser('wait','[data-icon-lab]');}
after(()=>browser('close'));

test('original geometry, keylines and painted stroke settings are inspectable',()=>{
  open();for(const [kind,width,height] of [['square','18','18'],['vertical','16','20'],['horizontal','20','16']]){
    browser('select','[data-icon-keyline]',kind);assert.equal(evaluate('document.querySelector("[data-icon-keyline-shape] rect").getAttribute("width")'),width);assert.equal(evaluate('document.querySelector("[data-icon-keyline-shape] rect").getAttribute("height")'),height);
  }
  browser('select','[data-icon-keyline]','circle');assert.equal(evaluate('document.querySelector("[data-icon-keyline-shape] circle").getAttribute("r")'),'10');
  browser('select','[data-icon-stroke]','3');browser('select','[data-icon-cap]','butt');browser('select','[data-icon-size]','48');
  assert.equal(evaluate('document.querySelector("[data-icon-grid-mark]").getAttribute("stroke-width")'),'3');assert.equal(evaluate('document.querySelector("[data-icon-save] svg").getAttribute("stroke-linecap")'),'butt');
  assert.equal(evaluate('document.querySelector("[data-icon-save] svg").getBoundingClientRect().width'),48);
  assert.ok(evaluate('document.querySelector("[data-icon-lab]").textContent.includes("6.00 CSS pixels before rasterization")'));
});

test('native action state and target remain separate from glyph presentation and direction',()=>{
  open();browser('focus','[data-icon-save]');browser('press','Enter');assert.equal(evaluate('document.querySelector("[data-icon-save]").getAttribute("aria-pressed")'),'true');
  browser('focus','[data-icon-rtl]');browser('press','Space');assert.equal(evaluate('document.querySelector("[data-icon-preview]").dir'),'rtl');
  assert.ok(evaluate('document.querySelector("[data-icon-arrow]").hasAttribute("transform")'));assert.equal(evaluate('document.querySelector("[data-icon-save] path").hasAttribute("transform")'),false);
  browser('select','[data-icon-size]','16');assert.ok(evaluate('document.querySelector("[data-icon-save]").getBoundingClientRect().width>=44&&document.querySelector("[data-icon-save]").getBoundingClientRect().height>=44'));
  browser('focus','[data-icon-save]');browser('press','Space');assert.equal(evaluate('document.querySelector("[data-icon-save]").getAttribute("aria-pressed")'),'false');
  assert.equal(evaluate('document.querySelector("[data-icon-save]").getAttribute("aria-label")'),'Save entry');
});

test('large glyphs, keyline figures and enlarged labels reflow in both themes',()=>{
  open(320);browser('select','[data-icon-size]','48');
  for(const theme of ['light','dark']){evaluate(`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'));`);browser('wait',`html.${theme}`);assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));}
  evaluate('document.documentElement.style.fontSize="200%"');assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'));
  assert.ok(evaluate('document.querySelector("[data-icon-grid]").getBoundingClientRect().right<=innerWidth'));
  assert.ok(evaluate('document.querySelector("[data-icon-save]").getBoundingClientRect().right<=innerWidth'));
  assert.ok(evaluate('document.querySelector("[data-icon-geometry]").textContent.includes("24 × 24")'));
});
