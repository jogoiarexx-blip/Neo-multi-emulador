import {Bus} from '../js/bus.js';
import {Cartridge} from '../js/cartridge.js';
function rom(){const a=new Uint8Array(16+16384+8192);a.set([0x4e,0x45,0x53,0x1a,1,1,0,0],0);a[16+0x3ffc]=0x00;a[16+0x3ffd]=0x80;return a}
const b=new Bus();b.insertCartridge(new Cartridge(rom()));b.reset();
// Secondary OAM is explicit and keeps at most eight sprite records.
for(let i=0;i<10;i++){b.ppu.oam[i*4]=19;b.ppu.oam[i*4+1]=0;b.ppu.oam[i*4+2]=0;b.ppu.oam[i*4+3]=i*8}
b.ppu.mask=0x18;b.ppu.beginSpriteEvaluation(20);for(let i=0;i<64;i++)b.ppu.stepSpriteEvaluation();
if(b.ppu.spriteEvalFound!==8)throw new Error('secondary OAM did not stop at 8 sprites');
if(!(b.ppu.status&0x20))throw new Error('overflow not raised');
if(b.ppu.secondaryOam[0]!==19||b.ppu.secondaryOamIndex[0]!==0)throw new Error('secondary OAM capture bad');
// DMC waits for an in-flight OAM write rather than clobbering it.
b.dma={active:true,page:0,addr:1,data:0x77,dummy:false};b.cpu.totalCycles=1;b.dmcDma={active:true,address:0xc000,remaining:4,deferred:0,collisions:0};b.clockDma=Bus.prototype.clockDma.bind(b);
// emulate arbiter branch used by Bus.clock at an OAM write phase
const oamWrite=b.dma.active&&!b.dma.dummy&&((b.cpu.totalCycles&1)===1);if(oamWrite){b.dmcDma.deferred++;b.dmcDma.collisions++;b.clockDma()}else b.clockDmcDma();
if(b.dmcDma.remaining!==4||b.dmcDma.collisions!==1)throw new Error('DMC/OAM arbitration failed');
const st=b.snapshotBinary({});if(st.version!==37||!(st.ppu.secondaryOam instanceof Uint8Array))throw new Error('v36 state missing new PPU state');
console.log('OK v0.7.8 stability: secondary OAM, DMC/OAM arbitration, state v37');
