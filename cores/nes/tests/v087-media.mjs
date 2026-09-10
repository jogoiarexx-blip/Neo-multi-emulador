import assert from 'assert';
import {Bus} from '../js/bus.js';
import {parseNsf,NsfPlayer} from '../js/nsf-player.js';
import {parseFds,validateFdsBios} from '../js/fds-support.js';

function makeNsf(){const b=new Uint8Array(0x80+8);b.set([0x4e,0x45,0x53,0x4d,0x1a],0);b[5]=1;b[6]=2;b[7]=1;b[8]=0x00;b[9]=0x80;b[10]=0x00;b[11]=0x80;b[12]=0x01;b[13]=0x80;const title=new TextEncoder().encode('NEO TEST');b.set(title,0x0e);b[0x6e]=0xff;b[0x6f]=0x40; // ~16639 us
 // 8000 RTS; 8001 INC $00; RTS
 b.set([0x60,0xe6,0x00,0x60,0xea,0xea,0xea,0xea],0x80);return b.buffer}
const doc=parseNsf(makeNsf());assert.equal(doc.format,'NSF');assert.equal(doc.songs,2);assert.equal(doc.title,'NEO TEST');
const bus=new Bus();const p=new NsfPlayer(bus,doc);p.install();assert.equal(p.song,0);p.runMs(40);assert(bus.ram[0]>0,'PLAY routine should execute and increment RAM');p.next();assert.equal(p.song,1);

const nsfe=[];const push=(id,data)=>{const n=data.length;nsfe.push(n&255,(n>>8)&255,(n>>16)&255,(n>>24)&255,...new TextEncoder().encode(id),...data)};nsfe.push(...new TextEncoder().encode('NSFE'));push('INFO',[0x00,0x80,0x00,0x80,0x01,0x80,0,0,1,0]);push('DATA',[0x60,0x60]);push('auth',[...new TextEncoder().encode('Title\0Artist\0')]);push('NEND',[]);const nd=parseNsf(Uint8Array.from(nsfe).buffer);assert.equal(nd.format,'NSFe');assert.equal(nd.title,'Title');assert.equal(nd.artist,'Artist');

const raw=new Uint8Array(65500*2);raw[0]=1;const fd=parseFds(raw.buffer);assert.equal(fd.sides.length,2);assert.equal(fd.sides[0].label,'Disco 1 — Lado A');assert.equal(fd.sides[1].label,'Disco 1 — Lado B');assert.equal(validateFdsBios(new Uint8Array(8192).buffer).valid,true);assert.throws(()=>validateFdsBios(new Uint8Array(4096).buffer));
console.log('v0.8.7 media tests OK');
