import {describe,it,expect} from 'vitest';
import {inspectTokenGraph,references} from '../lib/token-references';

describe('declared token references',()=>{
  it('parses nested fallbacks/comments and ignores quoted/url text',()=>{
    expect(references('calc(var(/* note */ --a) + var(--b, var(--c))) "var(--fake)" url("var(--also-fake)")')).toEqual(['--a','--b','--c']);
  });
  it('deduplicates transitive shared dependencies and selects authored context',()=>{
    const tokens=[{name:'--a',value:'var(--b)',dark:'var(--d)'},{name:'--b',value:'var(--c)'},{name:'--c',value:'1rem'},{name:'--d',value:'var(--c)'},{name:'--unused',value:'red'}];
    expect(inspectTokenGraph(tokens,['--a','--b'],'light').tokens.map(t=>t.name)).toEqual(['--a','--b','--c']);
    expect(inspectTokenGraph(tokens,['--a'],'dark').tokens.map(t=>t.name)).toEqual(['--a','--c','--d']);
  });
  it('bounds cyclic walks and reports missing names including fallback branches',()=>{
    const result=inspectTokenGraph([{name:'--a',value:'var(--b)'},{name:'--b',value:'var(--a, var(--external))'}],['--a'],'light');
    expect(result.tokens).toHaveLength(2);expect(result.cycles).toEqual([['--a','--b','--a']]);expect(result.missing).toEqual(['--external']);
  });
});
