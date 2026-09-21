import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.localStorage={getItem(){return null},setItem(){},removeItem(){}};
globalThis.btoa=s=>Buffer.from(s,'binary').toString('base64');
globalThis.atob=s=>Buffer.from(s,'base64').toString('binary');

const { NeoGBA } = await import('../js/emulator.js');
const here=path.dirname(fileURLToPath(import.meta.url));
const romPath=path.join(here,'..','roms','Midnight Club - Street Racing (USA).gba');
assert.ok(fs.existsSync(romPath),'ROM de smoke GBA ausente');
const ctx={
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  fillRect(){},putImageData(){},createLinearGradient(){return{addColorStop(){}}},fillText(){},
  set fillStyle(v){},get fillStyle(){return''},set textAlign(v){},set font(v){}
};
const gba=new NeoGBA({getContext:()=>ctx},()=>{});
gba.loadROM(fs.readFileSync(romPath));
for(let i=0;i<120;i++) gba.runFrame();
const pc=gba.cpu.pc>>>0;
assert.ok(gba.ppu.frame>=120,`PPU não avançou 120 frames (${gba.ppu.frame})`);
assert.ok(pc>=0x02000000 && pc<0x10000000,`PC saiu das regiões executáveis esperadas: 0x${pc.toString(16)}`);
assert.ok(gba.cpu.unsupportedInstructions<16,`muitas instruções não suportadas: ${gba.cpu.unsupportedInstructions}`);
assert.notEqual(gba.cpu.lastException?.startsWith('THUMB não implementada'),true,'THUMB caiu em instrução não implementada');
assert.notEqual(gba.cpu.lastException?.startsWith('ARM não implementada'),true,'ARM caiu em instrução não implementada');
console.log(`GBA boot smoke: OK • frames=${gba.ppu.frame} • PC=0x${pc.toString(16).toUpperCase()} • unsupported=${gba.cpu.unsupportedInstructions}`);
