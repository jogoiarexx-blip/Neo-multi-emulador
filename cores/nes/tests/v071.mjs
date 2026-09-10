import fs from 'node:fs';
import {Cartridge} from '../js/cartridge.js';
function rom(mapper=5, prg16=8, chr8=4){const n=16+prg16*16384+chr8*8192,b=new Uint8Array(n);b.set([0x4e,0x45,0x53,0x1a]);b[4]=prg16;b[5]=chr8;b[6]=(mapper&15)<<4;b[7]=mapper&0xf0;for(let i=16;i<n;i++)b[i]=i&255;return b.buffer}
const c=new Cartridge(rom());
if(c.mapper!==5)throw new Error('Mapper 5 parse falhou');
// Fill mode on nametable quadrant 0.
c.cpuWrite(0x5105,0x03);c.cpuWrite(0x5106,0x2a);c.cpuWrite(0x5107,0x02);
const vram=new Uint8Array(4096);
if(c.nametableRead(0x2000,vram)!==0x2a)throw new Error('MMC5 fill tile falhou');
if(c.nametableRead(0x23c0,vram)!==0xaa)throw new Error('MMC5 fill attr falhou');
// ExRAM mapping quadrant 0.
c.cpuWrite(0x5105,0x02);c.nametableWrite(0x2005,0x77,vram);if(c.nametableRead(0x2005,vram)!==0x77)throw new Error('MMC5 ExRAM falhou');
// Multiplier.
c.cpuWrite(0x5205,7);c.cpuWrite(0x5206,9);if(c.cpuRead(0x5205)!==63||c.cpuRead(0x5206)!==0)throw new Error('MMC5 multiplier falhou');
// Audio should produce a finite sample.
c.cpuWrite(0x5000,0xcf);c.cpuWrite(0x5002,0x20);c.cpuWrite(0x5003,0x00);c.cpuWrite(0x5015,1);for(let i=0;i<128;i++)c.clockCpu();const a=c.expansionAudioSample();if(!Number.isFinite(a))throw new Error('MMC5 audio inválido');
console.log('v0.7.8 MMC5 tests OK', a.toFixed(5));
