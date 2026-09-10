import fs from 'fs';
const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('../js/video-renderer.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const token of ["upscale:'auto'","overscanPreset:'full'","Math.min(2,Number(cfg.runAhead)","inputPollMs","activeOverscan()","sourceDimensions()"]){if(!main.includes(token))throw new Error('main missing '+token)}
for(const token of ['uUvMin','uUvMax','mix(uUvMin,uUvMax,vUv)','present(source,smooth=false,crop=null)']){if(!renderer.includes(token))throw new Error('renderer missing '+token)}
for(const token of ['Auto (escala inteira)','5×','6×','Consumer CRT','2 frames (experimental)','overscanTop','overscanRight']){if(!html.includes(token))throw new Error('html missing '+token)}
console.log('OK v0.8.2 video/latency: integer scaling + overscan GPU/Canvas + run-ahead 2 + input profiler');
