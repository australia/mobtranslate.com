import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../lib/spring-response.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {initialSpring,springResponse,sampleSpring,springCharacteristics,validateSpring}=await import(`data:text/javascript;base64,${Buffer.from(compiled+'\n//# sourceURL=spring-response-compiled-test.mjs\n').toString('base64')}`);
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} versus ${expected}`);

test('all regimes satisfy the stated initial position and velocity',()=>{
  for(const damping of [0,1,2,3,100])for(const initialVelocity of [-5,0,5]){
    const result=springResponse({...initialSpring,stiffness:1,damping,initialVelocity},0);
    close(result.position,0);close(result.velocity,initialVelocity);
  }
});
test('critical response matches 1-(1+t)exp(-t), with its derivative',()=>{
  const p={...initialSpring,stiffness:1,damping:2};
  assert.equal(springCharacteristics(p).regime,'critical');
  for(const t of [.1,1,4]){const point=springResponse(p,t);close(point.position,1-(1+t)*Math.exp(-t));close(point.velocity,t*Math.exp(-t));}
});
test('known real roots -1 and -2 give the expected overdamped response',()=>{
  const p={...initialSpring,stiffness:2,damping:3};
  assert.equal(springCharacteristics(p).regime,'overdamped');
  for(const t of [.1,1,4]){const point=springResponse(p,t);close(point.position,1-2*Math.exp(-t)+Math.exp(-2*t));close(point.velocity,2*Math.exp(-t)-2*Math.exp(-2*t));}
});
test('zero damping preserves unit-step oscillation rather than declaring convergence',()=>{
  const p={...initialSpring,stiffness:1,damping:0,duration:8};
  close(springResponse(p,Math.PI).position,2);close(springResponse(p,Math.PI).velocity,0);
  close(springResponse(p,2*Math.PI).position,0);close(springResponse(p,2*Math.PI).velocity,0);
  assert.equal(springCharacteristics(p).regime,'underdamped');
});
test('analytic values satisfy the differential equation at interior reference times',()=>{
  for(const damping of [0,1,2,3])for(const t of [.5,1,2]){
    const p={...initialSpring,stiffness:1,damping,initialVelocity:.7};const h=1e-5;
    const center=springResponse(p,t),before=springResponse(p,t-h),after=springResponse(p,t+h);
    const acceleration=(after.velocity-before.velocity)/(2*h);
    close(p.mass*acceleration+p.damping*center.velocity+p.stiffness*(center.position-1),0,1e-8);
    close((after.position-before.position)/(2*h),center.velocity,1e-8);
  }
});
test('bounded extremes and near-critical inputs remain finite with exact horizon coverage',()=>{
  for(const mass of [.1,1,10])for(const stiffness of [1,100,1000])for(const damping of [0,.001,20,100]){
    const p={mass,stiffness,damping,initialVelocity:-5,duration:8},samples=sampleSpring(p);
    assert.equal(samples.length,481);assert.equal(samples[0].time,0);assert.equal(samples.at(-1).time,8);
    assert.ok(samples.every(s=>Object.values(s).every(Number.isFinite)));
  }
  for(const delta of [-1e-8,0,1e-8])assert.ok(Object.values(springResponse({...initialSpring,damping:20+delta},1)).every(Number.isFinite));
  const fraction={...initialSpring,duration:.101};assert.ok((sampleSpring(fraction).length-1)/fraction.duration<=60);
});
test('invalid parameters and out-of-horizon observations are rejected',()=>{
  for(const [key,value] of [['mass',0],['stiffness',0],['damping',-1],['initialVelocity',6],['duration',9],['mass',NaN]]){
    const p={...initialSpring,[key]:value};assert.ok(validateSpring(p).length);assert.throws(()=>sampleSpring(p),RangeError);
  }
  for(const time of [-1,5,Infinity,NaN])assert.throws(()=>springResponse(initialSpring,time),RangeError);
});
