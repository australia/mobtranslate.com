export interface SpringParameters {
  mass:number;
  stiffness:number;
  damping:number;
  initialVelocity:number;
  duration:number;
}
export interface SpringSample {time:number;position:number;velocity:number}
export const initialSpring:SpringParameters={mass:1,stiffness:100,damping:20,initialVelocity:0,duration:4};

export function validateSpring(parameters:SpringParameters):string[]{
  const errors:string[]=[];
  if(!Number.isFinite(parameters.mass)||parameters.mass<.1||parameters.mass>10)errors.push('Mass must be 0.1–10.');
  if(!Number.isFinite(parameters.stiffness)||parameters.stiffness<1||parameters.stiffness>1000)errors.push('Stiffness must be 1–1000.');
  if(!Number.isFinite(parameters.damping)||parameters.damping<0||parameters.damping>100)errors.push('Damping must be 0–100.');
  if(!Number.isFinite(parameters.initialVelocity)||Math.abs(parameters.initialVelocity)>5)errors.push('Initial velocity must be −5–5.');
  if(!Number.isFinite(parameters.duration)||parameters.duration<.1||parameters.duration>8)errors.push('Preview duration must be 0.1–8 seconds.');
  return errors;
}

export function springCharacteristics(parameters:SpringParameters){
  const errors=validateSpring(parameters);if(errors.length)throw new RangeError(errors.join(' '));
  const naturalFrequency=Math.sqrt(parameters.stiffness/parameters.mass);
  const alpha=parameters.damping/(2*parameters.mass);
  const discriminant=alpha*alpha-naturalFrequency*naturalFrequency;
  const tolerance=1e-10*Math.max(1,alpha*alpha,naturalFrequency*naturalFrequency);
  const regime=Math.abs(discriminant)<=tolerance?'critical':discriminant<0?'underdamped':'overdamped';
  return {naturalFrequency,alpha,discriminant,regime,dampingRatio:alpha/naturalFrequency};
}

// Unit-step response of m*x'' + c*x' + k*(x-1) = 0, x(0)=0.
// Time is seconds, and the initial velocity is in model displacement units/second.
export function springResponse(parameters:SpringParameters,time:number):SpringSample{
  const {naturalFrequency,alpha,discriminant,regime}=springCharacteristics(parameters);
  if(!Number.isFinite(time)||time<0||time>parameters.duration)throw new RangeError('Time must be within the captured preview duration.');
  const displacement=-1,initialVelocity=parameters.initialVelocity;
  let offset:number,velocity:number;
  if(regime==='critical'){
    const coefficient=initialVelocity+alpha*displacement;
    const decay=Math.exp(-alpha*time);
    offset=decay*(displacement+coefficient*time);
    velocity=decay*(coefficient-alpha*(displacement+coefficient*time));
  }else if(regime==='underdamped'){
    const frequency=Math.sqrt(-discriminant),coefficient=(initialVelocity+alpha*displacement)/frequency;
    const cosine=Math.cos(frequency*time),sine=Math.sin(frequency*time),decay=Math.exp(-alpha*time);
    offset=decay*(displacement*cosine+coefficient*sine);
    velocity=decay*((-alpha*displacement+coefficient*frequency)*cosine+(-alpha*coefficient-displacement*frequency)*sine);
  }else{
    const root=Math.sqrt(discriminant),fast=-alpha-root;
    // This equivalent slow root avoids subtracting nearly equal positive values.
    const slow=-(naturalFrequency*naturalFrequency)/(alpha+root);
    const first=(initialVelocity-slow*displacement)/(fast-slow),second=displacement-first;
    offset=first*Math.exp(fast*time)+second*Math.exp(slow*time);
    velocity=first*fast*Math.exp(fast*time)+second*slow*Math.exp(slow*time);
  }
  return {time,position:1+offset,velocity};
}

export function sampleSpring(parameters:SpringParameters):SpringSample[]{
  const errors=validateSpring(parameters);if(errors.length)throw new RangeError(errors.join(' '));
  const intervals=Math.floor(parameters.duration*60);
  return Array.from({length:intervals+1},(_,index)=>springResponse(parameters,index===intervals?parameters.duration:index/intervals*parameters.duration));
}
