import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const rate=22050,seconds=6,frequency=440,frames=rate*seconds;
const bytes=Buffer.alloc(44+frames*2);
bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);
for(let index=0;index<frames;index++){const t=index/rate;const envelope=Math.min(1,t/.03,(seconds-t)/.03);bytes.writeInt16LE(Math.round(32767*.08*envelope*Math.sin(2*Math.PI*frequency*t)),44+index*2);}
const manifest={title:'Generated local audio test signal',source:'/fixtures/ui-tone.wav',frequencyHz:frequency,durationSeconds:seconds,sampleRateHz:rate,channels:1,bitsPerSample:16,sha256:createHash('sha256').update(bytes).digest('hex'),provenance:'Project-authored deterministic synthetic signal. No speech, pronunciation, music recording or cultural asset.'};
const json=JSON.stringify(manifest,null,2)+'\n';
const audio=new URL('../public/fixtures/ui-tone.wav',import.meta.url),metadata=new URL('../public/fixtures/ui-tone.json',import.meta.url);
if(process.argv.includes('--check')){if(!(await readFile(audio)).equals(bytes)||await readFile(metadata,'utf8')!==json)throw Error('Audio fixture drift; regenerate with scripts/generate-audio-fixture.mjs.');}
else{await writeFile(audio,bytes);await writeFile(metadata,json);}
console.log(`Audio fixture ${process.argv.includes('--check')?'verified':'generated'}: ${bytes.length} bytes, ${manifest.sha256}.`);
