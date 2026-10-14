export const geometryFields = [
  {key:'width',label:'Panel width',unit:'m',min:0.01,max:10},
  {key:'height',label:'Panel height',unit:'m',min:0.01,max:10},
  {key:'distance',label:'Viewing distance',unit:'m',min:0.1,max:10},
  {key:'target',label:'Square target side',unit:'m',min:0.01,max:1},
] as const;
export type GeometryKey = typeof geometryFields[number]['key'];
export type GeometryDraft = Record<GeometryKey,string>;
export const initialGeometry:GeometryDraft={width:'0.8',height:'0.5',distance:'1.5',target:'0.06'};
export interface XRGeometry {width:number;height:number;distance:number;target:number;horizontalDegrees:number;verticalDegrees:number;targetDegrees:number;aspect:number}
export function angularSize(size:number,distance:number) {return 2*Math.atan(size/(2*distance))*180/Math.PI;}
export function resolveGeometry(draft:GeometryDraft):{errors:Partial<Record<GeometryKey,string>>;geometry:XRGeometry|null} {
  const values={} as Record<GeometryKey,number>;
  const errors:Partial<Record<GeometryKey,string>>={};
  for(const field of geometryFields) {
    const raw=draft[field.key].trim(),value=Number(raw);
    if(!raw||!Number.isFinite(value)||value<field.min||value>field.max)errors[field.key]=`Enter ${field.label.toLowerCase()} from ${field.min} to ${field.max} ${field.unit}.`;
    values[field.key]=value;
  }
  if(!Object.keys(errors).length&&(values.target>values.width||values.target>values.height))errors.target='The target must fit within both panel dimensions.';
  if(Object.keys(errors).length)return {errors,geometry:null};
  return {errors,geometry:{...values,horizontalDegrees:angularSize(values.width,values.distance),verticalDegrees:angularSize(values.height,values.distance),targetDegrees:angularSize(values.target,values.distance),aspect:values.width/values.height}};
}
