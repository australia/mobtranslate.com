import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const session = `styleguide-selection-${process.pid}`;
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
  evaluate(`(() => { const button = [...document.querySelectorAll('main button')].find(item => item.textContent.trim() === ${JSON.stringify(label)}); button.scrollIntoView({block:'center'}); return true; })()`);
  browser('find', 'role', 'button', 'click', '--name', label, '--exact');
}
after(() => browser('close'));

test('checkbox has a meaningful name, correct element ref contract and a real local form value', () => {
  open('/components/checkbox','[data-checkbox-lab]');
  assert.equal(evaluate('document.querySelector("[data-checkbox-lab] [role=checkbox]").tagName'),'SPAN');
  assert.equal(evaluate('document.querySelector("[data-checkbox-lab] [role=checkbox]").getAttribute("aria-label")'),'Include explanatory notes');
  assert.ok(evaluate('document.querySelector(".mt-checkbox-label").getBoundingClientRect().height >= 44'));
  click('Submit local checkbox sample');
  assert.ok(evaluate('document.activeElement.matches("[role=checkbox]")'));
  assert.match(evaluate('document.querySelector("[data-checkbox-lab] [role=alert]").textContent'),/Include explanatory notes/);
  browser('press','Space'); click('Submit local checkbox sample');
  assert.match(evaluate('document.querySelector("[data-checkbox-lab] > [role=status]").textContent'),/notes=include/);
  assert.ok(evaluate('document.querySelector(".local-checkbox-checked") !== null'));
  browser('focus','[aria-label="Read-only checked sample"]'); browser('press','Space');
  assert.equal(evaluate(`document.querySelector('[aria-label="Read-only checked sample"]').getAttribute('aria-checked')`),'true');
});

test('checkbox parent renders a mixed dash and controls the actual member set and payload', () => {
  open('/components/checkbox-group','[data-checkbox-group-lab]');
  const parent='[aria-label="Select all local formats"]';
  assert.equal(evaluate(`document.querySelector('${parent}').getAttribute('aria-checked')`),'mixed');
  assert.equal(evaluate(`getComputedStyle(document.querySelector('${parent} .mt-checkbox-mixed')).display`),'block');
  assert.equal(evaluate(`getComputedStyle(document.querySelector('${parent} .mt-checkbox-check')).display`),'none');
  browser('focus',parent); browser('press','Space');
  assert.equal(evaluate('document.querySelectorAll("[data-checkbox-group-lab] [role=checkbox][aria-checked=true]").length'),4);
  click('Submit grouped sample');
  assert.match(evaluate('document.querySelector("[data-checkbox-group-lab] > [role=status]").textContent'),/resources: text, audio, images/);
  browser('focus',parent); browser('press','Space');
  assert.equal(evaluate(`document.querySelector('${parent}').getAttribute('aria-checked')`),'false');
  click('Disable local checkbox group');
  assert.ok(evaluate('document.querySelector(".local-group-disabled") !== null'));
  assert.ok(evaluate('[...document.querySelectorAll("[data-checkbox-group-lab] [role=checkbox]")].every(node => node.getAttribute("aria-disabled") === "true")'));
});

test('radio keyboard skips unavailable options, changes real spacing and serializes its value', () => {
  open('/components/radio','[data-radio-lab]');
  browser('focus','[aria-label="Compact reading"]'); browser('press','ArrowDown');
  assert.equal(evaluate('document.activeElement.getAttribute("aria-label")'),'Comfortable reading');
  assert.equal(evaluate('document.activeElement.getAttribute("aria-checked")'),'true');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-density-sample]")).lineHeight'),'28px');
  click('Submit radio sample');
  assert.match(evaluate('document.querySelector("[data-radio-lab] > [role=status]").textContent'),/density=comfortable/);
  click('Make local radio group read-only'); browser('focus','[aria-label="Comfortable reading"]'); browser('press','Space');
  assert.equal(evaluate(`document.querySelector('[aria-label="Comfortable reading"]').getAttribute('aria-checked')`),'true');
});

