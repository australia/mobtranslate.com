import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const session = `styleguide-inputs-${process.pid}`;
const base = process.env.STYLEGUIDE_URL ?? 'http://127.0.0.1:3003';
function browser(...args) {
  if (args[0] === 'wait' && args[1] === '--fn') new Function(`return (${args[2]});`);
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 150000, killSignal: 'SIGKILL' }));
  assert.equal(result.success, true, result.error);
  return result.data;
}
const evaluate = script => { new Function(script); return browser('eval', script).result; };
function open(path, lab) {
  browser('open', `${base}${path}`);
  browser('wait', lab);
  browser('wait', '--fn', 'document.documentElement.matches(".light,.dark")');
}
function click(label) {
  evaluate(`(() => { const button = [...document.querySelectorAll('main button')].find(item => item.textContent.trim() === ${JSON.stringify(label)} || item.getAttribute('aria-label') === ${JSON.stringify(label)}); button.scrollIntoView({block:'center'}); return true; })()`);
  browser('find', 'role', 'button', 'click', '--name', label, '--exact');
}
after(() => browser('close'));

test('native input exposes linked correction, real sizes and read-only versus disabled payloads', () => {
  open('/components/input','[data-native-input-lab]');
  click('Submit native input');
  assert.equal(evaluate('document.activeElement.id'),'native-display-label');
  assert.equal(evaluate('document.activeElement.getAttribute("aria-invalid")'),'true');
  assert.ok(evaluate('document.activeElement.getAttribute("aria-describedby").includes("native-input-error")'));
  browser('fill','#native-display-label','Local sample'); click('Submit native input');
  assert.match(evaluate('document.querySelector("[data-native-input-lab] [role=status]").textContent'),/Local FormData: Local sample/);
  const heights=[];
  for(const size of ['sm','md','lg']) { browser('select','[data-input-size]',size); heights.push(evaluate('document.querySelector("#native-display-label").getBoundingClientRect().height')); }
  assert.deepEqual(heights,[36,44,48]);
  browser('select','[data-input-variant]','filled');
  assert.ok(evaluate('document.querySelector("#native-display-label").classList.contains("mt-input-filled")'));
  click('Make local input read-only'); browser('focus','#native-display-label'); browser('press','Backspace');
  assert.equal(evaluate('document.querySelector("#native-display-label").value'),'Local sample'); click('Submit native input');
  assert.match(evaluate('document.querySelector("[data-native-input-lab] [role=status]").textContent'),/Local sample/);
  click('Disable local input'); click('Submit native input');
  assert.match(evaluate('document.querySelector("[data-native-input-lab] [role=status]").textContent'),/omitted \(disabled\)/);
});

test('textarea retains line breaks, linked errors, resize choices and immutable text', () => {
  open('/components/textarea','[data-textarea-lab]'); click('Submit native note');
  assert.equal(evaluate('document.activeElement.id'),'native-note');
  assert.equal(evaluate('document.activeElement.getAttribute("aria-invalid")'),'true');
  browser('fill','#native-note','First line\nSecond line'); browser('focus','#native-note'); browser('press','End'); browser('press','Enter');
  assert.match(evaluate('document.querySelector("#native-note").value'),/First line\nSecond line\n/);
  assert.match(evaluate('document.querySelector("[data-textarea-lab] [role=status]").textContent'),/No local note/);
  click('Submit native note');
  assert.match(evaluate('document.querySelector("[data-textarea-lab] [role=status]").textContent'),/First line\nSecond line/);
  for(const resize of ['none','horizontal','both','vertical']) { browser('select','[data-textarea-resize]',resize); assert.equal(evaluate('getComputedStyle(document.querySelector("#native-note")).resize'),resize); }
  const before=evaluate('document.querySelector("#native-note").value');
  click('Make local note read-only'); browser('focus','#native-note'); browser('press','Backspace');
  assert.equal(evaluate('document.querySelector("#native-note").value'),before);
});

