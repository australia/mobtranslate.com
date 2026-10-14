import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const base=process.env.STYLEGUIDE_URL??'http://127.0.0.1:3003',session=`mobtranslate-notice-content-${process.pid}`;
const browser=(...args)=>{
  let output;try{output=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:150000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'120000'}});}catch(error){if(!error.stdout)throw error;output=error.stdout;}
  const result=JSON.parse(output);assert.equal(result.success,true,result.error);return result.data;
};
const evaluate=code=>browser('eval',code).result;
const open=()=>{browser('open',`${base}/foundations/notification-content`);browser('wait','[data-notice-content-ready=true]');};
const click=name=>{const {refs}=browser('snapshot','-i');const matches=Object.entries(refs).filter(([_key,item])=>item.role==='button'&&item.name===name);assert.equal(matches.length,1,name);browser('click',`@${matches[0][0]}`);};
const capture=()=>{browser('focus','[data-notice-capture]');browser('press','Enter');};
const change=id=>{browser('focus',id);browser('press','Space');};
const count=()=>evaluate('document.querySelectorAll("[data-notice-record]").length');
before(()=>browser('set','viewport','1440','1000'));
after(()=>browser('close'));

test('captured content stays unchanged while the editor changes; explicit inspection returns focus',()=>{
  open();browser('fill','#notice-title','Original local title');browser('fill','#notice-body','Original local details');capture();
  browser('wait','[data-notice-record]');browser('fill','#notice-title','Edited title');browser('fill','#notice-body','Edited details');
  click('Open local notice 1');browser('wait','--fn','document.activeElement.id==="notice-opened-title"');
  assert.equal(evaluate('document.querySelector("[data-notice-detail-title]").textContent'),'Original local title');
  assert.equal(evaluate('document.querySelector("[data-notice-detail-body]").textContent'),'Original local details');
  assert.ok(evaluate('document.querySelector("[data-notice-record]").textContent.includes("opened in example")'));
  click('Close local record');browser('wait','--fn','document.activeElement.textContent==="Open local notice 1"');
  click('Open local notice 1');browser('wait','--fn','document.activeElement.id==="notice-opened-title"');
});

test('disabled announcements retain both priorities without changing live output',()=>{
  open();change('#notice-enabled');capture();browser('select','#notice-priority','time-sensitive');capture();
  browser('wait','--fn','document.querySelectorAll("[data-notice-record]").length===2');
  assert.equal(evaluate('document.querySelector("[data-notice-polite]").textContent'),'');
  assert.equal(evaluate('document.querySelector("[data-notice-urgent]").textContent'),'');
  assert.ok(evaluate('[...document.querySelectorAll("[data-notice-record]")].every(node=>node.textContent.includes("history-only"))'));
});

test('deferral retains a queue until explicit release, then requests one batch summary',()=>{
  open();change('#notice-defer');capture();capture();
  browser('wait','--fn','document.querySelectorAll("[data-notice-record]").length===2');
  assert.equal(evaluate('document.querySelector("[data-notice-polite]").textContent'),'');
  change('#notice-defer');assert.ok(evaluate('document.querySelector("[data-notice-counts]").textContent.includes("2 queued")'));
  click('Release queued notices');browser('wait','--fn','document.querySelector("[data-notice-polite]").textContent.includes("2 queued local notices")');
  assert.ok(evaluate('document.querySelector("[data-notice-counts]").textContent.includes("0 queued")'));
  assert.equal(count(),2);assert.equal(evaluate('document.querySelector("[data-notice-urgent]").textContent'),'');
  browser('wait','--fn','document.activeElement.hasAttribute("data-notice-capture")');
});

test('the time-sensitive exception bypasses deferral only while announcements remain enabled',()=>{
  open();change('#notice-defer');change('#notice-interrupt');browser('select','#notice-priority','time-sensitive');capture();
  browser('wait','--fn','document.querySelector("[data-notice-urgent]").textContent.includes("Local notice 1")');
  const first=evaluate('document.querySelector("[data-notice-urgent]").textContent');
  change('#notice-enabled');capture();browser('wait','--fn','document.querySelectorAll("[data-notice-record]").length===2');
  assert.equal(evaluate('document.querySelector("[data-notice-urgent]").textContent'),first);
  assert.ok(evaluate('document.querySelector("[data-notice-record]").textContent.includes("history-only")'));
});

test('compact redaction and new live text hide details while authorized local inspection retains them',()=>{
  open();browser('fill','#notice-title','Private-shaped example title');browser('fill','#notice-body','Illustrative detail, not private data');capture();
  browser('wait','[data-notice-preview]');
  assert.equal(evaluate('document.querySelector("[data-notice-preview-title]").textContent'),'New local notice');
  assert.ok(evaluate('!document.querySelector("[data-notice-polite]").textContent.includes("Private-shaped")'));
  click('Open latest local record');browser('wait','[data-notice-detail]');
  assert.equal(evaluate('document.querySelector("[data-notice-detail-title]").textContent'),'Private-shaped example title');
  change('#notice-redact');assert.equal(evaluate('document.querySelector("[data-notice-preview-title]").textContent'),'Private-shaped example title');
});

test('joined emoji counts distinct text units; missing segmentation is labelled and capture remains usable',()=>{
  open();browser('fill','#notice-title','T');browser('fill','#notice-body','👩🏽‍💻');
  browser('wait','--fn','document.querySelector("[data-notice-units]").textContent==="9"');
  assert.equal(evaluate('document.querySelector("[data-notice-points]").textContent'),'6');
  assert.equal(evaluate('document.querySelector("[data-notice-graphemes]").textContent'),'3');
  browser('fill','#notice-budget','1');assert.ok(evaluate('document.querySelector("[data-notice-budget-result]").textContent.includes("over")'));
  capture();browser('wait','[data-notice-record]');
  evaluate('window.noticeSegmenter=Intl.Segmenter;Intl.Segmenter=undefined');browser('fill','#notice-body','👩🏽‍💻!');
  assert.ok(evaluate('document.querySelector("[data-notice-graphemes]").textContent.includes("Unavailable")'));
  assert.ok(evaluate('document.querySelector("[data-notice-budget-result]").textContent.includes("code points (fallback)")'));
  evaluate('Intl.Segmenter=window.noticeSegmenter');
});

test('blank content, invalid review targets and long content remain truthful and bounded in both themes',()=>{
  browser('set','viewport','320','812');
  for(const theme of ['light','dark']) {
    open();evaluate(`localStorage.setItem('mt-theme','${theme}');window.dispatchEvent(new Event('storage'))`);browser('wait',`html.${theme}`);
    browser('fill','#notice-body',' ');browser('wait','--fn','document.querySelector("[data-notice-capture]").disabled');assert.equal(count(),0);
    browser('fill','#notice-body','LongInterfaceNotice'.repeat(12));browser('fill','#notice-budget','0');
    assert.ok(evaluate('document.querySelector("[data-notice-budget-result]").textContent.includes("Enter a review target")'));
    assert.equal(evaluate('document.querySelector("#notice-budget").getAttribute("aria-invalid")'),'true');
    capture();browser('wait','[data-notice-record]');click('Open latest local record');browser('wait','[data-notice-detail]');
    assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    assert.equal(count(),1);
    change('#notice-redact');capture();browser('wait','--fn','document.querySelectorAll("[data-notice-record]").length===2');
    assert.ok(evaluate('document.querySelector("[data-notice-polite]").textContent.includes("LongInterfaceNotice")'));
    assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  }
});