test('switch retains the old setting while pending, recovers failure and commits an explicit local outcome', () => {
  open('/components/switch','[data-switch-lab]');
  const root='[aria-label="Local example reminders"]';
  browser('focus',root); browser('press','Space');
  assert.equal(evaluate(`document.querySelector('${root}').getAttribute('aria-checked')`),'false');
  assert.match(evaluate('document.querySelector("#local-switch-state").textContent'),/pending/);
  browser('press','Space'); click('Fail local switch change');
  assert.equal(evaluate(`document.querySelector('${root}').getAttribute('aria-checked')`),'false');
  assert.equal(evaluate('document.activeElement.getAttribute("aria-label")'),'Local example reminders');
  browser('press','Space'); click('Apply local switch change');
  assert.equal(evaluate(`document.querySelector('${root}').getAttribute('aria-checked')`),'true');
  assert.match(evaluate('document.querySelector("#local-switch-state").textContent'),/No reminder was scheduled/);
  assert.equal(evaluate('document.activeElement.getAttribute("aria-label")'),'Local example reminders');
});

test('chip filter changes the actual list and removal restores focus to independent recovery', () => {
  open('/components/chip','[data-chip-lab]');
  assert.equal(evaluate(`document.querySelectorAll('[aria-label="Local filtered examples"] li').length`),2);
  click('Bookmarked examples');
  assert.equal(evaluate(`document.querySelectorAll('[aria-label="Local filtered examples"] li').length`),1);
  assert.equal(evaluate('[...document.querySelectorAll("[data-chip-lab] button")].find(node => node.textContent === "Bookmarked examples").getAttribute("aria-pressed")'),'true');
  browser('scrollintoview','[aria-label="Remove English-only local suggestion"]'); browser('click','[aria-label="Remove English-only local suggestion"]');
  assert.equal(evaluate('document.activeElement.textContent'),'Restore local chip');
  assert.equal(evaluate(`document.querySelector('[aria-label="Remove English-only local suggestion"]') === null`),true);
  click('Restore local chip');
  assert.ok(evaluate(`document.querySelector('[aria-label="Remove English-only local suggestion"]') !== null`));
});

test('single and range sliders expose real named inputs, keyboard steps and non-crossing endpoints', () => {
  open('/components/slider','[data-slider-lab]');
  assert.equal(evaluate('document.querySelectorAll("[data-range-slider] input[type=range]").length'),2);
  assert.equal(evaluate('document.querySelector("[data-single-slider] input").getAttribute("aria-label")'),'Local sample level');
  assert.ok(evaluate('[...document.querySelectorAll(".mt-slider-thumb")].every(node => node.getBoundingClientRect().width === 44)'));
  browser('focus','[data-single-slider] input'); browser('press','ArrowRight');
  assert.equal(evaluate('document.querySelector("[data-single-slider] input").value'),'5');
  browser('press','Home'); assert.equal(evaluate('document.querySelector("[data-single-slider] input").value'),'0');
  browser('press','End'); assert.equal(evaluate('document.querySelector("[data-single-slider] input").value'),'10');
  browser('focus','[aria-label="Minimum local sample level"]'); browser('press','End');
  const values=evaluate('[...document.querySelectorAll("[data-range-slider] input")].map(node => Number(node.value))');
  assert.ok(values[0] <= values[1]-1);
  browser('focus','[aria-label="Maximum local sample level"]'); browser('press','Home');
  const final=evaluate('[...document.querySelectorAll("[data-range-slider] input")].map(node => Number(node.value))');
  assert.ok(final[0] <= final[1]-1);
});

test('slider vertical geometry and RTL keyboard direction follow the selected context', () => {
  open('/components/slider','[data-slider-lab]');
  browser('scrollintoview','[data-slider-lab] input[type=checkbox]');
  browser('focus','[data-slider-lab] input[type=checkbox]'); browser('press','Space');
  assert.equal(evaluate('document.querySelector("[data-single-slider] input[type=range]").getAttribute("aria-orientation")'),'vertical');
  assert.equal(evaluate('document.querySelector("[data-single-slider] .mt-slider-control").getBoundingClientRect().height'),192);
  browser('focus','[data-single-slider] input[type=range]'); browser('press','ArrowUp');
  assert.equal(evaluate('document.querySelector("[data-single-slider] input[type=range]").value'),'5');
  // Return to horizontal, then choose RTL through the actual setting checkbox.
  browser('focus','[data-slider-lab] input[type=checkbox]'); browser('press','Space');
  browser('focus','[data-slider-lab] label:nth-child(2) input'); browser('press','Space');
  browser('focus','[data-single-slider] input[type=range]'); browser('press','ArrowRight');
  assert.equal(evaluate('document.querySelector("[data-single-slider] input[type=range]").value'),'4');
});