test('registered Field connects label and description and enforces custom validation before submission', () => {
  open('/components/field','[data-field-lab]');
  const relationships=evaluate(`(() => {const node=document.querySelector('[data-registered-title]');return {id:node.id,label:document.querySelector('[data-field-lab] label').htmlFor,description:node.getAttribute('aria-describedby').split(' ').every(id=>Boolean(document.getElementById(id)))};})()`);
  assert.equal(relationships.id,relationships.label); assert.equal(relationships.description,true);
  click('Submit registered field');
  assert.ok(evaluate('document.activeElement.matches("[data-registered-title]")'));
  assert.ok(evaluate('document.querySelector(".local-field-invalid") !== null'));
  browser('fill','[data-registered-title]','ab'); click('Submit registered field');
  assert.match(evaluate('document.querySelector("[data-field-lab] [role=status]").textContent'),/No registered/);
  browser('fill','[data-registered-title]','Valid local title'); click('Submit registered field');
  assert.match(evaluate('document.querySelector("[data-field-lab] [role=status]").textContent'),/Registered local value: Valid local title/);
  assert.match(evaluate('document.querySelector("[data-field-validity]").textContent'),/Validation: true/);
  click('Disable registered field'); assert.equal(evaluate('document.querySelector("[data-registered-title]").disabled'),true);
});

test('native fieldset disabling preserves values while excluding descendant successful controls', () => {
  open('/components/fieldset','[data-fieldset-lab]'); click('Inspect grouped payload');
  assert.match(evaluate('document.querySelector("[data-fieldset-lab] [role=status]").textContent'),/Reading sample/);
  click('Disable grouped details');
  assert.ok(evaluate('document.querySelector("fieldset").classList.contains("local-fieldset-disabled")'));
  assert.ok(evaluate('[...document.querySelectorAll("[data-fieldset-lab] fieldset input")].every(node => node.matches(":disabled"))'));
  click('Inspect grouped payload');
  assert.match(evaluate('document.querySelector("[data-fieldset-lab] [role=status]").textContent'),/Native payload: \{\}/);
  click('Enable grouped details'); click('Inspect grouped payload');
  assert.match(evaluate('document.querySelector("[data-fieldset-lab] [role=status]").textContent'),/Reading sample/);
});

test('registered Form gates invalid values and recovers failure, cancellation, success and retained draft', () => {
  open('/components/form','[data-form-lab]'); click('Submit local record');
  assert.ok(evaluate('document.activeElement.matches("[data-form-title]")'));
  browser('fill','[data-form-title]','Local record'); browser('fill','[data-form-email]','incorrect'); click('Submit local record');
  assert.ok(evaluate('document.activeElement.matches("[data-form-email]")'));
  browser('fill','[data-form-email]','local@example.com'); click('Submit local record');
  assert.equal(evaluate('document.querySelector("[data-form-lab] form").getAttribute("aria-busy")'),'true');
  assert.ok(evaluate('[...document.querySelectorAll("[data-form-lab] input")].every(node=>node.readOnly)'));
  assert.ok(evaluate('[...document.querySelectorAll("[data-form-lab] button")].find(node=>node.textContent==="Submit local record").disabled'));
  click('Fail local form');
  assert.ok(evaluate('document.activeElement.matches("[data-form-title]")'));
  assert.equal(evaluate('document.querySelector("[data-form-email]").value'),'local@example.com');
  assert.match(evaluate('document.querySelector("[data-form-lab]").textContent'),/Simulated rejection/);
  browser('fill','[data-form-title]','Revised local record'); click('Submit local record'); click('Cancel local form');
  assert.match(evaluate('document.querySelector("[data-form-lab] [role=status]").textContent'),/cancelled/);
  click('Submit local record'); click('Complete local form');
  assert.match(evaluate('document.querySelector("[data-form-lab] [role=status]").textContent'),/Retained local record: Revised local record, local@example.com/);
  browser('fill','[data-form-title]','Unsaved draft'); click('Restore retained draft');
  assert.equal(evaluate('document.querySelector("[data-form-title]").value'),'Revised local record');
  assert.ok(evaluate('document.activeElement.matches("[data-form-title]")'));
});

