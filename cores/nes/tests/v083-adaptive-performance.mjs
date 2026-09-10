import fs from 'node:fs';
const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const apu=fs.readFileSync(new URL('../js/apu.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const x of ['performanceProfile','resolveAutoPerformanceProfile','audioStats']) if(!(main+apu+html).includes(x)) throw new Error('missing '+x);
if(!html.includes('Auto adaptativa')) throw new Error('audio auto UI missing');
if(!apu.includes('adaptAudioBuffer')) throw new Error('adaptive buffer missing');
console.log('v0.8.3 adaptive performance/audio OK');
