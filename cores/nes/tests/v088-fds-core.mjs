import assert from 'node:assert/strict';
import {Bus} from '../js/bus.js';
import {FdsDevice,FDS_SIDE_SIZE,parseFds} from '../js/fds-support.js';

const raw=new Uint8Array(FDS_SIDE_SIZE*2);for(let i=0;i<raw.length;i++)raw[i]=i&255;const doc=parseFds(raw.buffer);
const bios=new Uint8Array(8192);bios.fill(0xea);bios[0x1ffc]=0x00;bios[0x1ffd]=0xe0;bios[0x1ffa]=0x00;bios[0x1ffb]=0xe0;bios[0x1ffe]=0x00;bios[0x1fff]=0xe0;
const fds=new FdsDevice(doc,bios.buffer);const bus=new Bus();bus.insertCartridge(fds);bus.reset();
assert.equal(bus.cpu.pc,0xe000,'FDS reset vector must come from BIOS');
bus.write(0x6000,0x5a);assert.equal(bus.read(0x6000),0x5a,'32KB FDS work RAM');
fds.ppuWrite(0x123,0xa5);assert.equal(fds.ppuRead(0x123),0xa5,'FDS CHR-RAM');
// Timer IRQ
bus.write(0x4020,3);bus.write(0x4021,0);bus.write(0x4022,2);for(let i=0;i<8;i++)fds.clockCpu();assert.equal(fds.timerIrq,true,'FDS timer IRQ should fire');assert.ok(fds.cpuRead(0x4030)&1);assert.equal(fds.timerIrq,false,'4030 acknowledges timer IRQ');
// Disk read byte stream
fds.setSide(0);bus.write(0x4025,0xc5); // scan + motor on + read mode + CRC/transfer + IRQ
for(let i=0;i<151;i++)fds.clockCpu();assert.equal(fds.dataReady,true);assert.equal(fds.cpuRead(0x4031),0,'first disk byte');
for(let i=0;i<151;i++)fds.clockCpu();assert.equal(fds.cpuRead(0x4031),1,'second disk byte');
// Side change and write mode
fds.setSide(1);assert.equal(fds.side,1);fds.writeProtected=false;bus.write(0x4024,0x77);bus.write(0x4025,0xc1); // scan + motor on + write mode + CRC/transfer + IRQ
for(let i=0;i<151;i++)fds.clockCpu();assert.equal(fds.diskData[FDS_SIDE_SIZE],0x77,'disk write should modify selected side');assert.equal(fds.diskDirty,true);
const before=fds.diskData[FDS_SIDE_SIZE+1];fds.writeProtected=true;bus.write(0x4024,0x44);for(let i=0;i<151;i++)fds.clockCpu();assert.equal(fds.diskData[FDS_SIDE_SIZE+1],before,'write protection');
// Basic FDS wavetable audio
fds.writeProtected=false;fds.waveWrite=true;for(let i=0;i<64;i++)fds.cpuWrite(0x4040+i,i&63);fds.cpuWrite(0x4080,0x9f);fds.cpuWrite(0x4082,0xff);fds.cpuWrite(0x4083,0x01);fds.cpuWrite(0x4089,0x00);let nonzero=false;for(let i=0;i<5000;i++){fds.clockCpu();if(Math.abs(fds.expansionAudioSample())>1e-5){nonzero=true;break}}assert.equal(nonzero,true,'FDS wavetable output');
// State roundtrip
const snap=fds.snapshot();fds.setSide(0);fds.diskPos=999;fds.restore(snap);assert.equal(fds.side,1);assert.notEqual(fds.diskPos,999);
console.log('v0.8.8 FDS core: BIOS/RAM/CHR, timer IRQ, drive read/write, side change, write protect, audio, state OK');