test('toggle and segments expose actual pressed effects and the empty/single/multiple policies', () => {
  open('/components/toggle','[data-toggle-lab]'); click('Emphasize local example');
  assert.ok(evaluate('document.querySelector(".local-toggle-on") !== null'));
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-toggle-lab] > p")).fontWeight'),'700');
  open('/components/toggle-group','[data-toggle-group-lab]'); click('Notes section');
  assert.equal(evaluate('document.querySelectorAll("[data-toggle-group-lab] [aria-pressed=true].mt-toggle-group-item").length'),1);
  assert.match(evaluate('document.querySelector("[data-local-sections]").textContent'),/notes section/);
  click('Notes section'); assert.match(evaluate('document.querySelector("[data-local-sections]").textContent'),/No local sections/);
  click('Allow multiple local segments'); click('Title section'); click('Notes section');
  assert.equal(evaluate('document.querySelectorAll(".mt-toggle-group-item[aria-pressed=true]").length'),2);
  click('Use vertical local segments');
  assert.equal(evaluate('getComputedStyle(document.querySelector(".mt-toggle-group")).flexDirection'),'column');
  browser('focus','.mt-toggle-group-item'); browser('press','ArrowDown');
  assert.equal(evaluate('document.activeElement.textContent'),'Notes section');
});

