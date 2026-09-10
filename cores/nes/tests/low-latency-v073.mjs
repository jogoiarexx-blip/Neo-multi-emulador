import {APU} from '../js/apu.js';
import {Bus} from '../js/bus.js';
import {Cartridge} from '../js/cartridge.js';
function rom(){const b=new Uint8Array(16+16384+8192);b.set([0x4e,0x45,0x53,0x1a,1,1,0,0],0);const p=16;p=0;return b.buffer}
// restoreFast must not flush AudioWorklet while temporary states are restored.
const a=new APU();let flushes=0;a.node={port:{postMessage:m=>{if(m?.type==='flush')flushes++}}};const s=a.captureFast({});a.restoreFast(s);if(flushes!==0)throw new Error('restoreFast flushed audio');a.restore(s);if(flushes!==1)throw new Error('full restore should flush audio');
// suppressOutput must not fill the outgoing sample block.
const before=a.samplePos;a.suppressOutput=true;a.pushSample(.5);if(a.samplePos!==before)throw new Error('suppressed sample advanced buffer');a.suppressOutput=false;a.pushSample(.5);if(a.samplePos!==before+1)throw new Error('normal sample did not advance buffer');
console.log('OK v0.7.8 low-latency APU restore/suppression');
