'use client';
import * as React from 'react';
import { Autocomplete as BaseAutocomplete } from '@base-ui-components/react/autocomplete';
import { cn } from '../../utils/cn';

export interface AutocompleteOption { value: string; label: string; disabled?: boolean; }
export interface AutocompleteProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onSelect' | 'value' | 'defaultValue'> {
  options: AutocompleteOption[];
  value?: string;
  defaultValue?: string;
  emptyMessage?: React.ReactNode;
  onChange?: (value: string) => void;
  onOptionSelect?: (option: AutocompleteOption) => void;
}

export const Autocomplete = React.forwardRef<HTMLInputElement, AutocompleteProps>(
  ({ className, options, value, defaultValue, onChange, onOptionSelect, emptyMessage="No matching suggestions. You can keep your own text.", disabled=false, readOnly=false, name, required, ...props }, ref) => {
    const [open,setOpen]=React.useState(false);
    const mounted=React.useRef(true);
    const highlighted=React.useRef<AutocompleteOption | undefined>(undefined);
    const reportedEvent=React.useRef<Event | null>(null);
    const reportVersion=React.useRef(0);
    React.useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
    React.useEffect(()=>{if(disabled || readOnly)setOpen(false);},[disabled,readOnly]);
    function report(option:AutocompleteOption,event:Event){
      if(!mounted.current || disabled || readOnly || option.disabled || reportedEvent.current===event)return;
      reportedEvent.current=event;reportVersion.current++;onOptionSelect?.(option);
    }
    return <div className="mt-autocomplete" dir={props.dir}>
      <BaseAutocomplete.Root items={options} value={value} defaultValue={defaultValue} onItemHighlighted={option=>{highlighted.current=option;}} onValueChange={(next,details)=>{
        const target=details.event.target;
        const key=target instanceof Element ? target.closest('[data-autocomplete-option-value]')?.getAttribute('data-autocomplete-option-value') : null;
        const option=key != null ? options.find(item=>item.value===key) : highlighted.current;
        onChange?.(next);
        // The primitive also accepts drag-release through mouseup, without click.
        if(details.reason==='item-press' && option)report(option,details.event);
      }} itemToStringValue={option=>option.label} open={open && !disabled && !readOnly} onOpenChange={setOpen} openOnInputClick disabled={disabled} readOnly={readOnly} name={name} required={required}>
        <BaseAutocomplete.Input ref={ref} className={cn('mt-autocomplete-input',className)} {...props} />
        <BaseAutocomplete.Portal><BaseAutocomplete.Positioner sideOffset={8} collisionPadding={8} className="mt-autocomplete-positioner"><BaseAutocomplete.Popup className="mt-autocomplete-popup" dir={props.dir}>
          <BaseAutocomplete.Empty className="mt-autocomplete-empty">{emptyMessage}</BaseAutocomplete.Empty>
          <BaseAutocomplete.List className="mt-autocomplete-list">{(option:AutocompleteOption)=><BaseAutocomplete.Item key={option.value} value={option} disabled={option.disabled} data-autocomplete-option-value={option.value} className="mt-autocomplete-item" onClick={event=>{const nativeEvent=event.nativeEvent;const version=reportVersion.current;queueMicrotask(()=>{if(reportVersion.current===version)report(option,nativeEvent);});}}>{option.label}</BaseAutocomplete.Item>}</BaseAutocomplete.List>
        </BaseAutocomplete.Popup></BaseAutocomplete.Positioner></BaseAutocomplete.Portal>
      </BaseAutocomplete.Root>
    </div>;
  }
);
Autocomplete.displayName='Autocomplete';
