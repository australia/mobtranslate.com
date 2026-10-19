import {test,expect} from 'vitest';
import {Hct,argbFromHex,hexFromArgb,SchemeTonalSpot,sourceColorFromImageBytes,redFromArgb,greenFromArgb,blueFromArgb} from '@material/material-color-utilities';
import fixture from '../public/fixtures/color-source.json';
import {buildColorProposal,initialColorInput,opaqueColorRatio,validateColorInput} from '../lib/color-proposal';

test('roles use the pinned SDK and its declared background relationships',()=>{
  const actual=buildColorProposal(initialColorInput);
  const expected=new SchemeTonalSpot(Hct.fromInt(argbFromHex(initialColorInput.sourceHex)),false,0,'2025','phone');
  expect(actual.roles.length).toBe(expected.colors.allColors.length);
  expect(actual.roles.find(role=>role.name==='primary')?.hex).toBe(hexFromArgb(expected.primary));
  expect(actual.roles.find(role=>role.name==='on_primary')?.backgrounds[0]?.name).toBe('primary');
  expect(actual.safePreview).toBe(true);
});
test('contrast endpoint/reference values are opaque sRGB measures',()=>{
  expect(opaqueColorRatio('#000000','#ffffff')).toBeCloseTo(21,8);
  expect(opaqueColorRatio('#123456','#123456')).toBeCloseTo(1,8);
  expect(opaqueColorRatio('#000000','#777777')).toBeCloseTo(4.6895,3);
  expect(()=>opaqueColorRatio('#fff','#000000')).toThrow(RangeError);
});
test('requested HCT reports the realized gamut rather than promising the requested chroma',()=>{
  const result=buildColorProposal({...initialColorInput,sourceMode:'hct',hue:360,chroma:150,tone:95});
  expect(result.source.hex).toMatch(/^#[0-9a-f]{6}$/);
  expect(result.source.chroma).toBeLessThan(150);
  expect(result.source.tone).toBeCloseTo(95,0);
  expect(result.palettes.every(palette=>palette.tones.length===11)).toBe(true);
});
test('both themes, all variants/levels and effective fallback remain explicit',()=>{
  for(const variant of ['tonal','expressive','fidelity'] as const)for(const isDark of [false,true])for(const contrastLevel of [-1,0,.5,1]){
    const result=buildColorProposal({...initialColorInput,variant,isDark,contrastLevel});
    expect(result.input.isDark).toBe(isDark);expect(result.requestedSpec).toBe('2025');
    expect(result.roles.every(role=>/^#[0-9a-f]{6}$/.test(role.hex)&&Number.isFinite(role.tone)&&role.backgrounds.every(pair=>Number.isFinite(pair.ratio)&&pair.ratio>=1&&pair.ratio<=21.000001))).toBe(true);
  }
  expect(buildColorProposal({...initialColorInput,variant:'fidelity'}).effectiveSpec).toBe('2021');
});
test('harmonization is an explicit separate custom-color operation',()=>{
  const plain=buildColorProposal(initialColorInput),blended=buildColorProposal({...initialColorInput,harmonize:true});
  expect(plain.custom.result.hex).toBe(initialColorInput.customHex);
  expect(blended.custom.result.hex).not.toBe(plain.custom.result.hex);
  expect(blended.roles).toEqual(plain.roles);
  expect(buildColorProposal({...initialColorInput,customHex:initialColorInput.sourceHex,harmonize:true}).custom.result.hex).toBe(initialColorInput.sourceHex);
});
test('invalid encodings, coordinates, levels and specification choices are rejected',()=>{
  for(const change of [{sourceHex:'#fff'},{customHex:'red'},{sourceMode:'hct' as const,tone:NaN},{sourceMode:'hct' as const,chroma:151},{contrastLevel:2},{specVersion:'unknown' as '2025'}]){
    const input={...initialColorInput,...change};expect(validateColorInput(input).length).toBeGreaterThan(0);expect(()=>buildColorProposal(input)).toThrow(RangeError);
  }
});

test('original fixture pixels give a deterministic ranked SDK seed',()=>{
  const bytes:number[]=[];
  for(let row=0;row<fixture.height;row++)for(const band of fixture.bands){const argb=argbFromHex(band.hex);for(let column=0;column<band.width;column++)bytes.push(redFromArgb(argb),greenFromArgb(argb),blueFromArgb(argb),255);}
  expect(bytes.length).toBe(fixture.width*fixture.height*4);
  const seed=hexFromArgb(sourceColorFromImageBytes(new Uint8ClampedArray(bytes)));
  expect(seed).toMatch(/^#[0-9a-f]{6}$/);
  expect(fixture.bands.map(band=>band.hex)).toContain(seed);
});
