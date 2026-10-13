'use client';
import * as React from 'react';
import {RadioGroup as BaseRadioGroup} from '@base-ui-components/react/radio-group';
import {Radio as BaseRadio} from '@base-ui-components/react/radio';
import {DirectionProvider} from '@base-ui-components/react/direction-provider';
import {cn} from '../../utils/cn';
export interface RatingProps extends Omit<React.HTMLAttributes<HTMLDivElement>,'onChange'|'defaultValue'> {
  value?:number;
  defaultValue?:number;
  max?:number;
  size?:'sm'|'md'|'lg';
  readOnly?:boolean;
  disabled?:boolean;
  name?:string;
  required?:boolean;
  onChange?:(value:number)=>void;
  getItemLabel?:(value:number,max:number)=>string;
}
export const Rating=React.forwardRef<HTMLDivElement,RatingProps>(
  ({className,value,defaultValue=0,max=5,size='md',readOnly=false,disabled=false,name,required,onChange,getItemLabel=(value)=>`${value} star${value===1?'':'s'}`,dir,onPointerLeave,onKeyDown,...props},ref)=>{
    const count=Number.isSafeInteger(max)&&max>0?max:5;
    const valid=(next:number)=>Number.isInteger(next)&&next>=0&&next<=count;
    const [internal,setInternal]=React.useState(defaultValue);
    const [hover,setHover]=React.useState(0);
    const supplied=value===undefined?internal:value;
    const selected=valid(supplied)?supplied:0;
    const preview=!disabled&&!readOnly&&hover>0&&hover<=count?hover:selected;
    const group=<BaseRadioGroup ref={ref} name={name} required={required} disabled={disabled} readOnly={readOnly} value={selected===0?null:selected} onValueChange={next=>{if(typeof next!=='number'||!valid(next)||disabled||readOnly)return;if(value===undefined)setInternal(next);onChange?.(next);}} aria-label="Rating" aria-invalid={!valid(supplied)||undefined} data-invalid-value={!valid(supplied)||undefined} className={cn('mt-rating',`mt-rating-${size}`,readOnly&&'mt-rating-readonly',className)} dir={dir} onPointerLeave={event=>{setHover(0);onPointerLeave?.(event);}} onKeyDown={event=>{setHover(0);onKeyDown?.(event);}} {...props}>
      {Array.from({length:count},(_,index)=>index+1).map(star=><BaseRadio.Root key={star} value={star} className={cn('mt-rating-star',star<=preview&&'mt-rating-star-filled')} aria-label={getItemLabel(star,count)} onPointerEnter={event=>{if(event.pointerType==='mouse'&&!disabled&&!readOnly)setHover(star);}}><svg aria-hidden="true" viewBox="0 0 24 24" fill={star<=preview?'currentColor':'none'} stroke="currentColor" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg></BaseRadio.Root>)}
    </BaseRadioGroup>;
    return dir==='rtl'||dir==='ltr'?<DirectionProvider direction={dir==='rtl'?'rtl':'ltr'}>{group}</DirectionProvider>:group;
  }
);
Rating.displayName='Rating';
