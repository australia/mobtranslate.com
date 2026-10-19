import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { collectPublicAPI } from './audit-public-api.mjs';
import ts from 'typescript';

const check = process.argv.includes('--check');
const directory = new URL('../public/api-reference/', import.meta.url);
const report = collectPublicAPI();
const navigation = await readFile(new URL('../content/navigation.ts',import.meta.url),'utf8');
const code = ts.transpileModule(navigation,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {sections} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const routes = new Map(sections.flatMap(section=>section.items.map(item=>[item.href,item.label])));
const documents = report.exports.map(entry => ({...entry,
  topics:[...new Set(entry.sites.flatMap(site=>site.file.split('/').map(segment=>`/components/${segment}`).filter(href=>routes.has(href))))].map(href=>({href,label:routes.get(href)})),
  props:entry.props.sort((a,b)=>Number(b.locallyDeclared)-Number(a.locallyDeclared)||a.name.localeCompare(b.name,'en'))}));
const body = JSON.stringify(documents);
const revision = createHash('sha256').update(body).digest('hex');
const index = { revision, source: report.source, exports: documents.map(entry => ({name:entry.name,kind:entry.kind,runtime:entry.runtime,props:entry.props.length,localProps:entry.props.filter(prop=>prop.locallyDeclared).length})) };
const files = [ ['index.json', index], ...documents.map(entry => [ `${entry.name}.json`, {revision,...entry} ]) ];
if (!check) await mkdir(directory,{recursive:true});
for (const [name,data] of files) {
  const target = new URL(name,directory);
  const bytes = `${JSON.stringify(data)}\n`;
  if (check) {
    if (await readFile(target,'utf8') !== bytes) throw new Error(`API reference drift: ${name}. Run api:generate.`);
  } else await writeFile(target,bytes);
}
console.log(`${documents.length} compiler-resolved exports ${check?'verified':'generated'}; revision ${revision.slice(0,12)}. Per-export documents load on demand.`);
