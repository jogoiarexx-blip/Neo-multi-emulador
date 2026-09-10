import {Bus} from '../js/bus.js';
import {DebuggerCore} from '../js/debugger.js';
const b=new Bus();const d=new DebuggerCore(b);b.setDebugger(d);d.setEnabled(true);
// read/write breakpoints must see real bus accesses but peek must remain side-effect free
d.addBreakpoint('write',0x0010);b.write(0x10,0x42);if(!d.breakRequested||!d.breakReason.includes('Escrita'))throw new Error('write breakpoint');d.clearBreakRequest();
d.addBreakpoint('read',0x0010);if(b.read(0x10)!==0x42||!d.breakRequested||!d.breakReason.includes('Leitura'))throw new Error('read breakpoint');d.clearBreakRequest();
const before=d.breakRequested;b.peek(0x10);if(d.breakRequested!==before)throw new Error('peek triggered breakpoint');
const dump=d.memoryDump(0,32);if(!dump.includes('0010')||!dump.includes('42'))throw new Error('memory dump');
d.setTrace(true);b.cpu.pc=0x0000;b.cpu.cycles=0;d.recordInstruction();if(!d.trace.length)throw new Error('trace record');
console.log('OK v0.7.10 debugger pro: R/W breakpoints + side-effect-free memory viewer + trace');
