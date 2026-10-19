import {readFile,writeFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(new URL('../public/fixtures/color-source.json',import.meta.url),'utf8'));
if(!Number.isInteger(fixture.width)||!Number.isInteger(fixture.height)||fixture.width<1||fixture.height<1||fixture.width>256||fixture.height>256||!Array.isArray(fixture.bands)||!fixture.bands.length||fixture.bands.some(band=>!Number.isInteger(band.width)||band.width<1||!/^#[\da-f]{6}$/i.test(band.hex))||fixture.bands.reduce((sum,band)=>sum+band.width,0)!==fixture.width)throw new Error('Invalid bounded color fixture.');
let x=0;const rectangles=fixture.bands.map(band=>{const result=`<rect${x?` x="${x}"`:''} width="${band.width}" height="${fixture.height}" fill="${band.hex}"/>`;x+=band.width;return result;}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${fixture.width}" height="${fixture.height}" viewBox="0 0 ${fixture.width} ${fixture.height}">${rectangles}</svg>\n`;
const destination=new URL('../public/fixtures/color-source.svg',import.meta.url);
if(process.argv.includes('--check')){if(await readFile(destination,'utf8')!==svg)throw new Error('Color fixture is stale. Run node scripts/generate-color-fixture.mjs.');}else await writeFile(destination,svg);
console.log(`${fixture.width*fixture.height} original fixture pixels ${process.argv.includes('--check')?'verified':'generated'} from their band specification.`);
