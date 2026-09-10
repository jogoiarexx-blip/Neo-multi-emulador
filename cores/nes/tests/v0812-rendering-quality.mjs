import assert from 'node:assert/strict';
import fs from 'node:fs';
const r=fs.readFileSync(new URL('../js/video-renderer.js',import.meta.url),'utf8');
const m=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const h=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const token of ['uGamma','uSharpness','uOutputSize','sharpBilinear','compositeNtsc','colorCorrect','powerPreference'])assert.ok(r.includes(token),token);
for(const token of ['gamma:100','sharpness:65','gammaRange','sharpnessRange','gpuCanvas.style.filter=\'none\''])assert.ok(m.includes(token),token);
for(const token of ['Gamma','Nitidez GPU','gammaRange','sharpnessRange','v0.8.12'])assert.ok(h.includes(token),token);
console.log('v0.8.12 rendering quality: GPU color pipeline + sharp scaling + composite + gamma/sharpness OK');
