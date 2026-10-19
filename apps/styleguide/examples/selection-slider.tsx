'use client';
import { useState } from 'react';
import { Button, DirectionProvider, Slider } from '@mobtranslate/ui';

export function SliderSelectionExample() {
  const [value, setValue] = useState(4);
  const [range, setRange] = useState<readonly number[]>([2,8]);
  const [vertical, setVertical] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [committed, setCommitted] = useState('No committed local adjustment.');
  const direction = rtl ? 'rtl' : 'ltr';
  const samples=[0,2,5,8,10].filter(unit=>unit>=range[0]&&unit<=range[1]);
  return <div data-slider-lab className="space-y-4">
    <div className="flex flex-wrap gap-3">{[{label:'Vertical orientation', checked:vertical, setter:setVertical}, {label:'RTL interaction direction', checked:rtl, setter:setRtl}, {label:'Disable local sliders', checked:disabled, setter:setDisabled}].map(({label, checked, setter}) => <label className="flex gap-2 min-h-11 items-center" key={label}><input type="checkbox" checked={checked} onChange={event => setter(event.target.checked)} />{label}</label>)}</div>
    <DirectionProvider direction={direction}><div dir={direction} className="space-y-4">
      <p dir="auto">Local sample level: {value} of 10 units. Keyboard arrows and the number input provide alternatives to dragging.</p>
      <Slider data-single-slider value={value} min={0} max={10} step={1} largeStep={2} orientation={vertical ? 'vertical' : 'horizontal'} disabled={disabled} aria-label="Local sample level" getAriaValueText={(_, current) => `${current} of 10 sample units`} onValueChange={next => { if (typeof next === 'number') setValue(next); }} onValueCommitted={next => setCommitted(`Committed local level: ${String(next)}.`)} />
      <label className="block">Exact local sample level <input data-exact-level type="number" className="mt-input" min="0" max="10" step="1" value={value} disabled={disabled} onChange={event => { const next = event.target.valueAsNumber; if (Number.isFinite(next) && next >= 0 && next <= 10 && Number.isInteger(next)) setValue(next); }} /></label>
      <p dir="auto" data-slider-preview style={{fontSize:`${1+value/10}rem`,overflowWrap:'anywhere'}}>English-only immediate preview. Level changes type size from 1rem to 2rem.</p>
      <p dir="auto">Local range: {range[0]} to {range[1]} units. Endpoints cannot cross; minimum separation is one step.</p>
      <Slider data-range-slider value={range} min={0} max={10} minStepsBetweenValues={1} thumbCollisionBehavior="none" orientation="horizontal" disabled={disabled} getAriaLabel={index => index === 0 ? 'Minimum local sample level' : 'Maximum local sample level'} getAriaValueText={(_, current) => `${current} sample units`} onValueChange={next => { if (Array.isArray(next)) setRange(next); }} />
      <ul data-slider-records className="guidance-list">{samples.map(unit=><li key={unit} data-slider-unit={unit}>Local record at {unit} sample units</li>)}</ul>
      {!samples.length&&<p dir="auto" data-slider-empty>No local sample records are within this range. Adjust the endpoints or restore the local range.</p>}
      <Button type="button" variant="outline" style={{paddingInline:12}} disabled={disabled} onClick={()=>setRange([2,8])}>Restore local range</Button>
    </div></DirectionProvider>
    <p role="status" dir="auto">{committed} These values have no authority or proficiency meaning.</p>
  </div>;
}
