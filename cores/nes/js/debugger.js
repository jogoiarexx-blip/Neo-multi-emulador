const HEX=(v,n=2)=>((v>>>0).toString(16).toUpperCase().padStart(n,'0'));
const OP={
0x00:['BRK','imp',1],0x20:['JSR','abs',3],0x40:['RTI','imp',1],0x60:['RTS','imp',1],0x4c:['JMP','abs',3],0x6c:['JMP','ind',3],
0xa9:['LDA','#',2],0xa5:['LDA','zp',2],0xb5:['LDA','zpx',2],0xad:['LDA','abs',3],0xbd:['LDA','absx',3],0xb9:['LDA','absy',3],0xa1:['LDA','indx',2],0xb1:['LDA','indy',2],
0xa2:['LDX','#',2],0xa6:['LDX','zp',2],0xb6:['LDX','zpy',2],0xae:['LDX','abs',3],0xbe:['LDX','absy',3],0xa0:['LDY','#',2],0xa4:['LDY','zp',2],0xb4:['LDY','zpx',2],0xac:['LDY','abs',3],0xbc:['LDY','absx',3],
0x85:['STA','zp',2],0x95:['STA','zpx',2],0x8d:['STA','abs',3],0x9d:['STA','absx',3],0x99:['STA','absy',3],0x81:['STA','indx',2],0x91:['STA','indy',2],
0x86:['STX','zp',2],0x96:['STX','zpy',2],0x8e:['STX','abs',3],0x84:['STY','zp',2],0x94:['STY','zpx',2],0x8c:['STY','abs',3],
0x69:['ADC','#',2],0x65:['ADC','zp',2],0x75:['ADC','zpx',2],0x6d:['ADC','abs',3],0x7d:['ADC','absx',3],0x79:['ADC','absy',3],0x61:['ADC','indx',2],0x71:['ADC','indy',2],
0xe9:['SBC','#',2],0xeb:['SBC','#',2],0xe5:['SBC','zp',2],0xf5:['SBC','zpx',2],0xed:['SBC','abs',3],0xfd:['SBC','absx',3],0xf9:['SBC','absy',3],0xe1:['SBC','indx',2],0xf1:['SBC','indy',2],
0x29:['AND','#',2],0x09:['ORA','#',2],0x49:['EOR','#',2],0xc9:['CMP','#',2],0xe0:['CPX','#',2],0xc0:['CPY','#',2],0x24:['BIT','zp',2],0x2c:['BIT','abs',3],
0x10:['BPL','rel',2],0x30:['BMI','rel',2],0x50:['BVC','rel',2],0x70:['BVS','rel',2],0x90:['BCC','rel',2],0xb0:['BCS','rel',2],0xd0:['BNE','rel',2],0xf0:['BEQ','rel',2],
0xea:['NOP','imp',1],0x18:['CLC','imp',1],0x38:['SEC','imp',1],0x58:['CLI','imp',1],0x78:['SEI','imp',1],0xb8:['CLV','imp',1],0xd8:['CLD','imp',1],0xf8:['SED','imp',1],
0xaa:['TAX','imp',1],0x8a:['TXA','imp',1],0xa8:['TAY','imp',1],0x98:['TYA','imp',1],0xba:['TSX','imp',1],0x9a:['TXS','imp',1],0x48:['PHA','imp',1],0x68:['PLA','imp',1],0x08:['PHP','imp',1],0x28:['PLP','imp',1],
0xe8:['INX','imp',1],0xca:['DEX','imp',1],0xc8:['INY','imp',1],0x88:['DEY','imp',1]
};
function operand(mode,pc,b1,b2){const w=b1|(b2<<8);switch(mode){case'#':return `#$${HEX(b1)}`;case'zp':return `$${HEX(b1)}`;case'zpx':return `$${HEX(b1)},X`;case'zpy':return `$${HEX(b1)},Y`;case'abs':return `$${HEX(w,4)}`;case'absx':return `$${HEX(w,4)},X`;case'absy':return `$${HEX(w,4)},Y`;case'ind':return `($${HEX(w,4)})`;case'indx':return `($${HEX(b1)},X)`;case'indy':return `($${HEX(b1)}),Y`;case'rel':{const o=b1<128?b1:b1-256;return `$${HEX((pc+2+o)&65535,4)}`};default:return ''}}
export class DebuggerCore{
 constructor(bus){this.bus=bus;this.execBreakpoints=new Set();this.readBreakpoints=new Set();this.writeBreakpoints=new Set();this.eventBreakpoints={irq:false,nmi:false,sprite0:false};this.enabled=false;this.breakRequested=false;this.breakReason='';this.trace=[];this.traceLimit=4096;this.traceEnabled=false;this.lastTracePc=-1}
 setEnabled(v){this.enabled=!!v;if(!v)this.clearBreakRequest()}
 setTrace(v){this.traceEnabled=!!v;if(!v)this.lastTracePc=-1}
 addBreakpoint(type,addr){addr&=65535;const s=type==='read'?this.readBreakpoints:type==='write'?this.writeBreakpoints:this.execBreakpoints;s.add(addr)}
 removeBreakpoint(type,addr){addr&=65535;const s=type==='read'?this.readBreakpoints:type==='write'?this.writeBreakpoints:this.execBreakpoints;s.delete(addr)}
 addExecBreakpoint(addr){this.addBreakpoint('exec',addr)}
 removeExecBreakpoint(addr){this.removeBreakpoint('exec',addr)}
 clearBreakpoints(){this.execBreakpoints.clear();this.readBreakpoints.clear();this.writeBreakpoints.clear();this.eventBreakpoints={irq:false,nmi:false,sprite0:false};this.clearBreakRequest()}
 setEventBreakpoint(type,v=true){if(type in this.eventBreakpoints)this.eventBreakpoints[type]=!!v}
 onEvent(type,detail=''){if(!this.enabled||!this.eventBreakpoints[type])return;this.breakRequested=true;this.breakReason=`Evento ${type.toUpperCase()}${detail?`: ${detail}`:''}`}
 clearBreakRequest(){this.breakRequested=false;this.breakReason=''}
 onMemoryAccess(type,addr,value){if(!this.enabled)return;const s=type==='read'?this.readBreakpoints:this.writeBreakpoints;if(s.has(addr&65535)){this.breakRequested=true;this.breakReason=`${type==='read'?'Leitura':'Escrita'} em $${HEX(addr,4)} = $${HEX(value)}`}}
 checkExecution(){if(!this.enabled)return false;const c=this.bus.cpu;if(c.cycles===0&&!this.bus.dma.active&&!this.bus.dmcDma.active&&this.execBreakpoints.has(c.pc&65535)){this.breakRequested=true;this.breakReason=`Execução em $${HEX(c.pc,4)}`;return true}return false}
 shouldBreak(){return this.breakRequested||this.checkExecution()}
 recordInstruction(){if(!this.enabled||!this.traceEnabled)return;const c=this.bus.cpu;if(c.cycles!==0||c.pc===this.lastTracePc)return;this.lastTracePc=c.pc;const op=this.bus.peek(c.pc);this.trace.push({pc:c.pc&65535,op,a:c.a,x:c.x,y:c.y,sp:c.sp,p:c.p,cycles:c.totalCycles,scanline:this.bus.ppu.scanline,dot:this.bus.ppu.cycle});if(this.trace.length>this.traceLimit)this.trace.splice(0,this.trace.length-this.traceLimit)}
 traceText(limit=512){return this.trace.slice(-Math.max(1,limit)).map(t=>`${HEX(t.pc,4)}  ${HEX(t.op)}  A:${HEX(t.a)} X:${HEX(t.x)} Y:${HEX(t.y)} P:${HEX(t.p)} SP:${HEX(t.sp)} CYC:${t.cycles} PPU:${t.scanline},${t.dot}`).join('\n')}
 clearTrace(){this.trace.length=0;this.lastTracePc=-1}
 stepInstruction(){this.clearBreakRequest();const c=this.bus.cpu;let guard=5000,started=false,oldTotal=c.totalCycles;while(guard-->0){this.bus.clock();this.recordInstruction();if(c.totalCycles!==oldTotal)started=true;if(started&&c.cycles===0&&!this.bus.dma.active&&!this.bus.dmcDma.active)break}return guard>0}
 stepScanline(){this.clearBreakRequest();const p=this.bus.ppu,start=p.scanline;let guard=2000;while(guard-->0&&p.scanline===start){this.bus.clock();this.recordInstruction()}return guard>0}
 stepFrame(){this.clearBreakRequest();const p=this.bus.ppu;p.frameComplete=false;let guard=p.region==='NTSC'?130000:150000;while(guard-->0&&!p.frameComplete){this.bus.clock();this.recordInstruction()}return p.frameComplete}
 stateText(){const c=this.bus.cpu,p=this.bus.ppu;const flags=`${c.p&0x80?'N':'n'}${c.p&0x40?'V':'v'}-${c.p&0x10?'B':'b'}${c.p&8?'D':'d'}${c.p&4?'I':'i'}${c.p&2?'Z':'z'}${c.p&1?'C':'c'}`;const bp=`BP exec:${this.execBreakpoints.size} read:${this.readBreakpoints.size} write:${this.writeBreakpoints.size}`;return `PC $${HEX(c.pc,4)}  A $${HEX(c.a)}  X $${HEX(c.x)}  Y $${HEX(c.y)}\nSP $${HEX(c.sp)}  P $${HEX(c.p)} ${flags}\nCPU cycles ${c.totalCycles}  PPU ${p.scanline}:${p.cycle}\nIRQ ${c.irqPending?'pending':'-'}  NMI ${c.nmiPending?'pending':'-'}  DMA ${this.bus.dma.active?'OAM':'-'} / ${this.bus.dmcDma.active?'DMC':'-'}\n${bp}${this.breakReason?`\nBREAK: ${this.breakReason}`:''}`}
 disassemble(start=this.bus.cpu.pc,count=12){let pc=start&65535,out=[];for(let i=0;i<count;i++){const op=this.bus.peek(pc),info=OP[op]||[`OP${HEX(op)}`,'imp',1],len=info[2],b1=this.bus.peek((pc+1)&65535),b2=this.bus.peek((pc+2)&65535),bytes=[op,b1,b2].slice(0,len).map(x=>HEX(x)).join(' ');out.push(`${pc===this.bus.cpu.pc?'>':' '} $${HEX(pc,4)}  ${bytes.padEnd(8)} ${info[0]} ${operand(info[1],pc,b1,b2)}`.trimEnd());pc=(pc+len)&65535}return out.join('\n')}
 memoryDump(start=0,length=256){start&=65535;length=Math.max(16,Math.min(1024,length|0));const lines=[];for(let off=0;off<length;off+=16){const a=(start+off)&65535,bytes=[];let ascii='';for(let i=0;i<16&&off+i<length;i++){const v=this.bus.peek((a+i)&65535);bytes.push(HEX(v));ascii+=v>=32&&v<127?String.fromCharCode(v):'.'}lines.push(`${HEX(a,4)}  ${bytes.join(' ').padEnd(47)}  ${ascii}`)}return lines.join('\n')}
 breakpointText(){const fmt=s=>[...s].sort((a,b)=>a-b).map(a=>`$${HEX(a,4)}`).join(', ')||'—',ev=Object.entries(this.eventBreakpoints).filter(([,v])=>v).map(([k])=>k.toUpperCase()).join(', ')||'—';return `Exec: ${fmt(this.execBreakpoints)}\nRead: ${fmt(this.readBreakpoints)}\nWrite: ${fmt(this.writeBreakpoints)}\nEventos: ${ev}`}
}
