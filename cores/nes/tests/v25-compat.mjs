import {Cartridge} from '../js/cartridge.js';

function makeRom(mapper,{prg8Banks=32,chr1Banks=64,trainer=false}={}){
 const prg=prg8Banks*0x2000,chr=chr1Banks*0x400,extra=trainer?512:0;
 const d=new Uint8Array(16+extra+prg+chr);d.set([0x4e,0x45,0x53,0x1a]);
 d[4]=Math.ceil(prg/16384);d[5]=Math.ceil(chr/8192);d[6]=((mapper&15)<<4)|(trainer?4:0);d[7]=mapper&0xf0;
 let off=16;if(trainer){for(let i=0;i<512;i++)d[off+i]=i&255;off+=512}
 for(let b=0;b<prg8Banks;b++)d.fill(b&255,off+b*0x2000,off+(b+1)*0x2000);
 off+=prg;for(let b=0;b<chr1Banks;b++)d.fill((0x80+b)&255,off+b*0x400,off+(b+1)*0x400);
 return d.buffer;
}
for(const mapper of [21,22,23,25]){
 const c=new Cartridge(makeRom(mapper));
 c.cpuWrite(0x8000,3);c.cpuWrite(0xa000,4);
 if(c.cpuRead(0x8000)!==3||c.cpuRead(0xa000)!==4)throw new Error(`VRC mapper ${mapper} PRG banking`);
 c.cpuWrite(0xb000,6);if(c.ppuRead(0)!==0x86)throw new Error(`VRC mapper ${mapper} CHR banking`);
 if(mapper!==22){c.cpuWrite(0xf000,0x0e);c.cpuWrite(0xf001,0x0f);c.cpuWrite(0xf002,0x06);if(c.clockCpu())throw new Error(`VRC mapper ${mapper} IRQ early`);if(!c.clockCpu())throw new Error(`VRC mapper ${mapper} IRQ missing`)}
}
{
 const c=new Cartridge(makeRom(5));
 c.cpuWrite(0x5114,0x83);if(c.cpuRead(0x8000)!==3)throw new Error('MMC5 8K PRG banking');
 c.cpuWrite(0x5205,13);c.cpuWrite(0x5206,17);if(c.cpuRead(0x5205)!==(221&255)||c.cpuRead(0x5206)!==(221>>8))throw new Error('MMC5 multiplier');
 c.cpuWrite(0x5203,2);c.cpuWrite(0x5204,0x80);if(c.clockScanline())throw new Error('MMC5 IRQ early');if(!c.clockScanline())throw new Error('MMC5 IRQ missing');
}
{
 const c=new Cartridge(makeRom(0,{trainer:true}));
 if(c.prgRam[0x1000]!==0||c.prgRam[0x1001]!==1||c.prgRam[0x11ff]!==255)throw new Error('iNES trainer mapping');
}
console.log('OK VRC2/VRC4 mappers 21/22/23/25, MMC5 initial core, trainer mapping');
