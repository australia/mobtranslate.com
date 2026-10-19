import {readFile,writeFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(new URL('../public/fixtures/alternative-counts.json',import.meta.url),'utf8'));
const rows=fixture.rows;
if(!Array.isArray(rows)||!rows.length||rows.length>8||rows.some(row=>typeof row.label!=='string'||!row.label.trim()||!Number.isFinite(row.value)||row.value<0)||new Set(rows.map(row=>row.label)).size!==rows.length)throw new Error('Expected 1–8 unique labelled nonnegative fixture values.');
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const maximum=Math.max(1,...rows.map(row=>row.value));
const step=282/rows.length,width=Math.min(56,step*0.6);
const rectangles=rows.map((row,index)=>`  <rect data-group="${escape(row.label)}" data-value="${row.value}" x="${24+step*(index+0.5)-width/2}" y="${168-row.value/maximum*140}" width="${width}" height="${row.value/maximum*140}" fill="#b45e2a" />`).join('\n');
const output=`<svg xmlns="http://www.w3.org/2000/svg" width="330" height="180" viewBox="0 0 330 180">\n${rectangles}\n</svg>\n`;
const target=new URL('../public/fixtures/alternative-counts.svg',import.meta.url);
if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==output)throw new Error('Alternative-text illustration is stale. Run alternative-fixture:generate.');}
else await writeFile(target,output);
console.log(`${rows.length} illustrative bars ${process.argv.includes('--check')?'verified':'generated'} from their shared values.`);
