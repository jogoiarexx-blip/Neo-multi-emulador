import fs from 'fs';
import {CPU6502} from '../js/cpu6502.js';
class MemBus{constructor(){this.mem=new Uint8Array(65536);this.reads=[];this.writes=[]}read(a){a&=0xffff;this.reads.push(a);return this.mem[a]}write(a,v){a&=0xffff;this.mem[a]=v&255;this.writes.push([a,v&255])}}
function cpuAt(pc=0x8000){const b=new MemBus(),c=new CPU6502(b);c.pc=pc;c.cycles=0;c.totalCycles=0;return{b,c}}
// Ricoh 2A03 keeps D flag but ADC/SBC never perform BCD arithmetic.
{
 const {b,c}=cpuAt();b.mem.set([0xf8,0xa9,0x09,0x69,0x01],0x8000);c.clock();while(c.cycles)c.clock();c.clock();while(c.cycles)c.clock();c.clock();if(c.a!==0x0a||(c.p&0x08)===0)throw new Error(`2A03 decimal behavior: A=${c.a.toString(16)} P=${c.p.toString(16)}`);
}
// Original 6502 JMP indirect page-wrap bug must be present.
{
 const {b,c}=cpuAt();b.mem.set([0x6c,0xff,0x10],0x8000);b.mem[0x10ff]=0x34;b.mem[0x1000]=0x12;b.mem[0x1100]=0x99;c.clock();if(c.pc!==0x1234)throw new Error(`JMP indirect wrap bug missing: ${c.pc.toString(16)}`);
}
// Zero-page pointer high byte wraps $FF->$00 for (zp),Y.
{
 const {b,c}=cpuAt();c.y=0;b.mem.set([0xb1,0xff],0x8000);b.mem[0x00ff]=0x00;b.mem[0x0000]=0x20;b.mem[0x2000]=0x77;c.clock();if(c.a!==0x77)throw new Error('zero-page indirect wrap');
}
// BRK pushes PC+2 and a status copy with B set, then vectors through FFFE/FFFF.
{
 const {b,c}=cpuAt();b.mem[0x8000]=0x00;b.mem[0xfffe]=0x00;b.mem[0xffff]=0x90;c.clock();if(c.pc!==0x9000)throw new Error('BRK vector');const hi=b.mem[0x01fd],lo=b.mem[0x01fc],ps=b.mem[0x01fb];if(((hi<<8)|lo)!==0x8002||(ps&0x10)===0)throw new Error('BRK stack semantics');
}
// Every byte value must have an explicit dispatch entry; default cannot hide missing opcodes.
{
 const src=fs.readFileSync(new URL('../js/cpu6502.js',import.meta.url),'utf8');const ops=new Set([...src.matchAll(/case\s+0x([0-9a-fA-F]{2})/g)].map(m=>parseInt(m[1],16)));if(ops.size!==256)throw new Error(`opcode dispatch coverage ${ops.size}/256`);
}
console.log('OK v0.7.8 CPU: 2A03 decimal-off, JMP bug, ZP wrap, BRK, 256/256 dispatch');
