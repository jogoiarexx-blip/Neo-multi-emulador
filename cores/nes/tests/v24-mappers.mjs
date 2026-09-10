import {Cartridge} from '../js/cartridge.js';
function makeRom(mapper,{prg8Banks=32,chr1Banks=64}={}){
 const prg=prg8Banks*0x2000,chr=chr1Banks*0x400,d=new Uint8Array(16+prg+chr);d.set([0x4e,0x45,0x53,0x1a]);d[4]=Math.ceil(prg/16384);d[5]=Math.ceil(chr/8192);d[6]=(mapper&15)<<4;d[7]=mapper&0xf0;
 for(let b=0;b<prg8Banks;b++)d.fill(b&255,16+b*0x2000,16+(b+1)*0x2000);
 const off=16+prg;for(let b=0;b<chr1Banks;b++)d.fill((0x80+b)&255,off+b*0x400,off+(b+1)*0x400);
 return d.buffer;
}
let c=new Cartridge(makeRom(18));
// PRG reg0 = 0x03, reg1 = 0x04, reg2 = 0x05
c.cpuWrite(0x8000,3);c.cpuWrite(0x8001,0);c.cpuWrite(0x8002,4);c.cpuWrite(0x8003,0);c.cpuWrite(0x9000,5);c.cpuWrite(0x9001,0);
if(c.cpuRead(0x8000)!==3||c.cpuRead(0xa000)!==4||c.cpuRead(0xc000)!==5)throw new Error('Mapper18 PRG banking');
// CHR0 = 6
c.cpuWrite(0xa000,6);c.cpuWrite(0xa001,0);if(c.ppuRead(0)!==0x86)throw new Error('Mapper18 CHR banking');
// IRQ reload 1, enable 16-bit => fires after counter wraps
c.cpuWrite(0xe000,1);c.cpuWrite(0xe001,0);c.cpuWrite(0xe002,0);c.cpuWrite(0xe003,0);c.cpuWrite(0xf000,0);c.cpuWrite(0xf001,1);
if(c.clockCpu())throw new Error('Mapper18 IRQ early');if(!c.clockCpu())throw new Error('Mapper18 IRQ missing');

c=new Cartridge(makeRom(24));c.cpuWrite(0x8000,2);if(c.cpuRead(0x8000)!==4)throw new Error('VRC6a 16K PRG bank');c.cpuWrite(0xc000,7);if(c.cpuRead(0xc000)!==7)throw new Error('VRC6a 8K PRG bank');
c.cpuWrite(0xd000,9);if(c.ppuRead(0)!==0x89)throw new Error('VRC6a CHR bank');
c.cpuWrite(0x9000,0x8f);c.cpuWrite(0x9001,1);c.cpuWrite(0x9002,0x80);if(!(c.expansionAudioSample()>0))throw new Error('VRC6a pulse audio');
c.cpuWrite(0xf000,0xfe);c.cpuWrite(0xf001,0x06);if(c.clockCpu())throw new Error('VRC6a IRQ early');if(!c.clockCpu())throw new Error('VRC6a IRQ missing');

c=new Cartridge(makeRom(26));
// On mapper 26 A0/A1 are swapped: physical $9002 maps to logical $9001, $9001 -> $9002.
c.cpuWrite(0x9000,0x8f);c.cpuWrite(0x9002,1);c.cpuWrite(0x9001,0x80);if(!(c.expansionAudioSample()>0))throw new Error('VRC6b register swap/audio');
console.log('OK mapper 18, mapper 24/26 VRC6, IRQ and expansion audio');
