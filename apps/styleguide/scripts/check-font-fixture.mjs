import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('../public/fonts/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('roboto-flex.json', root), 'utf8'));
for (const entry of [manifest.font, manifest.license]) {
  const bytes = await readFile(new URL(entry.file, root));
  assert.equal(bytes.length, entry.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `Changed font/license bytes: ${entry.file}`);
  assert.ok(entry.source.includes(`/${manifest.upstreamCommit}/`));
}
const bytes = await readFile(new URL(manifest.font.file, root));
assert.equal(bytes.readUInt32BE(0), 0x00010000, 'Expected pinned TrueType sfnt');
const tables = new Map();
for (let i=0; i<bytes.readUInt16BE(4); i++) {
  const entry=12+16*i, offset=bytes.readUInt32BE(entry+8), length=bytes.readUInt32BE(entry+12);
  assert.ok(offset+length<=bytes.length);
  tables.set(bytes.toString('ascii',entry,entry+4), {offset,length});
}
const table=tables.get('fvar');assert.ok(table);
const start=table.offset;
assert.equal(bytes.readUInt16BE(start),1);assert.equal(bytes.readUInt16BE(start+2),0);
const array=bytes.readUInt16BE(start+4), count=bytes.readUInt16BE(start+8), size=bytes.readUInt16BE(start+10);
assert.ok(count>0&&size>=20&&array+count*size<=table.length);
const actual=[];
const names=tables.get('name');assert.ok(names);
function axisName(id) {
  const begin=names.offset, count=bytes.readUInt16BE(begin+2), strings=bytes.readUInt16BE(begin+4);
  const candidates=[];
  for(let i=0;i<count;i++) {
    const at=begin+6+i*12,platform=bytes.readUInt16BE(at),encoding=bytes.readUInt16BE(at+2),language=bytes.readUInt16BE(at+4);
    if(bytes.readUInt16BE(at+6)!==id || !(platform===0 || (platform===3 && [1,10].includes(encoding) && language===0x0409))) continue;
    const length=bytes.readUInt16BE(at+8),offset=bytes.readUInt16BE(at+10);
    assert.ok(length%2===0&&strings+offset+length<=names.length);
    candidates.push({priority:platform===3?1:0,name:Buffer.from(bytes.subarray(begin+strings+offset,begin+strings+offset+length)).swap16().toString('utf16le')});
  }
  candidates.sort((a,b)=>b.priority-a.priority);assert.ok(candidates.length);
  return candidates[0].name;
}
for(let i=0;i<count;i++) {
  const at=start+array+i*size;
  const axis={tag:bytes.toString('ascii',at,at+4),min:bytes.readInt32BE(at+4)/65536,default:bytes.readInt32BE(at+8)/65536,max:bytes.readInt32BE(at+12)/65536,hidden:Boolean(bytes.readUInt16BE(at+16)&1)};
  axis.nameID=bytes.readUInt16BE(at+18);axis.name=axisName(axis.nameID);
  assert.match(axis.tag,/^[A-Za-z0-9 ]{4}$/);
  assert.ok(axis.min<=axis.default&&axis.default<=axis.max);
  actual.push(axis);
}
assert.deepEqual(manifest.axes,actual,'Manifest must describe actual binary fvar records');
assert.equal(new Set(actual.map(axis=>axis.tag)).size,count);
console.log(`${bytes.length} font bytes, license and ${count} actual axes verified at ${manifest.upstreamCommit}.`);
