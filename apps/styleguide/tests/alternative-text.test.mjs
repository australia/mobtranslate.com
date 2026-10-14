import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003';
const session=`mobtranslate-alternatives-${process.pid}`;
const browser=(...args)=>{
  let output;try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}catch(error){if(!error.stdout)throw error;output=error.stdout;}
  const response=JSON.parse(output);assert.equal(response.success,true,response.error);return response.data;
};
const evaluate=code=>browser('eval',code).result;
const open=()=>{browser('open',`${base}/foundations/alternative-text`);browser('wait','[data-alternative-ready=true]');};
const purpose=value=>{browser('select','#alternative-purpose',value);browser('scrollintoview','[data-alternative-preview]');};
const click=(name,role='button')=>{
  const {refs}=browser('snapshot','-i');
  const matches=Object.entries(refs).filter(([_key,value])=>value.role===role&&value.name===name);
  assert.equal(matches.length,1,`One ${role} with the native accessibility name ${name}`);
  browser('click',`@${matches[0][0]}`);
};
const inspection=()=>JSON.parse(evaluate('document.querySelector("[data-alternative-ready] pre").textContent'));
before(()=>browser('set','viewport','1440','1000'));
after(()=>browser('close'));

test('the delivered illustration loads and its bars agree with the shared values',()=>{
  open();browser('wait','--fn','document.querySelector("[data-alternative-image]").complete && document.querySelector("[data-alternative-image]").naturalWidth===330');
  const fixture=evaluate('(async()=>{const data=await (await fetch("/fixtures/alternative-counts.json")).json();const xml=await (await fetch("/fixtures/alternative-counts.svg")).text();const doc=new DOMParser().parseFromString(xml,"image/svg+xml");return {rows:data.rows,bars:[...doc.querySelectorAll("rect")].map(rect=>({label:rect.getAttribute("data-group"),value:Number(rect.getAttribute("data-value")),height:Number(rect.getAttribute("height"))}))};})()');
  assert.deepEqual(fixture.rows,[{label:'A',value:3},{label:'B',value:5},{label:'C',value:2}]);
  assert.deepEqual(fixture.bars.map(({label,value})=>({label,value})),fixture.rows);
  assert.equal(fixture.bars[0].height/fixture.bars[1].height,3/5);
  assert.equal(fixture.bars[2].height/fixture.bars[1].height,2/5);
});

test('decorative empty alt differs from omission and purpose changes retain authored drafts',()=>{
  open();browser('fill','#alternative-text','A comparison of three illustrative groups.');
  browser('wait','--fn','document.querySelector("[data-alternative-image]").alt==="A comparison of three illustrative groups."');
  assert.equal(inspection().alt,'A comparison of three illustrative groups.');
  purpose('decorative');
  assert.equal(evaluate('document.querySelector("[data-alternative-image]").hasAttribute("alt")'),true);
  assert.equal(evaluate('document.querySelector("[data-alternative-image]").getAttribute("alt")'),'');
  assert.ok(evaluate('document.querySelector("[data-alternative-preview]").textContent.includes("A: 3; B: 5; C: 2")'));
  purpose('informative');assert.equal(evaluate('document.querySelector("#alternative-text").value'),'A comparison of three illustrative groups.');
});

test('the image alternative names a real native action with keyboard outcome and focus return',()=>{
  open();purpose('functional');
  click('Open example values');browser('wait','[data-alternative-values]');
  browser('wait','--fn','document.activeElement.tagName==="H3"');
  assert.equal(evaluate('document.activeElement.tagName'),'H3');
  assert.equal(inspection().insideButton,true);assert.equal(inspection().buttonType,'button');
  click('Close example values');browser('wait','--fn','document.activeElement.hasAttribute("data-alternative-action")');
  browser('press','Enter');browser('wait','[data-alternative-values]');
  assert.equal(evaluate('document.querySelectorAll("[data-alternative-values] tbody tr").length'),3);
});

test('empty meaningful alternatives remove unnamed previews and close uses a surviving focus target',()=>{
  open();purpose('functional');click('Open example values');browser('wait','[data-alternative-values]');
  browser('focus','#alternative-text');browser('press','Control+A');browser('press','Backspace');
  browser('wait','--fn','!document.querySelector("[data-alternative-image]")');
  assert.equal(evaluate('document.querySelector("#alternative-text").getAttribute("aria-invalid")'),'true');
  click('Close example values');browser('wait','--fn','document.activeElement.id==="alternative-text"');
  browser('fill','#alternative-text','Read illustrative values');
  click('Read illustrative values');browser('wait','[data-alternative-values]');
});

test('complex content links a real description and independently structured values',()=>{
  open();purpose('complex');browser('wait','[data-alternative-values]');
  assert.ok(evaluate('(()=>{const image=document.querySelector("[data-alternative-image]"),summary=document.getElementById(image.getAttribute("aria-describedby"));return summary.textContent.includes("A: 3; B: 5; C: 2");})()'));
  click('Read the full example values','link');
  browser('wait','--fn','document.activeElement.tagName==="H3" && document.activeElement.textContent==="Full example values"');
  assert.equal(evaluate('document.querySelector("[data-alternative-values] caption").textContent'),'Illustrative English fixture counts');
  assert.equal(evaluate('document.querySelectorAll("[data-alternative-values] th[scope=row]").length'),3);
});

test('all purposes and long authored alternatives reflow at 320px in both themes',()=>{
  browser('set','viewport','320','812');
  for(const theme of ['light','dark']) {
    open();evaluate(`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'))`);browser('wait',`html.${theme}`);
    for(const value of ['informative','decorative','functional','complex']) {
      purpose(value);
      if(value!=='decorative')browser('fill','#alternative-text','LongInterfaceDescription'.repeat(10));
      assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false,`${theme} ${value}`);
      assert.equal(evaluate('document.querySelector("[data-alternative-image]").hasAttribute("alt")'),true);
    }
  }
});
