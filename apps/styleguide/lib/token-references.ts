import valueParser from 'postcss-value-parser';

export interface DeclaredToken {name:string;value:string;dark?:string|null}
export function references(value:string):string[]{
  const names=new Set<string>();
  valueParser(value).walk(node=>{
    if(node.type!=='function'||node.value.toLowerCase()!=='var')return;
    const first=node.nodes.find(part=>part.type!=='space'&&part.type!=='comment');
    if(first?.type==='word'&&first.value.startsWith('--'))names.add(first.value);
  });
  return [...names];
}
export function inspectTokenGraph(catalogue:DeclaredToken[],requested:string[],theme:'light'|'dark'){
  const byName=new Map(catalogue.map(token=>[token.name,token]));
  const nodes=new Map<string,{name:string;value:string;references:string[]}>();
  const missing=new Set<string>();const cycles:string[][]=[];const visited=new Set<string>();
  function visit(name:string,stack:string[]){
    const at=stack.indexOf(name);
    if(at>=0){cycles.push([...stack.slice(at),name]);return;}
    if(visited.has(name))return;
    const token=byName.get(name);if(!token){missing.add(name);return;}
    const value=theme==='dark'?token.dark??token.value:token.value;
    const refs=references(value);nodes.set(name,{name,value,references:refs});
    for(const ref of refs)visit(ref,[...stack,name]);
    visited.add(name);
  }
  for(const name of requested)visit(name,[]);
  return {tokens:catalogue.filter(token=>nodes.has(token.name)),nodes:[...nodes.values()],missing:[...missing],cycles};
}
