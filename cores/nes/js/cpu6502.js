const F={C:1,Z:2,I:4,D:8,B:16,U:32,V:64,N:128};
export class CPU6502{
 constructor(bus){this.bus=bus;this.a=0;this.x=0;this.y=0;this.sp=0xfd;this.pc=0;this.p=0x24;this.cycles=0;this.totalCycles=0;this.nmiPending=false;this.irqPending=false;this.stall=0;this.jammed=false;this.lastOpcode=0}
 read(a){return this.bus.read(a&0xffff)} write(a,v){this.bus.write(a&0xffff,v&255)}
 push(v){this.write(0x100+this.sp,v);this.sp=(this.sp-1)&255} pop(){this.sp=(this.sp+1)&255;return this.read(0x100+this.sp)}
 flag(f,v){if(v)this.p|=f;else this.p&=~f} get(f){return !!(this.p&f)} zn(v){v&=255;this.flag(F.Z,v===0);this.flag(F.N,!!(v&0x80));return v}
 reset(){this.a=this.x=this.y=0;this.sp=0xfd;this.p=0x24;this.pc=this.read(0xfffc)|(this.read(0xfffd)<<8);this.cycles=7;this.nmiPending=false;this.irqPending=false;this.stall=0;this.jammed=false;this.lastOpcode=0}
 interrupt(vector,brk=false){this.push((this.pc>>8)&255);this.push(this.pc&255);this.push((this.p&~F.B)|F.U|(brk?F.B:0));this.flag(F.I,1);this.pc=this.read(vector)|(this.read(vector+1)<<8)}
 nmi(){this.interrupt(0xfffa,false);this.cycles=7} irq(){if(!this.get(F.I)){this.interrupt(0xfffe,false);this.cycles=7}}
 fetch(){const v=this.read(this.pc);this.pc=(this.pc+1)&65535;return v} word(){const l=this.fetch(),h=this.fetch();return l|(h<<8)}
 zp(){return this.fetch()} zpx(){return (this.fetch()+this.x)&255} zpy(){return (this.fetch()+this.y)&255} abs(){return this.word()}
 absx(penalty=false){const b=this.word(),a=(b+this.x)&65535;if(penalty&&((b^a)&0x100)){this.read((b&0xff00)|(a&0xff));this.cycles++}return a} absy(penalty=false){const b=this.word(),a=(b+this.y)&65535;if(penalty&&((b^a)&0x100)){this.read((b&0xff00)|(a&0xff));this.cycles++}return a}
 indx(){const z=(this.fetch()+this.x)&255;return this.read(z)|(this.read((z+1)&255)<<8)} indy(penalty=false){const z=this.fetch(),b=this.read(z)|(this.read((z+1)&255)<<8),a=(b+this.y)&65535;if(penalty&&((b^a)&0x100)){this.read((b&0xff00)|(a&0xff));this.cycles++}return a}
 ind(){const p=this.word();return this.read(p)|(this.read((p&0xff00)|((p+1)&255))<<8)} rel(){const v=this.fetch();return v<128?v:v-256}
 branch(cond){const o=this.rel();if(cond){const old=this.pc,next=(this.pc+o)&65535;this.read(old);this.cycles++;if((old&0xff00)!==(next&0xff00)){this.read((old&0xff00)|(next&0xff));this.cycles++}this.pc=next}}
 adc(v){const c=this.get(F.C)?1:0,t=this.a+v+c;this.flag(F.C,t>255);this.flag(F.V,!!(~(this.a^v)&(this.a^t)&0x80));this.a=this.zn(t)}
 sbc(v){this.adc(v^255)} cmp(r,v){const t=(r-v)&0x1ff;this.flag(F.C,r>=v);this.zn(t)}
 asl(v){this.flag(F.C,!!(v&0x80));return this.zn(v<<1)} lsr(v){this.flag(F.C,!!(v&1));return this.zn(v>>>1)}
 rol(v){const c=this.get(F.C)?1:0;this.flag(F.C,!!(v&0x80));return this.zn((v<<1)|c)} ror(v){const c=this.get(F.C)?0x80:0;this.flag(F.C,!!(v&1));return this.zn((v>>>1)|c)}
 rmw(a,fn){const old=this.read(a);this.write(a,old);const v=fn.call(this,old)&255;this.write(a,v);return v}
 slo(a){const v=this.rmw(a,this.asl);this.a=this.zn(this.a|v)}
 rla(a){const v=this.rmw(a,this.rol);this.a=this.zn(this.a&v)}
 sre(a){const v=this.rmw(a,this.lsr);this.a=this.zn(this.a^v)}
 rra(a){const v=this.rmw(a,this.ror);this.adc(v)}
 dcp(a){const v=this.rmw(a,function(x){return this.zn(x-1)});this.cmp(this.a,v)}
 isc(a){const v=this.rmw(a,function(x){return this.zn(x+1)});this.sbc(v)}
 clock(){if(this.jammed){this.read(this.pc);this.totalCycles++;return}if(this.stall>0){this.stall--;this.totalCycles++;return}if(this.cycles>0){this.cycles--;this.totalCycles++;return}if(this.nmiPending){this.nmiPending=false;this.nmi();this.totalCycles++;return}if(this.irqPending&&!this.get(F.I)){this.irqPending=false;this.irq();this.totalCycles++;return}const op=this.fetch();this.lastOpcode=op;this.exec(op);this.totalCycles++}
 exec(op){let a,v,t;switch(op){
  // BRK / interrupts / returns
  case 0x00:this.pc=(this.pc+1)&65535;this.interrupt(0xfffe,true);this.cycles=6;break;
  case 0x40:this.p=(this.pop()&~F.B)|F.U;this.pc=this.pop()|(this.pop()<<8);this.cycles=5;break;
  case 0x60:this.pc=((this.pop()|(this.pop()<<8))+1)&65535;this.cycles=5;break;
  case 0x20:a=this.word();t=(this.pc-1)&65535;this.push(t>>8);this.push(t);this.pc=a;this.cycles=5;break;
  case 0x4c:this.pc=this.abs();this.cycles=2;break; case 0x6c:this.pc=this.ind();this.cycles=4;break;
  // LDA
  case 0xa9:this.a=this.zn(this.fetch());this.cycles=1;break;case 0xa5:this.a=this.zn(this.read(this.zp()));this.cycles=2;break;case 0xb5:this.a=this.zn(this.read(this.zpx()));this.cycles=3;break;case 0xad:this.a=this.zn(this.read(this.abs()));this.cycles=3;break;case 0xbd:this.a=this.zn(this.read(this.absx(true)));this.cycles=3;break;case 0xb9:this.a=this.zn(this.read(this.absy(true)));this.cycles=3;break;case 0xa1:this.a=this.zn(this.read(this.indx()));this.cycles=5;break;case 0xb1:this.a=this.zn(this.read(this.indy(true)));this.cycles=4;break;
  // LDX
  case 0xa2:this.x=this.zn(this.fetch());this.cycles=1;break;case 0xa6:this.x=this.zn(this.read(this.zp()));this.cycles=2;break;case 0xb6:this.x=this.zn(this.read(this.zpy()));this.cycles=3;break;case 0xae:this.x=this.zn(this.read(this.abs()));this.cycles=3;break;case 0xbe:this.x=this.zn(this.read(this.absy(true)));this.cycles=3;break;
  // LDY
  case 0xa0:this.y=this.zn(this.fetch());this.cycles=1;break;case 0xa4:this.y=this.zn(this.read(this.zp()));this.cycles=2;break;case 0xb4:this.y=this.zn(this.read(this.zpx()));this.cycles=3;break;case 0xac:this.y=this.zn(this.read(this.abs()));this.cycles=3;break;case 0xbc:this.y=this.zn(this.read(this.absx(true)));this.cycles=3;break;
  // STA
  case 0x85:this.write(this.zp(),this.a);this.cycles=2;break;case 0x95:this.write(this.zpx(),this.a);this.cycles=3;break;case 0x8d:this.write(this.abs(),this.a);this.cycles=3;break;case 0x9d:this.write(this.absx(),this.a);this.cycles=4;break;case 0x99:this.write(this.absy(),this.a);this.cycles=4;break;case 0x81:this.write(this.indx(),this.a);this.cycles=5;break;case 0x91:this.write(this.indy(),this.a);this.cycles=5;break;
  // STX/STY
  case 0x86:this.write(this.zp(),this.x);this.cycles=2;break;case 0x96:this.write(this.zpy(),this.x);this.cycles=3;break;case 0x8e:this.write(this.abs(),this.x);this.cycles=3;break;
  case 0x84:this.write(this.zp(),this.y);this.cycles=2;break;case 0x94:this.write(this.zpx(),this.y);this.cycles=3;break;case 0x8c:this.write(this.abs(),this.y);this.cycles=3;break;
  // transfers
  case 0xaa:this.x=this.zn(this.a);this.cycles=1;break;case 0x8a:this.a=this.zn(this.x);this.cycles=1;break;case 0xa8:this.y=this.zn(this.a);this.cycles=1;break;case 0x98:this.a=this.zn(this.y);this.cycles=1;break;case 0xba:this.x=this.zn(this.sp);this.cycles=1;break;case 0x9a:this.sp=this.x;this.cycles=1;break;
  // stack
  case 0x48:this.push(this.a);this.cycles=2;break;case 0x68:this.a=this.zn(this.pop());this.cycles=3;break;case 0x08:this.push(this.p|F.B|F.U);this.cycles=2;break;case 0x28:this.p=(this.pop()&~F.B)|F.U;this.cycles=3;break;
  // inc/dec registers
  case 0xe8:this.x=this.zn(this.x+1);this.cycles=1;break;case 0xca:this.x=this.zn(this.x-1);this.cycles=1;break;case 0xc8:this.y=this.zn(this.y+1);this.cycles=1;break;case 0x88:this.y=this.zn(this.y-1);this.cycles=1;break;
  // INC
  case 0xe6:a=this.zp();this.rmw(a,function(x){return this.zn(x+1)});this.cycles=4;break;case 0xf6:a=this.zpx();this.rmw(a,function(x){return this.zn(x+1)});this.cycles=5;break;case 0xee:a=this.abs();this.rmw(a,function(x){return this.zn(x+1)});this.cycles=5;break;case 0xfe:a=this.absx();this.rmw(a,function(x){return this.zn(x+1)});this.cycles=6;break;
  // DEC
  case 0xc6:a=this.zp();this.rmw(a,function(x){return this.zn(x-1)});this.cycles=4;break;case 0xd6:a=this.zpx();this.rmw(a,function(x){return this.zn(x-1)});this.cycles=5;break;case 0xce:a=this.abs();this.rmw(a,function(x){return this.zn(x-1)});this.cycles=5;break;case 0xde:a=this.absx();this.rmw(a,function(x){return this.zn(x-1)});this.cycles=6;break;
  // ADC
  case 0x69:this.adc(this.fetch());this.cycles=1;break;case 0x65:this.adc(this.read(this.zp()));this.cycles=2;break;case 0x75:this.adc(this.read(this.zpx()));this.cycles=3;break;case 0x6d:this.adc(this.read(this.abs()));this.cycles=3;break;case 0x7d:this.adc(this.read(this.absx(true)));this.cycles=3;break;case 0x79:this.adc(this.read(this.absy(true)));this.cycles=3;break;case 0x61:this.adc(this.read(this.indx()));this.cycles=5;break;case 0x71:this.adc(this.read(this.indy(true)));this.cycles=4;break;
  // SBC
  case 0xe9:case 0xeb:this.sbc(this.fetch());this.cycles=1;break;case 0xe5:this.sbc(this.read(this.zp()));this.cycles=2;break;case 0xf5:this.sbc(this.read(this.zpx()));this.cycles=3;break;case 0xed:this.sbc(this.read(this.abs()));this.cycles=3;break;case 0xfd:this.sbc(this.read(this.absx(true)));this.cycles=3;break;case 0xf9:this.sbc(this.read(this.absy(true)));this.cycles=3;break;case 0xe1:this.sbc(this.read(this.indx()));this.cycles=5;break;case 0xf1:this.sbc(this.read(this.indy(true)));this.cycles=4;break;
  // AND
  case 0x29:this.a=this.zn(this.a&this.fetch());this.cycles=1;break;case 0x25:this.a=this.zn(this.a&this.read(this.zp()));this.cycles=2;break;case 0x35:this.a=this.zn(this.a&this.read(this.zpx()));this.cycles=3;break;case 0x2d:this.a=this.zn(this.a&this.read(this.abs()));this.cycles=3;break;case 0x3d:this.a=this.zn(this.a&this.read(this.absx(true)));this.cycles=3;break;case 0x39:this.a=this.zn(this.a&this.read(this.absy(true)));this.cycles=3;break;case 0x21:this.a=this.zn(this.a&this.read(this.indx()));this.cycles=5;break;case 0x31:this.a=this.zn(this.a&this.read(this.indy(true)));this.cycles=4;break;
  // ORA
  case 0x09:this.a=this.zn(this.a|this.fetch());this.cycles=1;break;case 0x05:this.a=this.zn(this.a|this.read(this.zp()));this.cycles=2;break;case 0x15:this.a=this.zn(this.a|this.read(this.zpx()));this.cycles=3;break;case 0x0d:this.a=this.zn(this.a|this.read(this.abs()));this.cycles=3;break;case 0x1d:this.a=this.zn(this.a|this.read(this.absx(true)));this.cycles=3;break;case 0x19:this.a=this.zn(this.a|this.read(this.absy(true)));this.cycles=3;break;case 0x01:this.a=this.zn(this.a|this.read(this.indx()));this.cycles=5;break;case 0x11:this.a=this.zn(this.a|this.read(this.indy(true)));this.cycles=4;break;
  // EOR
  case 0x49:this.a=this.zn(this.a^this.fetch());this.cycles=1;break;case 0x45:this.a=this.zn(this.a^this.read(this.zp()));this.cycles=2;break;case 0x55:this.a=this.zn(this.a^this.read(this.zpx()));this.cycles=3;break;case 0x4d:this.a=this.zn(this.a^this.read(this.abs()));this.cycles=3;break;case 0x5d:this.a=this.zn(this.a^this.read(this.absx(true)));this.cycles=3;break;case 0x59:this.a=this.zn(this.a^this.read(this.absy(true)));this.cycles=3;break;case 0x41:this.a=this.zn(this.a^this.read(this.indx()));this.cycles=5;break;case 0x51:this.a=this.zn(this.a^this.read(this.indy(true)));this.cycles=4;break;
  // CMP/CPX/CPY
  case 0xc9:this.cmp(this.a,this.fetch());this.cycles=1;break;case 0xc5:this.cmp(this.a,this.read(this.zp()));this.cycles=2;break;case 0xd5:this.cmp(this.a,this.read(this.zpx()));this.cycles=3;break;case 0xcd:this.cmp(this.a,this.read(this.abs()));this.cycles=3;break;case 0xdd:this.cmp(this.a,this.read(this.absx(true)));this.cycles=3;break;case 0xd9:this.cmp(this.a,this.read(this.absy(true)));this.cycles=3;break;case 0xc1:this.cmp(this.a,this.read(this.indx()));this.cycles=5;break;case 0xd1:this.cmp(this.a,this.read(this.indy(true)));this.cycles=4;break;
  case 0xe0:this.cmp(this.x,this.fetch());this.cycles=1;break;case 0xe4:this.cmp(this.x,this.read(this.zp()));this.cycles=2;break;case 0xec:this.cmp(this.x,this.read(this.abs()));this.cycles=3;break;
  case 0xc0:this.cmp(this.y,this.fetch());this.cycles=1;break;case 0xc4:this.cmp(this.y,this.read(this.zp()));this.cycles=2;break;case 0xcc:this.cmp(this.y,this.read(this.abs()));this.cycles=3;break;
  // BIT
  case 0x24:v=this.read(this.zp());this.flag(F.Z,(this.a&v)===0);this.flag(F.V,!!(v&0x40));this.flag(F.N,!!(v&0x80));this.cycles=2;break;case 0x2c:v=this.read(this.abs());this.flag(F.Z,(this.a&v)===0);this.flag(F.V,!!(v&0x40));this.flag(F.N,!!(v&0x80));this.cycles=3;break;
  // shifts accumulator
  case 0x0a:this.a=this.asl(this.a);this.cycles=1;break;case 0x4a:this.a=this.lsr(this.a);this.cycles=1;break;case 0x2a:this.a=this.rol(this.a);this.cycles=1;break;case 0x6a:this.a=this.ror(this.a);this.cycles=1;break;
  // shifts memory
  case 0x06:a=this.zp();this.rmw(a,this.asl);this.cycles=4;break;case 0x16:a=this.zpx();this.rmw(a,this.asl);this.cycles=5;break;case 0x0e:a=this.abs();this.rmw(a,this.asl);this.cycles=5;break;case 0x1e:a=this.absx();this.rmw(a,this.asl);this.cycles=6;break;
  case 0x46:a=this.zp();this.rmw(a,this.lsr);this.cycles=4;break;case 0x56:a=this.zpx();this.rmw(a,this.lsr);this.cycles=5;break;case 0x4e:a=this.abs();this.rmw(a,this.lsr);this.cycles=5;break;case 0x5e:a=this.absx();this.rmw(a,this.lsr);this.cycles=6;break;
  case 0x26:a=this.zp();this.rmw(a,this.rol);this.cycles=4;break;case 0x36:a=this.zpx();this.rmw(a,this.rol);this.cycles=5;break;case 0x2e:a=this.abs();this.rmw(a,this.rol);this.cycles=5;break;case 0x3e:a=this.absx();this.rmw(a,this.rol);this.cycles=6;break;
  case 0x66:a=this.zp();this.rmw(a,this.ror);this.cycles=4;break;case 0x76:a=this.zpx();this.rmw(a,this.ror);this.cycles=5;break;case 0x6e:a=this.abs();this.rmw(a,this.ror);this.cycles=5;break;case 0x7e:a=this.absx();this.rmw(a,this.ror);this.cycles=6;break;
  // branches
  case 0x10:this.cycles=1;this.branch(!this.get(F.N));break;case 0x30:this.cycles=1;this.branch(this.get(F.N));break;case 0x50:this.cycles=1;this.branch(!this.get(F.V));break;case 0x70:this.cycles=1;this.branch(this.get(F.V));break;case 0x90:this.cycles=1;this.branch(!this.get(F.C));break;case 0xb0:this.cycles=1;this.branch(this.get(F.C));break;case 0xd0:this.cycles=1;this.branch(!this.get(F.Z));break;case 0xf0:this.cycles=1;this.branch(this.get(F.Z));break;
  // flags
  case 0x18:this.flag(F.C,0);this.cycles=1;break;case 0x38:this.flag(F.C,1);this.cycles=1;break;case 0x58:this.flag(F.I,0);this.cycles=1;break;case 0x78:this.flag(F.I,1);this.cycles=1;break;case 0xb8:this.flag(F.V,0);this.cycles=1;break;case 0xd8:this.flag(F.D,0);this.cycles=1;break;case 0xf8:this.flag(F.D,1);this.cycles=1;break;
  // common unofficial 6502 opcodes used by commercial NES software
  // LAX / SAX
  case 0xa7:v=this.read(this.zp());this.a=this.x=this.zn(v);this.cycles=2;break;case 0xb7:v=this.read(this.zpy());this.a=this.x=this.zn(v);this.cycles=3;break;case 0xaf:v=this.read(this.abs());this.a=this.x=this.zn(v);this.cycles=3;break;case 0xbf:v=this.read(this.absy(true));this.a=this.x=this.zn(v);this.cycles=3;break;case 0xa3:v=this.read(this.indx());this.a=this.x=this.zn(v);this.cycles=5;break;case 0xb3:v=this.read(this.indy(true));this.a=this.x=this.zn(v);this.cycles=4;break;case 0xab:v=this.fetch();this.a=this.x=this.zn(this.a&v);this.cycles=1;break;
  case 0x87:this.write(this.zp(),this.a&this.x);this.cycles=2;break;case 0x97:this.write(this.zpy(),this.a&this.x);this.cycles=3;break;case 0x8f:this.write(this.abs(),this.a&this.x);this.cycles=3;break;case 0x83:this.write(this.indx(),this.a&this.x);this.cycles=5;break;
  // SLO
  case 0x07:a=this.zp();this.slo(a);this.cycles=4;break;case 0x17:a=this.zpx();this.slo(a);this.cycles=5;break;case 0x0f:a=this.abs();this.slo(a);this.cycles=5;break;case 0x1f:a=this.absx();this.slo(a);this.cycles=6;break;case 0x1b:a=this.absy();this.slo(a);this.cycles=6;break;case 0x03:a=this.indx();this.slo(a);this.cycles=7;break;case 0x13:a=this.indy();this.slo(a);this.cycles=7;break;
  // RLA
  case 0x27:a=this.zp();this.rla(a);this.cycles=4;break;case 0x37:a=this.zpx();this.rla(a);this.cycles=5;break;case 0x2f:a=this.abs();this.rla(a);this.cycles=5;break;case 0x3f:a=this.absx();this.rla(a);this.cycles=6;break;case 0x3b:a=this.absy();this.rla(a);this.cycles=6;break;case 0x23:a=this.indx();this.rla(a);this.cycles=7;break;case 0x33:a=this.indy();this.rla(a);this.cycles=7;break;
  // SRE
  case 0x47:a=this.zp();this.sre(a);this.cycles=4;break;case 0x57:a=this.zpx();this.sre(a);this.cycles=5;break;case 0x4f:a=this.abs();this.sre(a);this.cycles=5;break;case 0x5f:a=this.absx();this.sre(a);this.cycles=6;break;case 0x5b:a=this.absy();this.sre(a);this.cycles=6;break;case 0x43:a=this.indx();this.sre(a);this.cycles=7;break;case 0x53:a=this.indy();this.sre(a);this.cycles=7;break;
  // RRA
  case 0x67:a=this.zp();this.rra(a);this.cycles=4;break;case 0x77:a=this.zpx();this.rra(a);this.cycles=5;break;case 0x6f:a=this.abs();this.rra(a);this.cycles=5;break;case 0x7f:a=this.absx();this.rra(a);this.cycles=6;break;case 0x7b:a=this.absy();this.rra(a);this.cycles=6;break;case 0x63:a=this.indx();this.rra(a);this.cycles=7;break;case 0x73:a=this.indy();this.rra(a);this.cycles=7;break;
  // DCP / ISC
  case 0xc7:a=this.zp();this.dcp(a);this.cycles=4;break;case 0xd7:a=this.zpx();this.dcp(a);this.cycles=5;break;case 0xcf:a=this.abs();this.dcp(a);this.cycles=5;break;case 0xdf:a=this.absx();this.dcp(a);this.cycles=6;break;case 0xdb:a=this.absy();this.dcp(a);this.cycles=6;break;case 0xc3:a=this.indx();this.dcp(a);this.cycles=7;break;case 0xd3:a=this.indy();this.dcp(a);this.cycles=7;break;
  case 0xe7:a=this.zp();this.isc(a);this.cycles=4;break;case 0xf7:a=this.zpx();this.isc(a);this.cycles=5;break;case 0xef:a=this.abs();this.isc(a);this.cycles=5;break;case 0xff:a=this.absx();this.isc(a);this.cycles=6;break;case 0xfb:a=this.absy();this.isc(a);this.cycles=6;break;case 0xe3:a=this.indx();this.isc(a);this.cycles=7;break;case 0xf3:a=this.indy();this.isc(a);this.cycles=7;break;
  // immediate unofficial ALU ops
  case 0x0b:case 0x2b:this.a=this.zn(this.a&this.fetch());this.flag(F.C,!!(this.a&0x80));this.cycles=1;break;
  case 0x4b:this.a=this.lsr(this.a&this.fetch());this.cycles=1;break;
  case 0x6b:this.a=this.ror(this.a&this.fetch());this.flag(F.C,!!(this.a&0x40));this.flag(F.V,!!(((this.a>>6)^(this.a>>5))&1));this.cycles=1;break;
  case 0xcb:v=this.fetch();t=(this.a&this.x)-v;this.flag(F.C,t>=0);this.x=this.zn(t);this.cycles=1;break;
  // KIL/JAM: trava a CPU 2A03 até reset, como no hardware real
  case 0x02:case 0x12:case 0x22:case 0x32:case 0x42:case 0x52:case 0x62:case 0x72:case 0x92:case 0xb2:case 0xd2:case 0xf2:this.jammed=true;this.cycles=1;break;
  // Outros ilegais encontrados em software/testes. Alguns são eletricamente instáveis no 6502 real;
  // aqui usamos o comportamento determinístico mais comum em emuladores.
  case 0xbb:a=this.absy(true);this.a=this.x=this.sp=this.zn(this.read(a)&this.sp);this.cycles=3;break; // LAS
  case 0x8b:this.a=this.zn(this.x&this.fetch());this.cycles=1;break; // XAA (aprox.)
  case 0x9b:{const b=this.word(),addr=(b+this.y)&65535;this.sp=this.a&this.x;this.write(addr,this.sp&(((addr>>8)+1)&255));this.cycles=4;break} // TAS
  case 0x9c:{const b=this.word(),addr=(b+this.x)&65535;this.write(addr,this.y&(((addr>>8)+1)&255));this.cycles=4;break} // SHY
  case 0x9e:{const b=this.word(),addr=(b+this.y)&65535;this.write(addr,this.x&(((addr>>8)+1)&255));this.cycles=4;break} // SHX
  case 0x93:{a=this.indy();this.write(a,this.a&this.x&(((a>>8)+1)&255));this.cycles=5;break} // AHX (ind),Y
  case 0x9f:{a=this.absy();this.write(a,this.a&this.x&(((a>>8)+1)&255));this.cycles=4;break} // AHX abs,Y
  // official NOP + common unofficial NOPs (safe length/cycles)
  case 0xea:this.cycles=1;break;
  case 0x1a:case 0x3a:case 0x5a:case 0x7a:case 0xda:case 0xfa:this.cycles=1;break;
  case 0x80:case 0x82:case 0x89:case 0xc2:case 0xe2:this.fetch();this.cycles=1;break;
  case 0x04:case 0x44:case 0x64:this.fetch();this.cycles=2;break;
  case 0x14:case 0x34:case 0x54:case 0x74:case 0xd4:case 0xf4:this.fetch();this.cycles=3;break;
  case 0x0c:this.word();this.cycles=3;break;
  case 0x1c:case 0x3c:case 0x5c:case 0x7c:case 0xdc:case 0xfc:this.absx(true);this.cycles=3;break;
  default: // desconhecidos: NOP de 1 byte para não derrubar o emulador
   this.cycles=1;break;
 }}
 snapshot(){return {a:this.a,x:this.x,y:this.y,sp:this.sp,pc:this.pc,p:this.p,cycles:this.cycles,totalCycles:this.totalCycles,nmiPending:this.nmiPending,irqPending:this.irqPending,stall:this.stall,jammed:this.jammed,lastOpcode:this.lastOpcode}}
 restore(s){Object.assign(this,s)}
}
