import {Cartridge} from '../js/cartridge.js';import {Bus} from '../js/bus.js';
function rom(region){const d=new Uint8Array(16+32768+8192);d.set([0x4e,0x45,0x53,0x1a]);d[4]=2;d[5]=1;d[7]=8;d[12]=region;d[16+32768-4]=0;d[16+32768-3]=0x80;return d.buffer}
for(const [r,name,lines,div] of [[0,'NTSC',262,3],[1,'PAL',312,3.2],[3,'Dendy',312,3]]){const c=new Cartridge(rom(r)),b=new Bus();b.insertCartridge(c);if(b.region!==name||b.ppu.totalScanlines!==lines||Math.abs(b.cpuDivider-div)>.001)throw new Error('region '+name);const s=b.snapshot();if(s.version!==37||s.region!==name)throw new Error('state region '+name);}
const b=new Bus();b.openBus=0xa4;if(b.read(0x5000)!==0xa4)throw new Error('CPU open bus');b.ppu.driveOpenBus(0xc0);b.ppu.palette[0]=0x2a;b.ppu.addr=0x3f00;const v=b.ppu.cpuRead(7);if((v&0xc0)!==0xc0)throw new Error('PPU palette open bus high bits');
console.log('OK NTSC/PAL/Dendy timing + CPU/PPU open bus');