test('selection guides reflow at 320px and every chip variant has readable text in both themes', () => {
  browser('set','viewport','320','812');
  open('/components/chip','[data-chip-lab]');
  for(const theme of ['light','dark']) {
    evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)}); window.dispatchEvent(new Event('storage'));`);
    for(const name of ['checkbox','checkbox-group','radio','switch','chip','slider','toggle','toggle-group']) {
      open(`/components/${name}`,'main h1'); browser('wait',`html.${theme}`);
      assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'),false,`${theme} ${name}`);
    }
    open('/components/chip','[data-chip-lab]');
    for(const variant of ['filled','outlined','soft']) {
      browser('select','[data-chip-variant]',variant);
      const ratios=evaluate(`(() => {
        const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
        const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
        const lum=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
        const over=(front,back)=>{const alpha=front[3]/255;return front.slice(0,3).map((v,i)=>v*alpha+back[i]*(1-alpha));};
        return [...document.querySelectorAll('[data-chip-lab] [data-tone]')].map(node=>{
          const layers=[];for(let p=node;p;p=p.parentElement) layers.push(rgba(getComputedStyle(p).backgroundColor));
          const bg=layers.reverse().reduce((back,front)=>over(front,back),[255,255,255]);
          const a=lum(over(rgba(getComputedStyle(node).color),bg)),b=lum(bg);
          return {tone:node.dataset.tone,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
        });
      })()`);
      for(const pair of ratios) assert.ok(pair.ratio>=4.5,`${theme} ${variant} ${pair.tone}: ${pair.ratio}`);
    }
    open('/patterns/selection','[data-chip-lab]'); assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'),false);
  }
});

test('disabled selection controls reject input and chip sizes change their actual geometry', () => {
  open('/components/checkbox-group','[data-checkbox-group-lab]');
  click('Disable local checkbox group');
  const before=evaluate('[...document.querySelectorAll("[data-checkbox-group-lab] [role=checkbox]")].map(node => node.getAttribute("aria-checked"))');
  browser('click','[aria-label="Select all local formats"]'); browser('press','Space');
  assert.deepEqual(evaluate('[...document.querySelectorAll("[data-checkbox-group-lab] [role=checkbox]")].map(node => node.getAttribute("aria-checked"))'),before);
  open('/components/slider','[data-slider-lab]');
  browser('focus','[data-slider-lab] label:nth-child(3) input'); browser('press','Space');
  assert.ok(evaluate('[...document.querySelectorAll("[data-slider-lab] input[type=range], [data-exact-level]")].every(node => node.disabled)'));
  const sliderValues=evaluate('[...document.querySelectorAll("[data-slider-lab] input[type=range]")].map(node => node.value)');
  browser('click','[data-single-slider] .mt-slider-thumb'); browser('press','ArrowRight');
  assert.deepEqual(evaluate('[...document.querySelectorAll("[data-slider-lab] input[type=range]")].map(node => node.value)'),sliderValues);
  open('/components/chip','[data-chip-lab]');
  const status=evaluate('document.querySelector("[data-chip-lab] [role=status]").textContent');
  assert.ok(evaluate('[...document.querySelectorAll("[data-chip-lab] button")].find(node => node.textContent === "Unavailable local action").disabled'));
  click('Unavailable local action');
  assert.equal(evaluate('document.querySelector("[data-chip-lab] [role=status]").textContent'),status);
  const heights=[];
  for(const size of ['sm','md','lg']) {
    browser('select','[data-chip-size]',size);
    heights.push(evaluate('document.querySelector("[data-tone=default]").getBoundingClientRect().height'));
    assert.ok(evaluate('[...document.querySelectorAll("[data-chip-lab] .mt-chip-action, [data-chip-lab] .mt-chip-toggle, [data-chip-lab] .mt-chip-delete")].every(node => node.getBoundingClientRect().height >= 44)'));
  }
  assert.ok(heights[0]<heights[1] && heights[1]<heights[2],JSON.stringify(heights));
});

test('selected indicators and mutable control boundaries have meaningful graphic contrast', () => {
  function pairs(script) {
    const result=evaluate(`(() => {
      const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
      const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
      const lum=color=>rgb(color).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
      const page=getComputedStyle(document.body).backgroundColor;
      ${script}
    })()`);
    for(const pair of result) assert.ok(pair.ratio>=3,`${pair.label}: ${pair.ratio}`);
  }
  browser('set','viewport','1440','1000');
  open('/components/checkbox','[data-checkbox-lab]');
  for(const theme of ['light','dark']) {
    evaluate(`localStorage.setItem('mt-theme',${JSON.stringify(theme)});window.dispatchEvent(new Event('storage'));`);
    open('/components/checkbox','[data-checkbox-lab]'); browser('wait',`html.${theme}`);
    browser('focus','[aria-label="Include explanatory notes"]'); browser('press','Space');
    pairs(`const node=document.querySelector('[data-checkbox-lab] [role=checkbox]'), s=getComputedStyle(node), mark=getComputedStyle(node.querySelector('.mt-checkbox-indicator'));return [{label:'${theme} checkbox boundary',ratio:ratio(s.borderColor,page)},{label:'${theme} check mark',ratio:ratio(mark.color,s.backgroundColor)}];`);
    open('/components/radio','[data-radio-lab]');
    pairs(`const node=document.querySelector('[role=radio][aria-checked=true]'),s=getComputedStyle(node),dot=getComputedStyle(node.querySelector('.mt-radio-indicator'));return [{label:'${theme} radio dot',ratio:ratio(dot.backgroundColor,s.backgroundColor)},{label:'${theme} radio boundary',ratio:ratio(s.borderColor,page)}];`);
    open('/components/switch','[data-switch-lab]');
    const switchPairs=`const node=document.querySelector('[aria-label="Local example reminders"]'),s=getComputedStyle(node),thumb=getComputedStyle(node.querySelector('.mt-switch-thumb'));return [{label:'${theme} switch boundary',ratio:ratio(s.borderColor,page)},{label:'${theme} switch thumb',ratio:ratio(thumb.backgroundColor,s.backgroundColor)}];`;
    pairs(switchPairs); browser('focus','[aria-label="Local example reminders"]'); browser('press','Space'); click('Apply local switch change'); pairs(switchPairs);
    open('/components/slider','[data-slider-lab]');
    pairs(`const track=getComputedStyle(document.querySelector('.mt-slider-track')),thumb=getComputedStyle(document.querySelector('.mt-slider-thumb'),'::after');return [{label:'${theme} slider track boundary',ratio:ratio(track.borderColor,page)},{label:'${theme} slider thumb',ratio:ratio(thumb.backgroundColor,track.backgroundColor)}];`);
  }
});
