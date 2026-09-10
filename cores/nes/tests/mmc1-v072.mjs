import {Cartridge} from '../js/cartridge.js';
function rom(){const d=new Uint8Array(16+0x8000+0x2000);d.set([0x4e,0x45,0x53,0x1a]);d[4]=2;d[5]=1;d[6]=0x10;return d.buffer}
const c=new Cartridge(rom()),m=c.mapperImpl;
// Consecutive CPU-cycle write is ignored by MMC1 hardware.
m.cpuWrite(0x8000,0,10);const after=m.shift;m.cpuWrite(0x8000,1,11);if(m.shift!==after)throw new Error('MMC1 consecutive-cycle write filter');
// Reset serial register then write PRG register value $10 => PRG-RAM disabled.
m.cpuWrite(0x8000,0x80,20);for(let i=0;i<5;i++)m.cpuWrite(0xe000,(0x10>>i)&1,30+i*2);if(m.prgRamEnabled!==false)throw new Error('MMC1 PRG-RAM disable bit');
console.log('OK MMC1 serial timing + PRG-RAM enable semantics');