test('number field uses actual raw numeric payload, locale formatting, bounds and empty state', () => {
  open('/components/number-field','[data-number-lab]');
  assert.equal(evaluate('document.querySelector("[data-number-input]").value'),'2.5');
  const name=evaluate('document.querySelector("[data-number-input]").getAttribute("aria-labelledby")');
  assert.match(evaluate(`document.getElementById(${JSON.stringify(name)}).textContent`),/Local sample amount/);
  assert.ok(evaluate('[...document.querySelectorAll(".mt-number-field-increment,.mt-number-field-decrement")].every(node=>node.type==="button" && node.getBoundingClientRect().width>=44)'));
  click('Increase local sample amount');
  assert.match(evaluate('document.querySelector("[data-number-value]").textContent'),/Raw value: 3\./);
  browser('select','[data-number-locale]','de-DE'); browser('fill','[data-number-input]','3,5');
  click('Inspect numeric payload');
  assert.match(evaluate('document.querySelector("[data-number-lab] [role=status]").textContent'),/Native numeric payload: 3.5/);
  assert.equal(evaluate('document.querySelector("[data-number-input]").value'),'3,5');
  browser('fill','[data-number-input]','99'); click('Inspect numeric payload');
  assert.match(evaluate('document.querySelector("[data-number-value]").textContent'),/Raw value: 10\./);
  browser('focus','[data-number-input]'); browser('press','Control+A'); browser('press','Backspace');
  assert.ok(evaluate('document.querySelector(".local-number-empty") !== null'));
  click('Inspect numeric payload'); assert.match(evaluate('document.querySelector("[data-number-lab] [role=status]").textContent'),/Native numeric payload: \./);
});

test('number read-only and disabled states actually reject keyboard and button changes', () => {
  open('/components/number-field','[data-number-lab]'); click('Make number read-only');
  browser('focus','[data-number-input]'); browser('press','ArrowUp'); click('Increase local sample amount');
  assert.match(evaluate('document.querySelector("[data-number-value]").textContent'),/Raw value: 2.5/);
  click('Disable local number');
  assert.ok(evaluate('document.querySelector("[data-number-input]").disabled'));
  assert.ok(evaluate('[...document.querySelectorAll(".mt-number-field-increment,.mt-number-field-decrement")].every(node=>node.disabled)'));
});

test('all input guides and the complete form pattern reflow in both themes at 320px', () => {
  browser('set','viewport','320','812'); open('/components/input','[data-native-input-lab]');
  for(const theme of ['light','dark']) {
    evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));`);
    for(const path of ['input','textarea','field','fieldset','form','number-field']) {
      open(`/components/${path}`,'main h1'); browser('wait',`html.${theme}`);
      assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false,`${theme} ${path}`);
    }
    open('/patterns/forms','[data-form-lab]');
    assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  }
});

test('input boundaries, editable text and registered correction messages have readable contrast', () => {
  browser('set','viewport','1440','1000'); open('/components/input','[data-native-input-lab]');
  function inspect(selector, text = true) {
    const pairs=evaluate(`(() => {
      const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
      const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
      const over=(front,back)=>front.slice(0,3).map((v,i)=>v*front[3]/255+back[i]*(1-front[3]/255));
      const lum=color=>color.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
      const node=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(node),layers=[];
      for(let p=node;p;p=p.parentElement) layers.push(rgb(getComputedStyle(p).backgroundColor));
      const bg=layers.reverse().reduce((back,front)=>over(front,back),[255,255,255]);
      return {text:ratio(over(rgb(s.color),bg),bg),boundary:ratio(rgb(s.borderColor),rgb(getComputedStyle(document.body).backgroundColor))};
    })()`);
    if(text) assert.ok(pairs.text>=4.5,`${selector} text: ${pairs.text}`);
    else assert.ok(pairs.boundary>=3,`${selector} boundary: ${pairs.boundary}`);
  }
  for(const theme of ['light','dark']) {
    evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));`);
    open('/components/input','[data-native-input-lab]'); browser('wait',`html.${theme}`);
    for(const variant of ['outline','filled']) { browser('select','[data-input-variant]',variant); inspect('#native-display-label'); inspect('#native-display-label',false); }
    click('Submit native input'); browser('focus','[data-input-size]'); inspect('#native-display-label',false);
    open('/components/textarea','[data-textarea-lab]'); inspect('#native-note'); inspect('#native-note',false);
    open('/components/number-field','[data-number-lab]'); inspect('[data-number-input]'); inspect('.mt-number-field-group',false);
    open('/components/field','[data-field-lab]'); click('Submit registered field'); inspect('.mt-field-error');
  }
});
