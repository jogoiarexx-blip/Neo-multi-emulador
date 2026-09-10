import {Cartridge} from '../js/cartridge.js';
import {Bus} from '../js/bus.js';
function rom(mapper=0){const prg=0x8000,chr=0x2000,d=new Uint8Array(16+prg+chr);d.set([0x4e,0x45,0x53,0x1a]);d[4]=2;d[5]=1;d[6]=(mapper&15)<<4;d[7]=mapper&0xf0;d[16+0x7ffc]=0;d[16+0x7ffd]=0x80;return d.buffer}
// $2002 clears VBlank and write latch; near-boundary read suppresses the new vblank edge.
{
 const b=new Bus();b.insertCartridge(new Cartridge(rom()));b.reset();const p=b.ppu;p.status|=0x80;p.writeToggle=1;p.scanline=p.vblankStart;p.cycle=0;const v=p.cpuRead(2);if(!(v&0x80)||p.status&0x80||p.writeToggle!==0||!p.suppressVblank)throw new Error('$2002 semantics');p.clock();p.clock();if(p.status&0x80)throw new Error('$2002 vblank suppression');
}
// $2007 during rendering should use rendering increments rather than the plain +1/+32 path.
{
 const b=new Bus();b.insertCartridge(new Cartridge(rom()));const p=b.ppu;p.mask=0x18;p.scanline=10;p.cycle=100;p.addr=0x001f;p.cpuRead(7);if((p.addr&0x001f)!==0)throw new Error('$2007 coarse X increment');
}
// MMC3 A12 edge must be ignored unless A12 stayed low for >=8 PPU dots.
{
 const c=new Cartridge(rom(4));const m=c.mapperImpl;m.irqLatch=0;m.irqEnabled=true;m.ppuAddress(0x0000,100);m.ppuAddress(0x1000,104);if(m.irqPending)throw new Error('MMC3 short A12 pulse accepted');m.ppuAddress(0x0000,110);m.ppuAddress(0x1000,120);if(!m.irqPending)throw new Error('MMC3 filtered A12 edge missed');
}
// Structured state keeps typed arrays through the binary snapshot path.
{
 const b=new Bus();b.insertCartridge(new Cartridge(rom()));const s=b.snapshotBinary({});if(!(s.ram instanceof Uint8Array)||!(s.ppu.vram instanceof Uint8Array)||s.version!==37)throw new Error('binary state typed arrays');b.restore(s);if(!(b.ppu.vram instanceof Uint8Array))throw new Error('binary state restore');
}
console.log('OK v0.7.8 accuracy: PPU status/2007, MMC3 A12 filter, binary structured state');
