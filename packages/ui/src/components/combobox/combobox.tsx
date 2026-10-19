'use client';
import * as React from 'react';
import {Combobox as BaseCombobox} from '@base-ui-components/react/combobox';
import {cn} from '../../utils/cn';
export interface ComboboxOption {value:string;label:string;disabled?:boolean;}
export interface ComboboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>,'onChange'|'value'|'defaultValue'|'onSelect'> {
  options:ComboboxOption[];
  value?:string;
  defaultValue?:string;
  inputValue?:string;
  defaultInputValue?:string;
  onInputValueChange?:(value:string)=>void;
  onChange?:(value:string)=>void;
  onOptionSelect?:(option:ComboboxOption)=>void;
  emptyMessage?:React.ReactNode;
  triggerLabel?:string;
}
export const Combobox=React.forwardRef<HTMLInputElement,ComboboxProps>(
  ({className,options,value,defaultValue,inputValue,defaultInputValue,onInputValueChange,onChange,onOptionSelect,emptyMessage='No matching registered choices. Try another search.',triggerLabel='Show registered choices',disabled=false,readOnly=false,name,required,...props},ref)=>{
    const [open,setOpen]=React.useState(false);
    const mounted=React.useRef(true);
    const reported=React.useRef<Event | null>(null);
    const version=React.useRef(0);
    React.useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
    React.useEffect(()=>{if(disabled || readOnly)setOpen(false);},[disabled,readOnly]);
    function report(option:ComboboxOption,event:Event){if(!mounted.current || disabled || readOnly || option.disabled || reported.current===event)return;reported.current=event;version.current++;onOptionSelect?.(option);}
    return <div className="mt-combobox" dir={props.dir}>
      <BaseCombobox.Root items={options.map(option=>option.value)} value={value===''?null:value} defaultValue={defaultValue===''?null:defaultValue} inputValue={inputValue} defaultInputValue={defaultInputValue} onInputValueChange={next=>onInputValueChange?.(next)} itemToStringLabel={id=>options.find(option=>option.value===id)?.label ?? id ?? ''} itemToStringValue={id=>id ?? ''} onValueChange={(next,details)=>{onChange?.(next ?? '');const option=options.find(item=>item.value===next);if(details.reason==='item-press' && option)report(option,details.event);}} open={open && !disabled && !readOnly} onOpenChange={setOpen} disabled={disabled} readOnly={readOnly} name={name} required={required}>
        <BaseCombobox.Input ref={ref} className={cn('mt-combobox-input',className)} {...props} />
        <BaseCombobox.Trigger className="mt-combobox-trigger" aria-label={triggerLabel} disabled={disabled || readOnly}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></BaseCombobox.Trigger>
        <BaseCombobox.Portal><BaseCombobox.Positioner sideOffset={8} collisionPadding={8} className="mt-combobox-positioner"><BaseCombobox.Popup className="mt-combobox-popup" dir={props.dir}>
          <BaseCombobox.Empty className="mt-combobox-empty">{emptyMessage}</BaseCombobox.Empty>
          <BaseCombobox.List className="mt-combobox-list">{(id:string)=>{const option=options.find(item=>item.value===id);return option ? <BaseCombobox.Item key={id} value={id} disabled={option.disabled} className="mt-combobox-item" onClick={event=>{const nativeEvent=event.nativeEvent;const before=version.current;queueMicrotask(()=>{if(version.current===before)report(option,nativeEvent);});}}><BaseCombobox.ItemIndicator aria-hidden="true">✓</BaseCombobox.ItemIndicator>{option.label}</BaseCombobox.Item> : null;}}</BaseCombobox.List>
        </BaseCombobox.Popup></BaseCombobox.Positioner></BaseCombobox.Portal>
      </BaseCombobox.Root>
    </div>;
  }
);
Combobox.displayName='Combobox';
