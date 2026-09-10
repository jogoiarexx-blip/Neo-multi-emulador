import assert from 'node:assert/strict';
import {Bus} from '../js/bus.js';
import {FdsDevice,FDS_SIDE_SIZE,parseFds} from '../js/fds-support.js';

const raw=new Uint8Array(FDS_SIDE_SIZE*2);for(let i=0;i<raw.length;i++)raw[i]=(i*13)&255;
const doc=parseFds(raw.buffer);const bios=new Uint8Array(8192);bios.fill(0xea);bios[0x1ffc]=0;bios[0x1ffd]=0xe0;
const fds=new FdsDevice(doc,bios.buffer),bus=new Bus();bus.insertCartridge(fds);bus.reset();

// $4023 independently gates disk and sound I/O.
bus.write(0x4023,0x02);assert.equal(fds.diskIoEnable,false);assert.equal(fds.soundIoEnable,true);
bus.write(0x4020,1);bus.write(0x4021,0);bus.write(0x4022,2);for(let i=0;i<16;i++)fds.clockCpu();assert.equal(fds.timerIrq,false,'timer cannot run while disk I/O disabled');
bus.write(0x4023,0x03);assert.equal(fds.diskIoEnable,true);assert.equal(fds.soundIoEnable,true);

// Correct $4025 bit interpretation: scan=1, motor start=bit1 clear, read=bit2, CRC/transfer=bit6, IRQ=bit7.
bus.write(0x4025,0xc5);assert.equal(fds.scanDisk,true);assert.equal(fds.motorOn,true);assert.equal(fds.readMode,true);assert.equal(fds.crcEnabled,true);assert.equal(fds.transferIrqEnable,true);
// Transfer interval is 149 1/3 CPU cycles: byte becomes ready on cycle 150 from a clean phase.
fds.diskPos=0;fds.transferPhase=0;fds.dataReady=false;for(let i=0;i<149;i++)fds.clockCpu();assert.equal(fds.dataReady,false);fds.clockCpu();assert.equal(fds.dataReady,true);assert.equal(fds.transferCount,1);
assert.equal(fds.transferIrq,true);bus.write(0x4024,0x55);assert.equal(fds.transferIrq,false,'$4024 acknowledges disk transfer IRQ');

// Disk status protection/eject semantics.
fds.eject();const st=fds.cpuRead(0x4032);assert.ok(st&1,'ejected flag');assert.ok(st&4,'ejected disk reads write-protected');fds.insert(0);

// Sound I/O master enable and corrected wave/envelope behavior.
bus.write(0x4023,0x03);fds.cpuWrite(0x4089,0x80);for(let i=0;i<64;i++)fds.cpuWrite(0x4040+i,i&63);fds.cpuWrite(0x4080,0x9f);fds.cpuWrite(0x4082,0xff);fds.cpuWrite(0x4083,0x01);fds.cpuWrite(0x4089,0x00);for(let i=0;i<256;i++)fds.clockCpu();assert.notEqual(fds.expansionAudioSample(),0,'FDS audio enabled');bus.write(0x4023,0x01);assert.equal(fds.expansionAudioSample(),0,'sound I/O disable mutes FDS expansion audio');bus.write(0x4023,0x03);

// Persistent disk saves are page patches, not full 131KB disk copies.
fds.setSide(0);fds.writeProtected=false;bus.write(0x4025,0xc1);bus.write(0x4024,0x77);fds.diskPos=100;fds.transferPhase=447;fds.clockCpu();const persist=fds.persistent();assert.equal(persist.format,'NEO-FDS-PERSIST-v2');assert.equal(persist.patches.length,1);assert.ok(persist.patches[0].data.length<=256);const clone=new FdsDevice(doc,bios.buffer);clone.loadPersistent(persist);assert.equal(clone.diskData[100],0x77);assert.equal(clone.modifiedPages.size,1);

// State carries the disk delta and refined drive/audio fields.
const snap=fds.snapshot();assert.equal(snap.format,'NEO-FDS-STATE-v2');assert.ok(Array.isArray(snap.diskPatches));assert.ok('modEnv' in snap&&'soundIoEnable' in snap&&'transferPhase' in snap);
console.log('v0.8.9 FDS accuracy: I/O gates, $4025 semantics, 149⅓-cycle transfers, IRQ ack, audio gate, delta persistence OK');
