import assert from 'assert';
import {Cartridge} from '../js/cartridge.js';
import {Bus} from '../js/bus.js';

function rom(mapper,{prg16=4,chr8=2}={}){
 const size=16+prg16*16384+chr8*8192,b=new Uint8Array(size);b.set([0x4e,0x45,0x53,0x1a]);b[4]=prg16;b[5]=chr8;b[6]=(mapper&0x0f)<<4;b[7]=mapper&0xf0;
 let off=16;for(let bank=0;bank<prg16*2;bank++)b.fill(bank&255,off+bank*0x2000,off+(bank+1)*0x2000);off+=prg16*16384;for(let bank=0;bank<chr8*8;bank++)b.fill((0x80+bank)&255,off+bank*0x400,off+(bank+1)*0x400);
 // reset vector into fixed final bank at $E000-$FFFF
 const vec=16+prg16*16384-4;b[vec]=0x00;b[vec+1]=0xe0;return b.buffer;
}

// Namco 163 / mapper 19
{
 const c=new Cartridge(rom(19)),bus=new Bus();bus.insertCartridge(c);bus.reset();assert.equal(c.mapper,19);
 c.cpuWrite(0xe000,2);assert.equal(c.cpuRead(0x8000),2,'N163 PRG bank');
 c.cpuWrite(0x8000,3);assert.equal(c.ppuRead(0x0000),0x83,'N163 CHR bank');
 // sound RAM auto-increment through real low CPU I/O ($F800/$4800)
 bus.write(0xf800,0x80);bus.write(0x4800,0xff);bus.write(0x4800,0xff);assert.equal(c.mapperImpl.soundRam[0],0xff);assert.equal(c.mapperImpl.soundRam[1],0xff);
 const set=(a,v)=>{bus.write(0xf800,a);bus.write(0x4800,v)};for(let i=0;i<16;i++)set(i,0xff);set(0x78,0x00);set(0x7a,0x02);set(0x7c,0xe0);set(0x7e,0);set(0x7f,0x0f);
 let peak=0;for(let i=0;i<200;i++)peak=Math.max(peak,Math.abs(c.expansionAudioSample()));assert(peak>0.01,'N163 expansion audio');
 bus.write(0x5000,0xfe);bus.write(0x5800,0xff);assert.equal(c.clockCpu(),true,'N163 IRQ');
 const snap=c.snapshot();c.cpuWrite(0xe000,7);c.restore(snap);assert.equal(c.mapperImpl.prgRegs[0],2,'N163 state restore');
}

// VRC7 / mapper 85
{
 const c=new Cartridge(rom(85)),bus=new Bus();bus.insertCartridge(c);bus.reset();assert.equal(c.mapper,85);
 c.cpuWrite(0x8000,3);assert.equal(c.cpuRead(0x8000),3,'VRC7 PRG bank');
 c.cpuWrite(0xa000,4);assert.equal(c.ppuRead(0x0000),0x84,'VRC7 CHR bank');
 const wr=(reg,val)=>{c.cpuWrite(0x9010,reg);c.cpuWrite(0x9030,val)};wr(0x10,0x80);wr(0x20,0x17);wr(0x30,0x00);
 let peak=0;for(let i=0;i<2000;i++)peak=Math.max(peak,Math.abs(c.expansionAudioSample()));assert(peak>0.01,'VRC7 expansion audio');
 c.cpuWrite(0xe010,0xfe);c.cpuWrite(0xf000,0x06);assert.equal(c.clockCpu(),false);assert.equal(c.clockCpu(),true,'VRC7 cycle IRQ');
 const snap=c.snapshot();c.cpuWrite(0x8000,1);c.restore(snap);assert.equal(c.mapperImpl.prgRegs[0],3,'VRC7 state restore');
}
console.log('v0.8.10 N163/VRC7: banking, IRQ, audio and state restore OK');
