function nes2RomSize(lsb, msNibble, unit){
 if(msNibble!==0x0f)return (((msNibble<<8)|lsb)*unit)>>>0;
 const exp=lsb>>2,mul=(lsb&3)*2+1;
 return Math.pow(2,exp)*mul;
}
function nes2RamSize(shift){return shift?64*Math.pow(2,shift):0}
export class Cartridge{
 constructor(buffer){
  const d=new Uint8Array(buffer);
  if(d.length<16||d[0]!==0x4e||d[1]!==0x45||d[2]!==0x53||d[3]!==0x1a)throw new Error('Arquivo não é uma ROM iNES válida');
  this.flags6=d[6];this.flags7=d[7];this.nes2=(this.flags7&0x0c)===0x08;this.submapper=0;
  const mapperLow=(this.flags6>>4)|(this.flags7&0xf0);
  this.mapper=this.nes2?(mapperLow|((d[8]&0x0f)<<8)):mapperLow;
  this.submapper=this.nes2?(d[8]>>4):0;
  this.fourScreen=!!(this.flags6&8);this.hasTrainer=!!(this.flags6&4);
  this.mirroring=(this.flags6&1)?'vertical':'horizontal';
  let prgSize,chrSize,prgRamSize=8192,prgNvRamSize=0,chrRamSize=0,chrNvRamSize=0;
  if(this.nes2){
   prgSize=nes2RomSize(d[4],d[9]&0x0f,16384);chrSize=nes2RomSize(d[5],d[9]>>4,8192);
   prgRamSize=nes2RamSize(d[10]&0x0f);prgNvRamSize=nes2RamSize(d[10]>>4);chrRamSize=nes2RamSize(d[11]&0x0f);chrNvRamSize=nes2RamSize(d[11]>>4);
   const r=d[12]&3;this.region=r===0?'NTSC':r===1?'PAL':r===2?'Multi-region':'Dendy';
  }else{
   prgSize=d[4]*16384;chrSize=d[5]*8192;const n=d[8]||1;prgRamSize=n*8192;this.region=(d[9]&1)?'PAL':'NTSC';
  }
  this.prgBanks=Math.max(1,Math.ceil(prgSize/16384));this.chrBanks=Math.ceil(chrSize/8192);
  this.prgRamSize=prgRamSize;this.prgNvRamSize=prgNvRamSize;this.chrRamSize=chrRamSize;this.chrNvRamSize=chrNvRamSize;
  this.battery=!!(this.flags6&2)||prgNvRamSize>0||chrNvRamSize>0;
  this.prgRam=new Uint8Array(Math.max(8192,prgRamSize+prgNvRamSize));
  this.trainer=this.hasTrainer?d.slice(16,528):null;
  // iNES trainers are mapped at $7000-$71FF before execution.
  if(this.trainer)this.prgRam.set(this.trainer,0x1000);
  let off=16+(this.hasTrainer?512:0);
  if(off+prgSize>d.length)throw new Error('ROM truncada: PRG incompleto');
  this.prg=d.slice(off,off+prgSize);off+=prgSize;
  if(chrSize){if(off+chrSize>d.length)throw new Error('ROM truncada: CHR incompleto');this.chr=d.slice(off,off+chrSize);this.chrRam=false}
  else{const mapperChrMin=this.mapper===30?32768:8192;this.chr=new Uint8Array(Math.max(mapperChrMin,chrRamSize+chrNvRamSize));this.chrRam=true}
  this.mapperImpl=createMapper(this);
 }
 getMirroring(){return this.fourScreen?'four':(this.mapperImpl.getMirroring?.()||this.mirroring)}
 cpuRead(a){if(a>=0x6000&&a<0x8000&&!this.mapperImpl.handlesPrgRam)return this.mapperImpl.prgRamEnabled===false?0:this.prgRam[a%this.prgRam.length];return this.mapperImpl.cpuRead(a)}
 cpuWrite(a,v,cycle=0){if(a>=0x6000&&a<0x8000&&!this.mapperImpl.handlesPrgRam){if(this.mapperImpl.prgRamEnabled!==false&&!this.mapperImpl.prgRamWriteProtect)this.prgRam[a%this.prgRam.length]=v;return}this.mapperImpl.cpuWrite(a,v,cycle)}
 ppuRead(a,dot=0){this.mapperImpl.ppuAddress?.(a&0x1fff,dot);return this.mapperImpl.ppuRead(a)} ppuPeek(a){return this.mapperImpl.ppuRead(a&0x1fff)} ppuWrite(a,v,dot=0){this.mapperImpl.ppuAddress?.(a&0x1fff,dot);this.mapperImpl.ppuWrite(a,v)}
 nametableRead(a,vram){return this.mapperImpl.nametableRead?.(a,vram)}
 nametableWrite(a,v,vram){return this.mapperImpl.nametableWrite?.(a,v,vram)===true}
 clockScanline(){return this.mapperImpl.clockScanline?.()||false}
 onFrameStart(){this.mapperImpl.onFrameStart?.()}
 onVBlank(){this.mapperImpl.onVBlank?.()}
 pollIrq(){return this.mapperImpl.pollIrq?.()||false}
 clockCpu(){return this.mapperImpl.clockCpu?.()||false}
 expansionAudioSample(){return this.mapperImpl.expansionAudioSample?.()||0}
 persistent(){return{prgRam:Array.from(this.prgRam),mapper:this.mapperImpl.persistent?.()||null}}
 loadPersistent(s){if(Array.isArray(s)){this.prgRam.set(s.slice(0,this.prgRam.length));return}if(s?.prgRam)this.prgRam.set(s.prgRam.slice?.(0,this.prgRam.length)||s.prgRam);this.mapperImpl.loadPersistent?.(s?.mapper)}
 captureFast(t={}){t.prgRam=t.prgRam instanceof Uint8Array&&t.prgRam.length===this.prgRam.length?t.prgRam:new Uint8Array(this.prgRam.length);t.prgRam.set(this.prgRam);t.mapperState=this.mapperImpl.snapshot?.()||null;return t}
 snapshot(){return {prgRam:Array.from(this.prgRam),mapperState:this.mapperImpl.snapshot?.()||null}}
 restore(s){if(s?.prgRam)this.prgRam.set(s.prgRam.slice?.(0,this.prgRam.length)||s.prgRam);if(s?.mapperState)this.mapperImpl.restore?.(s.mapperState)}
}
class Base{constructor(c){this.c=c;this.prgRamEnabled=true;this.prgRamWriteProtect=false}ppuRead(a){return this.c.chr[a&0x1fff]}ppuWrite(a,v){if(this.c.chrRam)this.c.chr[a&0x1fff]=v}}
class I2CEeprom{
 constructor(size=256){this.mem=new Uint8Array(size);this.reset()}
 reset(){this.scl=1;this.sdaIn=1;this.sdaOut=1;this.started=false;this.mode='idle';this.shift=0;this.bits=0;this.addr=0;this.rw=0;this.ackPhase=0;this.readByte=0;this.readBit=0}
 line(){return this.sdaOut?1:0}
 start(){this.started=true;this.mode='address';this.shift=0;this.bits=0;this.ackPhase=0;this.sdaOut=1}
 stop(){this.started=false;this.mode='idle';this.bits=0;this.ackPhase=0;this.sdaOut=1}
 loadRead(){this.readByte=this.mem[this.addr%this.mem.length];this.readBit=0;this.mode='read';this.sdaOut=(this.readByte>>7)&1}
 receivedByte(v){if(this.mode==='address'){if((v&0xf0)!==0xa0){this.mode='ignore';this.sdaOut=1;return}this.rw=v&1;this.ackPhase=1;this.sdaOut=0;if(this.rw)this.mode='addressReadAck';else this.mode='addressWriteAck'}else if(this.mode==='memaddr'){this.addr=v%this.mem.length;this.ackPhase=1;this.sdaOut=0;this.mode='memaddrAck'}else if(this.mode==='write'){this.mem[this.addr%this.mem.length]=v;this.addr=(this.addr+1)%this.mem.length;this.ackPhase=1;this.sdaOut=0;this.mode='writeAck'}}
 update(scl,sda){scl=!!scl?1:0;sda=!!sda?1:0;const oldScl=this.scl,oldSda=this.sdaIn;if(oldSda===1&&sda===0&&scl===1)this.start();else if(oldSda===0&&sda===1&&scl===1)this.stop();
  if(this.started){
   if(oldScl===0&&scl===1){
    if(this.mode==='address'||this.mode==='memaddr'||this.mode==='write'){this.shift=((this.shift<<1)|sda)&255;if(++this.bits===8){const v=this.shift;this.shift=0;this.bits=0;this.receivedByte(v)}}
    else if(this.mode==='read'){this.readBit++;if(this.readBit>=8){this.mode='readHostAck';this.sdaOut=1}}
    else if(this.mode==='readHostAck'){if(sda===0){this.addr=(this.addr+1)%this.mem.length;this.loadRead()}else{this.mode='idle';this.sdaOut=1}}
   }
   if(oldScl===1&&scl===0){
    if(this.ackPhase){this.ackPhase=0;if(this.mode==='addressWriteAck'){this.mode='memaddr';this.sdaOut=1}else if(this.mode==='addressReadAck'){this.loadRead()}else if(this.mode==='memaddrAck'||this.mode==='writeAck'){this.mode='write';this.sdaOut=1}}
    else if(this.mode==='read'&&this.readBit<8)this.sdaOut=(this.readByte>>(7-this.readBit))&1;
   }
  }
  this.scl=scl;this.sdaIn=sda
 }
 snapshot(){return{mem:Array.from(this.mem),scl:this.scl,sdaIn:this.sdaIn,sdaOut:this.sdaOut,started:this.started,mode:this.mode,shift:this.shift,bits:this.bits,addr:this.addr,rw:this.rw,ackPhase:this.ackPhase,readByte:this.readByte,readBit:this.readBit}}
 restore(s){if(!s)return;if(s.mem)this.mem.set(s.mem.slice?.(0,this.mem.length)||s.mem);for(const k of ['scl','sdaIn','sdaOut','started','mode','shift','bits','addr','rw','ackPhase','readByte','readBit'])if(k in s)this[k]=s[k]}
}

class Mapper0 extends Base{cpuRead(a){if(a<0x8000)return 0;return this.c.prg[(a-0x8000)%this.c.prg.length]}cpuWrite(){}}
class Mapper2 extends Base{constructor(c){super(c);this.bank=0}cpuRead(a){if(a<0x8000)return 0;if(a<0xc000)return this.c.prg[(this.bank*0x4000)+(a-0x8000)];return this.c.prg[((this.c.prgBanks-1)*0x4000)+(a-0xc000)]}cpuWrite(a,v){if(a>=0x8000)this.bank=v%Math.max(1,this.c.prgBanks-1)}snapshot(){return{bank:this.bank}}restore(s){this.bank=s?.bank||0}}
class Mapper3 extends Base{constructor(c){super(c);this.chrBank=0}cpuRead(a){if(a<0x8000)return 0;return this.c.prg[(a-0x8000)%this.c.prg.length]}cpuWrite(a,v){if(a>=0x8000)this.chrBank=v%Math.max(1,this.c.chrBanks)}ppuRead(a){return this.c.chr[this.chrBank*0x2000+(a&0x1fff)]}ppuWrite(a,v){if(this.c.chrRam)this.c.chr[a&0x1fff]=v}snapshot(){return{chrBank:this.chrBank}}restore(s){this.chrBank=s?.chrBank||0}}
class Mapper1 extends Base{
 constructor(c){super(c);this.shift=0x10;this.control=0x0c;this.chr0=0;this.chr1=0;this.prgBank=0;this.lastWriteCycle=-2}
 getMirroring(){switch(this.control&3){case 0:return'single0';case 1:return'single1';case 2:return'vertical';default:return'horizontal'}}
 cpuRead(a){if(a<0x8000)return 0;const mode=(this.control>>2)&3;if(mode<=1){const bank=(this.prgBank&0x0e)>>1;return this.c.prg[(bank*0x8000+(a-0x8000))%this.c.prg.length]}if(mode===2){if(a<0xc000)return this.c.prg[a-0x8000];return this.c.prg[((this.prgBank%this.c.prgBanks)*0x4000)+(a-0xc000)]}if(a<0xc000)return this.c.prg[((this.prgBank%this.c.prgBanks)*0x4000)+(a-0x8000)];return this.c.prg[((this.c.prgBanks-1)*0x4000)+(a-0xc000)]}
 cpuWrite(a,v,cycle=0){if(a<0x8000)return;if(cycle===this.lastWriteCycle+1){this.lastWriteCycle=cycle;return}this.lastWriteCycle=cycle;if(v&0x80){this.shift=0x10;this.control|=0x0c;return}const full=this.shift&1;this.shift=(this.shift>>1)|((v&1)<<4);if(full){const data=this.shift&0x1f;if(a<0xa000)this.control=data;else if(a<0xc000)this.chr0=data;else if(a<0xe000)this.chr1=data;else{this.prgBank=data&0x0f;this.prgRamEnabled=!(data&0x10)}this.shift=0x10}}
 ppuRead(a){if(this.c.chrRam)return this.c.chr[a&0x1fff];if(this.control&0x10){const bank=a<0x1000?this.chr0:this.chr1;return this.c.chr[((bank%(this.c.chrBanks*2))*0x1000)+(a&0x0fff)]}const bank=(this.chr0&0x1e)>>1;return this.c.chr[((bank%Math.max(1,this.c.chrBanks))*0x2000)+(a&0x1fff)]}
 ppuWrite(a,v){if(this.c.chrRam)this.c.chr[a&0x1fff]=v}snapshot(){return{shift:this.shift,control:this.control,chr0:this.chr0,chr1:this.chr1,prgBank:this.prgBank,lastWriteCycle:this.lastWriteCycle,prgRamEnabled:this.prgRamEnabled}}restore(s){Object.assign(this,s||{});this.prgRamEnabled=s?.prgRamEnabled!==false}
}
class Mapper4 extends Base{
 constructor(c){super(c);this.bankSelect=0;this.regs=new Uint8Array(8);this.prgMode=0;this.chrMode=0;this.mirror=c.mirroring;this.irqLatch=0;this.irqCounter=0;this.irqReload=false;this.irqEnabled=false;this.irqPending=false;this.lastA12=false;this.a12LowSince=0;this.a12LowValid=false}
 getMirroring(){return this.c.fourScreen?'four':this.mirror}
 prgBankCount(){return Math.max(1,this.c.prg.length/0x2000)} chrBankCount(){return Math.max(1,this.c.chr.length/0x400)}
 prgReadBank(bank,off){bank=((bank%this.prgBankCount())+this.prgBankCount())%this.prgBankCount();return this.c.prg[bank*0x2000+off]}
 cpuRead(a){if(a<0x8000)return 0;const last=this.prgBankCount()-1,last2=this.prgBankCount()-2,r6=this.regs[6]&0x3f,r7=this.regs[7]&0x3f;let bank;if(a<0xa000)bank=this.prgMode?last2:r6;else if(a<0xc000)bank=r7;else if(a<0xe000)bank=this.prgMode?r6:last2;else bank=last;return this.prgReadBank(bank,a&0x1fff)}
 cpuWrite(a,v){if(a<0x8000)return;const even=(a&1)===0;if(a<0xa000){if(even){this.bankSelect=v;this.prgMode=(v>>6)&1;this.chrMode=(v>>7)&1}else this.regs[this.bankSelect&7]=v}else if(a<0xc000){if(even){if(!this.c.fourScreen)this.mirror=(v&1)?'horizontal':'vertical'}else{this.prgRamEnabled=!!(v&0x80);this.prgRamWriteProtect=!!(v&0x40)}}else if(a<0xe000){if(even)this.irqLatch=v;else this.irqReload=true}else{if(even){this.irqEnabled=false;this.irqPending=false}else this.irqEnabled=true}}
 chrMap(a){const r=this.regs;let slot=a>>10,bank;if(!this.chrMode){if(slot<2)bank=(r[0]&0xfe)+slot;else if(slot<4)bank=(r[1]&0xfe)+(slot-2);else bank=r[slot-2]}else{if(slot<4)bank=r[slot+2];else if(slot<6)bank=(r[0]&0xfe)+(slot-4);else bank=(r[1]&0xfe)+(slot-6)}return (bank%this.chrBankCount())*0x400+(a&0x3ff)}
 ppuRead(a){return this.c.chr[this.chrMap(a&0x1fff)]} ppuWrite(a,v){if(this.c.chrRam)this.c.chr[this.chrMap(a&0x1fff)]=v}
 clockIrq(){if(this.irqCounter===0||this.irqReload){this.irqCounter=this.irqLatch;this.irqReload=false}else this.irqCounter=(this.irqCounter-1)&255;if(this.irqCounter===0&&this.irqEnabled)this.irqPending=true}
 ppuAddress(a,dot=0){const high=!!(a&0x1000);if(!high){if(this.lastA12||!this.a12LowValid){this.a12LowSince=dot;this.a12LowValid=true}}else if(!this.lastA12){const lowDots=this.a12LowValid?Math.max(0,dot-this.a12LowSince):0;if(lowDots>=8)this.clockIrq();this.a12LowValid=false}this.lastA12=high}
 pollIrq(){if(!this.irqPending)return false;this.irqPending=false;return true}
 clockScanline(){return this.pollIrq()}
 snapshot(){return{bankSelect:this.bankSelect,regs:Array.from(this.regs),prgMode:this.prgMode,chrMode:this.chrMode,mirror:this.mirror,irqLatch:this.irqLatch,irqCounter:this.irqCounter,irqReload:this.irqReload,irqEnabled:this.irqEnabled,irqPending:this.irqPending,lastA12:!!this.lastA12,a12LowSince:this.a12LowSince||0,a12LowValid:!!this.a12LowValid,prgRamEnabled:this.prgRamEnabled,prgRamWriteProtect:this.prgRamWriteProtect}}
 restore(s){if(!s)return;this.bankSelect=s.bankSelect||0;this.regs.set(s.regs||[]);this.prgMode=s.prgMode||0;this.chrMode=s.chrMode||0;this.mirror=s.mirror||this.c.mirroring;this.irqLatch=s.irqLatch||0;this.irqCounter=s.irqCounter||0;this.irqReload=!!s.irqReload;this.irqEnabled=!!s.irqEnabled;this.irqPending=!!s.irqPending;this.lastA12=!!s.lastA12;this.a12LowSince=s.a12LowSince||0;this.a12LowValid=!!s.a12LowValid;this.prgRamEnabled=s.prgRamEnabled!==false;this.prgRamWriteProtect=!!s.prgRamWriteProtect}
}

class Mapper7 extends Base{
 constructor(c){super(c);this.bank=0;this.mirror='single0'}
 getMirroring(){return this.mirror}
 cpuRead(a){if(a<0x8000)return 0;const banks=Math.max(1,Math.floor(this.c.prg.length/0x8000));const b=this.bank%banks;return this.c.prg[b*0x8000+(a-0x8000)]}
 cpuWrite(a,v){if(a>=0x8000){this.bank=v&7;this.mirror=(v&0x10)?'single1':'single0'}}
 snapshot(){return{bank:this.bank,mirror:this.mirror}}restore(s){if(!s)return;this.bank=s.bank||0;this.mirror=s.mirror||'single0'}
}
class Mapper9 extends Base{
 constructor(c){super(c);this.prgBank=0;this.chrFD0=0;this.chrFE0=0;this.chrFD1=0;this.chrFE1=0;this.latch0=0xfe;this.latch1=0xfe;this.mirror=c.mirroring}
 getMirroring(){return this.mirror}
 cpuRead(a){if(a<0x8000)return 0;const count=Math.max(1,Math.floor(this.c.prg.length/0x2000));let bank;if(a<0xa000)bank=this.prgBank;else if(a<0xc000)bank=count-3;else if(a<0xe000)bank=count-2;else bank=count-1;bank=((bank%count)+count)%count;return this.c.prg[bank*0x2000+(a&0x1fff)]}
 cpuWrite(a,v){if(a<0xa000)return;if(a<0xb000)this.prgBank=v&0x0f;else if(a<0xc000)this.chrFD0=v&0x1f;else if(a<0xd000)this.chrFE0=v&0x1f;else if(a<0xe000)this.chrFD1=v&0x1f;else if(a<0xf000)this.chrFE1=v&0x1f;else this.mirror=(v&1)?'horizontal':'vertical'}
 ppuAddress(a){if(a===0x0fd8)this.latch0=0xfd;else if(a===0x0fe8)this.latch0=0xfe;else if(a>=0x1fd8&&a<=0x1fdf)this.latch1=0xfd;else if(a>=0x1fe8&&a<=0x1fef)this.latch1=0xfe}
 chrMap(a){const bank=a<0x1000?(this.latch0===0xfd?this.chrFD0:this.chrFE0):(this.latch1===0xfd?this.chrFD1:this.chrFE1);const count=Math.max(1,Math.floor(this.c.chr.length/0x1000));return (bank%count)*0x1000+(a&0x0fff)}
 ppuRead(a){return this.c.chr[this.chrMap(a&0x1fff)]} ppuWrite(a,v){if(this.c.chrRam)this.c.chr[this.chrMap(a&0x1fff)]=v}
 snapshot(){return{prgBank:this.prgBank,chrFD0:this.chrFD0,chrFE0:this.chrFE0,chrFD1:this.chrFD1,chrFE1:this.chrFE1,latch0:this.latch0,latch1:this.latch1,mirror:this.mirror}}restore(s){if(s)Object.assign(this,s)}
}
class Mapper10 extends Base{
 constructor(c){super(c);this.prgBank=0;this.chrFD0=0;this.chrFE0=0;this.chrFD1=0;this.chrFE1=0;this.latch0=0xfe;this.latch1=0xfe;this.mirror=c.mirroring}
 getMirroring(){return this.mirror}
 cpuRead(a){if(a<0x6000)return 0;if(a<0x8000)return this.c.prgRam[a%this.c.prgRam.length];const count=Math.max(1,Math.floor(this.c.prg.length/0x4000));const bank=a<0xc000?(this.prgBank%count):(count-1);return this.c.prg[bank*0x4000+(a&0x3fff)]}
 cpuWrite(a,v){if(a<0xa000)return;if(a<0xb000)this.prgBank=v&0x0f;else if(a<0xc000)this.chrFD0=v&0x1f;else if(a<0xd000)this.chrFE0=v&0x1f;else if(a<0xe000)this.chrFD1=v&0x1f;else if(a<0xf000)this.chrFE1=v&0x1f;else this.mirror=(v&1)?'horizontal':'vertical'}
 ppuAddress(a){if(a===0x0fd8)this.latch0=0xfd;else if(a===0x0fe8)this.latch0=0xfe;else if(a>=0x1fd8&&a<=0x1fdf)this.latch1=0xfd;else if(a>=0x1fe8&&a<=0x1fef)this.latch1=0xfe}
 chrMap(a){const bank=a<0x1000?(this.latch0===0xfd?this.chrFD0:this.chrFE0):(this.latch1===0xfd?this.chrFD1:this.chrFE1);const count=Math.max(1,Math.floor(this.c.chr.length/0x1000));return (bank%count)*0x1000+(a&0x0fff)}
 ppuRead(a){return this.c.chr[this.chrMap(a&0x1fff)]} ppuWrite(a,v){if(this.c.chrRam)this.c.chr[this.chrMap(a&0x1fff)]=v}
 snapshot(){return{prgBank:this.prgBank,chrFD0:this.chrFD0,chrFE0:this.chrFE0,chrFD1:this.chrFD1,chrFE1:this.chrFE1,latch0:this.latch0,latch1:this.latch1,mirror:this.mirror}}restore(s){if(s)Object.assign(this,s)}
}
class Mapper11 extends Base{
 constructor(c){super(c);this.prgBank=0;this.chrBank=0}
 cpuRead(a){if(a<0x8000)return 0;const count=Math.max(1,Math.floor(this.c.prg.length/0x8000));const b=this.prgBank%count;return this.c.prg[b*0x8000+(a-0x8000)]}
 cpuWrite(a,v){if(a>=0x8000){this.prgBank=v&3;this.chrBank=(v>>4)&15}}
 ppuRead(a){const count=Math.max(1,Math.floor(this.c.chr.length/0x2000));const b=this.chrBank%count;return this.c.chr[b*0x2000+(a&0x1fff)]}
 ppuWrite(a,v){if(this.c.chrRam)this.c.chr[a&0x1fff]=v}
 snapshot(){return{prgBank:this.prgBank,chrBank:this.chrBank}}restore(s){if(!s)return;this.prgBank=s.prgBank||0;this.chrBank=s.chrBank||0}
}

class Mapper34 extends Base{
 constructor(c){super(c);this.prgBank=0}
 cpuRead(a){if(a<0x8000)return 0;const count=Math.max(1,Math.floor(this.c.prg.length/0x8000));const b=this.prgBank%count;return this.c.prg[b*0x8000+(a-0x8000)]}
 cpuWrite(a,v){if(a>=0x8000)this.prgBank=v&0xff}
 snapshot(){return{prgBank:this.prgBank}}restore(s){this.prgBank=s?.prgBank||0}
}
class Mapper71 extends Base{
 constructor(c){super(c);this.prgBank=0;this.mirror=c.mirroring}
 getMirroring(){return this.mirror}
 cpuRead(a){if(a<0x8000)return 0;const count=Math.max(1,Math.floor(this.c.prg.length/0x4000));const bank=a<0xc000?(this.prgBank%count):(count-1);return this.c.prg[bank*0x4000+(a&0x3fff)]}
 cpuWrite(a,v){if(a<0x8000)return;if((a&0xf000)===0x9000)this.mirror=(v&0x10)?'single1':'single0';if(a>=0xc000)this.prgBank=v&0x0f}
 snapshot(){return{prgBank:this.prgBank,mirror:this.mirror}}restore(s){if(!s)return;this.prgBank=s.prgBank||0;this.mirror=s.mirror||this.c.mirroring}
}
class Mapper66 extends Base{
 constructor(c){super(c);this.prgBank=0;this.chrBank=0}
 cpuRead(a){if(a<0x8000)return 0;const count=Math.max(1,Math.floor(this.c.prg.length/0x8000));const b=this.prgBank%count;return this.c.prg[b*0x8000+(a-0x8000)]}
 cpuWrite(a,v){if(a>=0x8000){this.prgBank=(v>>4)&3;this.chrBank=v&3}}
 ppuRead(a){const count=Math.max(1,Math.floor(this.c.chr.length/0x2000));const b=this.chrBank%count;return this.c.chr[b*0x2000+(a&0x1fff)]}
 ppuWrite(a,v){if(this.c.chrRam)this.c.chr[a&0x1fff]=v}
 snapshot(){return{prgBank:this.prgBank,chrBank:this.chrBank}}restore(s){if(!s)return;this.prgBank=s.prgBank||0;this.chrBank=s.chrBank||0}
}

class Mapper78 extends Base{
 constructor(c){super(c);this.prgBank=0;this.chrBank=0;this.mirror=c.mirroring}
 getMirroring(){return this.mirror}
 cpuRead(a){if(a<0x8000)return 0;const count=Math.max(1,Math.floor(this.c.prg.length/0x4000));const bank=a<0xc000?(this.prgBank%count):(count-1);return this.c.prg[bank*0x4000+(a&0x3fff)]}
 cpuWrite(a,v){if(a<0x8000)return;this.prgBank=v&7;this.chrBank=(v>>4)&15;this.mirror=(v&8)?'single1':'single0'}
 ppuRead(a){const count=Math.max(1,Math.floor(this.c.chr.length/0x2000));return this.c.chr[(this.chrBank%count)*0x2000+(a&0x1fff)]}
 ppuWrite(a,v){if(this.c.chrRam)this.c.chr[a&0x1fff]=v}
 snapshot(){return{prgBank:this.prgBank,chrBank:this.chrBank,mirror:this.mirror}}restore(s){if(s)Object.assign(this,s)}
}
class Mapper94 extends Base{
 constructor(c){super(c);this.bank=0}
 cpuRead(a){if(a<0x8000)return 0;const count=Math.max(1,Math.floor(this.c.prg.length/0x4000));if(a<0xc000)return this.c.prg[(this.bank%count)*0x4000+(a&0x3fff)];return this.c.prg[(count-1)*0x4000+(a&0x3fff)]}
 cpuWrite(a,v){if(a>=0x8000)this.bank=(v>>2)&7}
 snapshot(){return{bank:this.bank}}restore(s){this.bank=s?.bank||0}
}
class Mapper180 extends Base{
 constructor(c){super(c);this.bank=0}
 cpuRead(a){if(a<0x8000)return 0;const count=Math.max(1,Math.floor(this.c.prg.length/0x4000));if(a<0xc000)return this.c.prg[a&0x3fff];return this.c.prg[(this.bank%count)*0x4000+(a&0x3fff)]}
 cpuWrite(a,v){if(a>=0x8000)this.bank=v&7}
 snapshot(){return{bank:this.bank}}restore(s){this.bank=s?.bank||0}
}

class Mapper16 extends Base{
 constructor(c){super(c);this.handlesPrgRam=true;this.chrRegs=new Uint8Array(8);this.prgBank=0;this.mirror=c.mirroring;this.irqEnabled=false;this.irqCounter=0;this.irqLatch=0;this.irqPending=false;this.eeprom=(c.prgNvRamSize>=256||c.submapper===5)?new I2CEeprom(256):null;this.eepromRead=false}
 getMirroring(){return this.mirror}
 acceptsRegister(a){if(this.c.submapper===4)return a>=0x6000&&a<0x8000;if(this.c.submapper===5)return a>=0x8000;return a>=0x6000}
 cpuRead(a){if(a>=0x6000&&a<0x8000&&this.eeprom)return (this.eepromRead?0x10:0)|((this.eeprom.line()&1)<<4);if(a<0x8000)return this.c.prgRam[a%this.c.prgRam.length]||0;const count=Math.max(1,Math.floor(this.c.prg.length/0x4000));const b=a<0xc000?(this.prgBank%count):(count-1);return this.c.prg[b*0x4000+(a&0x3fff)]}
 cpuWrite(a,v){if(a>=0x6000&&a<0x8000&&!this.acceptsRegister(a)){this.c.prgRam[a%this.c.prgRam.length]=v;return}if(!this.acceptsRegister(a))return;const r=a&0x0f;if(r<=7)this.chrRegs[r]=v;else if(r===8)this.prgBank=v&0x0f;else if(r===9)this.mirror=['vertical','horizontal','single0','single1'][v&3];else if(r===0x0a){this.irqEnabled=!!(v&1);this.irqPending=false;if(this.c.submapper===5)this.irqCounter=this.irqLatch}else if(r===0x0b){this.irqLatch=(this.irqLatch&0xff00)|v;if(this.c.submapper!==5)this.irqCounter=(this.irqCounter&0xff00)|v}else if(r===0x0c){this.irqLatch=(this.irqLatch&0x00ff)|(v<<8);if(this.c.submapper!==5)this.irqCounter=(this.irqCounter&0x00ff)|(v<<8)}else if(r===0x0d&&this.eeprom){this.eepromRead=!!(v&0x80);this.eeprom.update((v>>5)&1,(v>>6)&1)}}
 ppuRead(a){a&=0x1fff;const slot=a>>10,count=Math.max(1,Math.floor(this.c.chr.length/0x400));return this.c.chr[(this.chrRegs[slot]%count)*0x400+(a&0x3ff)]}
 ppuWrite(a,v){if(!this.c.chrRam)return;a&=0x1fff;const slot=a>>10,count=Math.max(1,Math.floor(this.c.chr.length/0x400));this.c.chr[(this.chrRegs[slot]%count)*0x400+(a&0x3ff)]=v}
 clockCpu(){if(this.irqEnabled){if(this.irqCounter===0){this.irqPending=true;if(this.c.submapper!==5)this.irqEnabled=false}else this.irqCounter=(this.irqCounter-1)&0xffff}if(this.irqPending){this.irqPending=false;return true}return false}
 persistent(){return this.eeprom?{eeprom:Array.from(this.eeprom.mem)}:null}
 loadPersistent(s){if(this.eeprom&&s?.eeprom)this.eeprom.mem.set(s.eeprom.slice?.(0,this.eeprom.mem.length)||s.eeprom)}
 snapshot(){return{chrRegs:Array.from(this.chrRegs),prgBank:this.prgBank,mirror:this.mirror,irqEnabled:this.irqEnabled,irqCounter:this.irqCounter,irqLatch:this.irqLatch,irqPending:this.irqPending,eepromRead:this.eepromRead,eeprom:this.eeprom?.snapshot?.()||null}}
 restore(s){if(!s)return;this.chrRegs.set(s.chrRegs||[]);this.prgBank=s.prgBank||0;this.mirror=s.mirror||this.c.mirroring;this.irqEnabled=!!s.irqEnabled;this.irqCounter=s.irqCounter||0;this.irqLatch=s.irqLatch||0;this.irqPending=!!s.irqPending;this.eepromRead=!!s.eepromRead;this.eeprom?.restore?.(s.eeprom)}
}
class Mapper153 extends Base{
 constructor(c){super(c);this.handlesPrgRam=true;this.outer=0;this.prgBank=0;this.mirror=c.mirroring;this.ramEnabled=true;this.irqEnabled=false;this.irqCounter=0;this.irqLatch=0;this.irqPending=false}
 getMirroring(){return this.mirror}
 cpuRead(a){if(a>=0x6000&&a<0x8000)return this.ramEnabled?this.c.prgRam[a%this.c.prgRam.length]:0;if(a<0x8000)return 0;const count=Math.max(1,Math.floor(this.c.prg.length/0x4000)),base=(this.outer&1)*16;let bank=a<0xc000?base+(this.prgBank&15):Math.min(base+15,count-1);bank%=count;return this.c.prg[bank*0x4000+(a&0x3fff)]}
 cpuWrite(a,v){if(a>=0x6000&&a<0x8000){if(this.ramEnabled)this.c.prgRam[a%this.c.prgRam.length]=v;return}if(a<0x8000)return;const r=a&0x0f;if(r<=3)this.outer=v&1;else if(r===8)this.prgBank=v&0x0f;else if(r===9)this.mirror=['vertical','horizontal','single0','single1'][v&3];else if(r===0x0a){this.irqEnabled=!!(v&1);this.irqPending=false;this.irqCounter=this.irqLatch}else if(r===0x0b)this.irqLatch=(this.irqLatch&0xff00)|v;else if(r===0x0c)this.irqLatch=(this.irqLatch&0x00ff)|(v<<8);else if(r===0x0d)this.ramEnabled=!!(v&0x20)}
 clockCpu(){if(this.irqEnabled){if(this.irqCounter===0){this.irqPending=true}else this.irqCounter=(this.irqCounter-1)&0xffff}if(this.irqPending){this.irqPending=false;return true}return false}
 snapshot(){return{outer:this.outer,prgBank:this.prgBank,mirror:this.mirror,ramEnabled:this.ramEnabled,irqEnabled:this.irqEnabled,irqCounter:this.irqCounter,irqLatch:this.irqLatch,irqPending:this.irqPending}}
 restore(s){if(s)Object.assign(this,s)}
}
class Mapper159 extends Mapper16{
 constructor(c){super(c);this.eeprom=new I2CEeprom(128)}
 acceptsRegister(a){return a>=0x8000}
}
class Mapper69 extends Base{
 constructor(c){super(c);this.handlesPrgRam=true;this.cmd=0;this.chrRegs=new Uint8Array(8);this.prgRegs=new Uint8Array(4);this.mirror=c.mirroring;this.irqCounter=0;this.irqCounterEnable=false;this.irqEnable=false;this.irqPending=false;this.audioSelect=0;this.audioRegs=new Uint8Array(16);this.toneCounter=new Uint32Array(3);this.toneState=new Uint8Array([1,1,1]);this.noiseCounter=1;this.noiseLfsr=0x1ffff;this.noiseState=1;this.envCounter=1;this.envStep=15;this.envAttack=false;this.envAlt=false;this.envHold=false;this.envContinue=false;this.envHolding=false;this.audioDivider=0}
 getMirroring(){return this.mirror}
 prgCount(){return Math.max(1,Math.floor(this.c.prg.length/0x2000))}
 readBank(bank,off){bank=((bank%this.prgCount())+this.prgCount())%this.prgCount();return this.c.prg[bank*0x2000+off]}
 cpuRead(a){if(a<0x6000)return 0;if(a<0x8000){const r=this.prgRegs[0];if(r&0x40){if(!(r&0x80))return 0;return this.c.prgRam[a%this.c.prgRam.length]}return this.readBank(r&0x3f,a&0x1fff)}if(a<0xa000)return this.readBank(this.prgRegs[1]&0x3f,a&0x1fff);if(a<0xc000)return this.readBank(this.prgRegs[2]&0x3f,a&0x1fff);if(a<0xe000)return this.readBank(this.prgRegs[3]&0x3f,a&0x1fff);return this.readBank(this.prgCount()-1,a&0x1fff)}
 cpuWrite(a,v){if(a>=0x6000&&a<0x8000){const r=this.prgRegs[0];if((r&0xc0)===0xc0)this.c.prgRam[a%this.c.prgRam.length]=v;return}if(a>=0x8000&&a<0xa000){this.cmd=v&0x0f;return}if(a>=0xa000&&a<0xc000){const c=this.cmd;if(c<8)this.chrRegs[c]=v;else if(c<12)this.prgRegs[c-8]=v;else if(c===12)this.mirror=['vertical','horizontal','single0','single1'][v&3];else if(c===13){this.irqCounterEnable=!!(v&0x80);this.irqEnable=!!(v&1);if(!this.irqEnable)this.irqPending=false}else if(c===14)this.irqCounter=(this.irqCounter&0xff00)|v;else if(c===15)this.irqCounter=(this.irqCounter&0x00ff)|(v<<8);return}if(a>=0xc000&&a<0xe000){this.audioSelect=v&0x0f;return}if(a>=0xe000){this.audioRegs[this.audioSelect]=v;if(this.audioSelect===13)this.resetEnvelope();return}}
 ppuRead(a){a&=0x1fff;const slot=a>>10,count=Math.max(1,Math.floor(this.c.chr.length/0x400));return this.c.chr[(this.chrRegs[slot]%count)*0x400+(a&0x3ff)]}
 ppuWrite(a,v){if(!this.c.chrRam)return;a&=0x1fff;const slot=a>>10,count=Math.max(1,Math.floor(this.c.chr.length/0x400));this.c.chr[(this.chrRegs[slot]%count)*0x400+(a&0x3ff)]=v}
 resetEnvelope(){const v=this.audioRegs[13];this.envContinue=!!(v&8);this.envAttack=!!(v&4);this.envAlt=!!(v&2);this.envHold=!!(v&1);this.envStep=this.envAttack?0:15;this.envHolding=false;this.envCounter=Math.max(1,((this.audioRegs[12]<<8)|this.audioRegs[11])||1)}
 clockAudio(){if(++this.audioDivider<16)return;this.audioDivider=0;for(let i=0;i<3;i++){let p=((this.audioRegs[i*2+1]&15)<<8)|this.audioRegs[i*2];if(!p)p=1;if(this.toneCounter[i]===0){this.toneCounter[i]=p;this.toneState[i]^=1}else this.toneCounter[i]--}let np=this.audioRegs[6]&31;if(!np)np=1;if(this.noiseCounter===0){this.noiseCounter=np;const fb=(this.noiseLfsr^(this.noiseLfsr>>3))&1;this.noiseLfsr=(this.noiseLfsr>>1)|(fb<<16);this.noiseState=this.noiseLfsr&1}else this.noiseCounter--;if(!this.envHolding){if(this.envCounter===0){this.envCounter=Math.max(1,((this.audioRegs[12]<<8)|this.audioRegs[11])||1);if(this.envAttack)this.envStep++;else this.envStep--;if(this.envStep<0||this.envStep>15){if(!this.envContinue){this.envHolding=true;this.envStep=0}else if(this.envHold){this.envHolding=true;this.envStep=this.envAttack?15:0}else{if(this.envAlt)this.envAttack=!this.envAttack;this.envStep=this.envAttack?0:15}}}else this.envCounter--}}
 expansionAudioSample(){const mixer=this.audioRegs[7];let sum=0;for(let i=0;i<3;i++){const toneDisabled=!!(mixer&(1<<i)),noiseDisabled=!!(mixer&(1<<(i+3)));const gate=(toneDisabled||this.toneState[i])&&(noiseDisabled||!this.noiseState);if(!gate)continue;const vr=this.audioRegs[8+i],vol=(vr&0x10)?Math.max(0,Math.min(15,this.envStep)):(vr&15);sum+=vol/15}return (sum/3)*0.22}
 clockCpu(){this.clockAudio();if(this.irqCounterEnable){if(this.irqCounter===0){this.irqCounter=0xffff;if(this.irqEnable)this.irqPending=true}else this.irqCounter=(this.irqCounter-1)&0xffff}if(this.irqPending){this.irqPending=false;return true}return false}
 snapshot(){return{cmd:this.cmd,chrRegs:Array.from(this.chrRegs),prgRegs:Array.from(this.prgRegs),mirror:this.mirror,irqCounter:this.irqCounter,irqCounterEnable:this.irqCounterEnable,irqEnable:this.irqEnable,irqPending:this.irqPending,audioSelect:this.audioSelect,audioRegs:Array.from(this.audioRegs),toneCounter:Array.from(this.toneCounter),toneState:Array.from(this.toneState),noiseCounter:this.noiseCounter,noiseLfsr:this.noiseLfsr,noiseState:this.noiseState,envCounter:this.envCounter,envStep:this.envStep,envAttack:this.envAttack,envAlt:this.envAlt,envHold:this.envHold,envContinue:this.envContinue,envHolding:this.envHolding,audioDivider:this.audioDivider}}
 restore(s){if(!s)return;this.cmd=s.cmd||0;this.chrRegs.set(s.chrRegs||[]);this.prgRegs.set(s.prgRegs||[]);this.mirror=s.mirror||this.c.mirroring;this.irqCounter=s.irqCounter||0;this.irqCounterEnable=!!s.irqCounterEnable;this.irqEnable=!!s.irqEnable;this.irqPending=!!s.irqPending;this.audioSelect=s.audioSelect||0;this.audioRegs.set(s.audioRegs||[]);this.toneCounter.set(s.toneCounter||[]);this.toneState.set(s.toneState||[]);this.noiseCounter=s.noiseCounter||1;this.noiseLfsr=s.noiseLfsr||0x1ffff;this.noiseState=s.noiseState??1;this.envCounter=s.envCounter||1;this.envStep=s.envStep??15;this.envAttack=!!s.envAttack;this.envAlt=!!s.envAlt;this.envHold=!!s.envHold;this.envContinue=!!s.envContinue;this.envHolding=!!s.envHolding;this.audioDivider=s.audioDivider||0}
}

class Mapper18 extends Base{
 constructor(c){super(c);this.prgRegs=new Uint8Array(3);this.chrRegs=new Uint8Array(8);this.mirror=c.mirroring;this.irqReload=0;this.irqCounter=0;this.irqControl=0;this.irqEnabled=false;this.irqPending=false}
 getMirroring(){return this.mirror}
 prgCount(){return Math.max(1,Math.floor(this.c.prg.length/0x2000))}
 chrCount(){return Math.max(1,Math.floor(this.c.chr.length/0x400))}
 setNibble(arr,index,high,v){const old=arr[index];arr[index]=high?((old&0x0f)|((v&15)<<4)):((old&0xf0)|(v&15))}
 cpuRead(a){if(a<0x8000)return 0;const slot=(a-0x8000)>>13,bank=slot<3?this.prgRegs[slot]:(this.prgCount()-1);return this.c.prg[((bank%this.prgCount())*0x2000)+(a&0x1fff)]}
 cpuWrite(a,v){if(a<0x8000)return;const r=a&0xf003;
  if(r>=0x8000&&r<=0x8003){const i=(r>>1)&1;this.setNibble(this.prgRegs,i,!!(r&1),v);return}
  if(r>=0x9000&&r<=0x9001){this.setNibble(this.prgRegs,2,!!(r&1),v);return}
  if(r>=0xa000&&r<=0xd003){const group=((r>>12)-0xa)*2,index=group+((r>>1)&1);if(index<8)this.setNibble(this.chrRegs,index,!!(r&1),v);return}
  if(r>=0xe000&&r<=0xe003){const sh=(r&3)*4;this.irqReload=(this.irqReload&~(0xf<<sh))|((v&15)<<sh);return}
  if(r===0xf000){this.irqCounter=this.irqReload;this.irqPending=false;return}
  if(r===0xf001){this.irqControl=v&0x0f;this.irqEnabled=!!(v&1);this.irqPending=false;return}
  if(r===0xf002){this.mirror=['horizontal','vertical','single0','single1'][v&3];return}
 }
 ppuRead(a){a&=0x1fff;const slot=a>>10,bank=this.chrRegs[slot]%this.chrCount();return this.c.chr[bank*0x400+(a&0x3ff)]}
 ppuWrite(a,v){if(this.c.chrRam){a&=0x1fff;const slot=a>>10,bank=this.chrRegs[slot]%this.chrCount();this.c.chr[bank*0x400+(a&0x3ff)]=v}}
 clockCpu(){if(this.irqEnabled){let mask=0xffff;const mode=(this.irqControl>>1)&7;if(mode&4)mask=0x000f;else if(mode&2)mask=0x00ff;else if(mode&1)mask=0x0fff;const low=this.irqCounter&mask,high=this.irqCounter&~mask;const next=(low-1)&mask;if(low===0){this.irqPending=true;this.irqCounter=high|mask}else this.irqCounter=high|next}if(this.irqPending){this.irqPending=false;return true}return false}
 snapshot(){return{prgRegs:Array.from(this.prgRegs),chrRegs:Array.from(this.chrRegs),mirror:this.mirror,irqReload:this.irqReload,irqCounter:this.irqCounter,irqControl:this.irqControl,irqEnabled:this.irqEnabled,irqPending:this.irqPending}}
 restore(s){if(!s)return;this.prgRegs.set(s.prgRegs||[]);this.chrRegs.set(s.chrRegs||[]);this.mirror=s.mirror||this.c.mirroring;this.irqReload=s.irqReload||0;this.irqCounter=s.irqCounter||0;this.irqControl=s.irqControl||0;this.irqEnabled=!!s.irqEnabled;this.irqPending=!!s.irqPending}
}

class MapperVRC6 extends Base{
 constructor(c){super(c);this.variant=c.mapper;this.prg16=0;this.prg8=0;this.chrRegs=new Uint8Array(8);this.mirror=c.mirroring;this.ramEnabled=true;this.irqLatch=0;this.irqCounter=0;this.irqEnable=false;this.irqEnableAfterAck=false;this.irqCycleMode=false;this.irqPending=false;this.irqPrescaler=341;this.audioRegs=new Uint8Array(9);this.pulsePhase=new Uint8Array(2);this.pulseCounter=new Uint16Array(2);this.sawCounter=0;this.sawStep=0;this.sawAccum=0}
 mapAddr(a){let r=a&0xf003;if(this.variant===26){const lo=r&3;r=(r&~3)|((lo&1)<<1)|((lo&2)>>1)}return r}
 getMirroring(){return this.mirror}
 prg8Count(){return Math.max(1,Math.floor(this.c.prg.length/0x2000))}
 chrCount(){return Math.max(1,Math.floor(this.c.chr.length/0x400))}
 cpuRead(a){if(a>=0x6000&&a<0x8000)return this.ramEnabled?this.c.prgRam[a%this.c.prgRam.length]:0;if(a<0x8000)return 0;if(a<0xc000){const count=Math.max(1,Math.floor(this.c.prg.length/0x4000)),b=this.prg16%count;return this.c.prg[b*0x4000+(a-0x8000)]}if(a<0xe000){const b=this.prg8%this.prg8Count();return this.c.prg[b*0x2000+(a&0x1fff)]}return this.c.prg[(this.prg8Count()-1)*0x2000+(a&0x1fff)]}
 cpuWrite(a,v){if(a>=0x6000&&a<0x8000){if(this.ramEnabled)this.c.prgRam[a%this.c.prgRam.length]=v;return}if(a<0x8000)return;const r=this.mapAddr(a);
  if((r&0xf000)===0x8000){this.prg16=v&0x0f;return}
  if(r>=0x9000&&r<=0x9002){this.audioRegs[r-0x9000]=v;return}
  if(r>=0xa000&&r<=0xa002){this.audioRegs[3+(r-0xa000)]=v;return}
  if(r>=0xb000&&r<=0xb002){this.audioRegs[6+(r-0xb000)]=v;return}
  if(r===0xb003){this.ramEnabled=!!(v&0x80);this.mirror=['vertical','horizontal','single0','single1'][v&3];return}
  if((r&0xf000)===0xc000){this.prg8=v&0x1f;return}
  if(r>=0xd000&&r<=0xd003){this.chrRegs[r-0xd000]=v;return}
  if(r>=0xe000&&r<=0xe003){this.chrRegs[4+(r-0xe000)]=v;return}
  if(r===0xf000){this.irqLatch=v;return}
  if(r===0xf001){this.irqEnableAfterAck=!!(v&1);this.irqEnable=!!(v&2);this.irqCycleMode=!!(v&4);this.irqPending=false;if(this.irqEnable){this.irqCounter=this.irqLatch;this.irqPrescaler=341}return}
  if(r===0xf002){this.irqPending=false;this.irqEnable=this.irqEnableAfterAck;return}
 }
 ppuRead(a){a&=0x1fff;const slot=a>>10,bank=this.chrRegs[slot]%this.chrCount();return this.c.chr[bank*0x400+(a&0x3ff)]}
 ppuWrite(a,v){if(this.c.chrRam){a&=0x1fff;const slot=a>>10,bank=this.chrRegs[slot]%this.chrCount();this.c.chr[bank*0x400+(a&0x3ff)]=v}}
 tickIrq(){if(++this.irqCounter>0xff){this.irqCounter=this.irqLatch;this.irqPending=true}}
 clockAudio(){for(let ch=0;ch<2;ch++){const base=ch*3,ctrl=this.audioRegs[base],period=this.audioRegs[base+1]|((this.audioRegs[base+2]&15)<<8);if(!(this.audioRegs[base+2]&0x80))continue;if(this.pulseCounter[ch]===0){this.pulseCounter[ch]=period;this.pulsePhase[ch]=(this.pulsePhase[ch]+1)&15}else this.pulseCounter[ch]--}const period=this.audioRegs[7]|((this.audioRegs[8]&15)<<8);if(this.audioRegs[8]&0x80){if(this.sawCounter===0){this.sawCounter=period;this.sawStep=(this.sawStep+1)%14;if((this.sawStep&1)===0)this.sawAccum=(this.sawAccum+(this.audioRegs[6]&0x3f))&0xff;if(this.sawStep===0)this.sawAccum=0}else this.sawCounter--}}
 expansionAudioSample(){let sum=0;for(let ch=0;ch<2;ch++){const base=ch*3,ctrl=this.audioRegs[base],enabled=!!(this.audioRegs[base+2]&0x80);if(!enabled)continue;const vol=ctrl&15,duty=((ctrl>>4)&7)+1,mode=!!(ctrl&0x80);const high=mode||this.pulsePhase[ch]<duty;if(high)sum+=vol/15}if(this.audioRegs[8]&0x80)sum+=(this.sawAccum>>3)/31;return (sum/3)*0.22}
 clockCpu(){this.clockAudio();if(this.irqEnable){if(this.irqCycleMode)this.tickIrq();else{this.irqPrescaler-=3;if(this.irqPrescaler<=0){this.irqPrescaler+=341;this.tickIrq()}}}if(this.irqPending){this.irqPending=false;return true}return false}
 snapshot(){return{variant:this.variant,prg16:this.prg16,prg8:this.prg8,chrRegs:Array.from(this.chrRegs),mirror:this.mirror,ramEnabled:this.ramEnabled,irqLatch:this.irqLatch,irqCounter:this.irqCounter,irqEnable:this.irqEnable,irqEnableAfterAck:this.irqEnableAfterAck,irqCycleMode:this.irqCycleMode,irqPending:this.irqPending,irqPrescaler:this.irqPrescaler,audioRegs:Array.from(this.audioRegs),pulsePhase:Array.from(this.pulsePhase),pulseCounter:Array.from(this.pulseCounter),sawCounter:this.sawCounter,sawStep:this.sawStep,sawAccum:this.sawAccum}}
 restore(s){if(!s)return;this.prg16=s.prg16||0;this.prg8=s.prg8||0;this.chrRegs.set(s.chrRegs||[]);this.mirror=s.mirror||this.c.mirroring;this.ramEnabled=s.ramEnabled!==false;this.irqLatch=s.irqLatch||0;this.irqCounter=s.irqCounter||0;this.irqEnable=!!s.irqEnable;this.irqEnableAfterAck=!!s.irqEnableAfterAck;this.irqCycleMode=!!s.irqCycleMode;this.irqPending=!!s.irqPending;this.irqPrescaler=s.irqPrescaler||341;this.audioRegs.set(s.audioRegs||[]);this.pulsePhase.set(s.pulsePhase||[]);this.pulseCounter.set(s.pulseCounter||[]);this.sawCounter=s.sawCounter||0;this.sawStep=s.sawStep||0;this.sawAccum=s.sawAccum||0}
}



class MapperVRC24 extends Base{
 constructor(c){super(c);this.variant=c.mapper;this.prgRegs=new Uint8Array(2);this.chrRegs=new Uint16Array(8);this.mirror=c.mirroring;this.prgMode=0;this.irqLatch=0;this.irqCounter=0;this.irqEnable=false;this.irqEnableAfterAck=false;this.irqCycleMode=false;this.irqPending=false;this.irqPrescaler=341}
 getMirroring(){return this.mirror}
 prgCount(){return Math.max(1,Math.floor(this.c.prg.length/0x2000))}
 chrCount(){return Math.max(1,Math.floor(this.c.chr.length/0x400))}
 normalize(a){let low=a&3;if(this.variant===22)low=((low&1)<<1)|((low&2)>>1);else if(this.variant===23)low=((low&1)<<1)|(low&2);else if(this.variant===25)low=(low&1)|((low&2)>>1);return (a&0xf000)|low}
 cpuRead(a){if(a<0x8000)return 0;const last=this.prgCount()-1,last2=Math.max(0,last-1);let bank;if(a<0xa000)bank=this.prgMode?last2:this.prgRegs[0];else if(a<0xc000)bank=this.prgRegs[1];else if(a<0xe000)bank=this.prgMode?this.prgRegs[0]:last2;else bank=last;return this.c.prg[((bank%this.prgCount())*0x2000)+(a&0x1fff)]}
 cpuWrite(a,v){if(a<0x8000)return;
  if((a&0xf000)===0xf000){const sub=a&3;if(sub===0)this.irqLatch=(this.irqLatch&0xf0)|(v&15);else if(sub===1)this.irqLatch=(this.irqLatch&0x0f)|((v&15)<<4);else if(sub===2){this.irqEnableAfterAck=!!(v&1);this.irqEnable=!!(v&2);this.irqCycleMode=!!(v&4);this.irqPending=false;if(this.irqEnable){this.irqCounter=this.irqLatch;this.irqPrescaler=341}}else{this.irqPending=false;this.irqEnable=this.irqEnableAfterAck}return}
  const r=this.normalize(a);
  if((r&0xf000)===0x8000){this.prgRegs[0]=v;return}
  if((r&0xf000)===0xa000){this.prgRegs[1]=v;return}
  if((r&0xf000)===0x9000){if((r&3)===0)this.mirror=['vertical','horizontal','single0','single1'][v&3];else if((r&3)===2)this.prgMode=(v>>1)&1;return}
  if(r>=0xb000&&r<=0xe003){const group=((r>>12)-0xb)*2,slot=group+((r>>1)&1);if(slot<8){const high=r&1,old=this.chrRegs[slot];this.chrRegs[slot]=high?((old&0x0f)|((v&0x1f)<<4)):((old&0x1f0)|(v&0x0f));}return}
 }
 ppuRead(a){a&=0x1fff;const slot=a>>10,bank=this.chrRegs[slot]%this.chrCount();return this.c.chr[bank*0x400+(a&0x3ff)]}
 ppuWrite(a,v){if(!this.c.chrRam)return;a&=0x1fff;const slot=a>>10,bank=this.chrRegs[slot]%this.chrCount();this.c.chr[bank*0x400+(a&0x3ff)]=v}
 tickIrq(){if(this.irqCounter===0xff){this.irqCounter=this.irqLatch;this.irqPending=true}else this.irqCounter=(this.irqCounter+1)&255}
 clockCpu(){if(this.variant!==22&&this.irqEnable){if(this.irqCycleMode)this.tickIrq();else{this.irqPrescaler-=3;if(this.irqPrescaler<=0){this.irqPrescaler+=341;this.tickIrq()}}}if(this.irqPending){this.irqPending=false;return true}return false}
 snapshot(){return{variant:this.variant,prgRegs:Array.from(this.prgRegs),chrRegs:Array.from(this.chrRegs),mirror:this.mirror,prgMode:this.prgMode,irqLatch:this.irqLatch,irqCounter:this.irqCounter,irqEnable:this.irqEnable,irqEnableAfterAck:this.irqEnableAfterAck,irqCycleMode:this.irqCycleMode,irqPending:this.irqPending,irqPrescaler:this.irqPrescaler}}
 restore(s){if(!s)return;this.prgRegs.set(s.prgRegs||[]);this.chrRegs.set(s.chrRegs||[]);this.mirror=s.mirror||this.c.mirroring;this.prgMode=s.prgMode||0;this.irqLatch=s.irqLatch||0;this.irqCounter=s.irqCounter||0;this.irqEnable=!!s.irqEnable;this.irqEnableAfterAck=!!s.irqEnableAfterAck;this.irqCycleMode=!!s.irqCycleMode;this.irqPending=!!s.irqPending;this.irqPrescaler=s.irqPrescaler||341}
}

class Mapper5 extends Base{
 constructor(c){super(c);this.handlesPrgRam=true;this.prgMode=3;this.chrMode=3;this.prgRegs=new Uint8Array([0,0,0,0x7f,0xff]);this.chrRegs=new Uint8Array(12);this.ntMap=0;this.fillTile=0;this.fillAttr=0;this.exRam=new Uint8Array(1024);this.ramProtect1=0;this.ramProtect2=0;this.irqScanline=0;this.irqEnabled=false;this.irqPending=false;this.inFrame=false;this.scanlineCounter=0;this.mulA=0;this.mulB=0;this.audioRegs=new Uint8Array(0x16);this.audioPulse=[{timer:0,phase:0},{timer:0,phase:0}];this.pcm=0}
 getMirroring(){return this.c.mirroring}
 ramWritable(){return this.ramProtect1===2&&this.ramProtect2===1}
 prg8Count(){return Math.max(1,Math.floor(this.c.prg.length/0x2000))}
 chr1Count(){return Math.max(1,Math.floor(this.c.chr.length/0x400))}
 readRom8(bank,off){bank=((bank%this.prg8Count())+this.prg8Count())%this.prg8Count();return this.c.prg[bank*0x2000+off]}
 readPrgReg(reg,off){const rom=!!(reg&0x80),bank=reg&0x7f;if(!rom)return this.c.prgRam[((bank*0x2000)+off)%this.c.prgRam.length];return this.readRom8(bank,off)}
 prgRegForAddress(a){
  if(this.prgMode===0)return {reg:this.prgRegs[4],base:(a-0x8000)&0x7fff,align:4};
  if(this.prgMode===1)return a<0xc000?{reg:this.prgRegs[2],base:a-0x8000,align:2}:{reg:this.prgRegs[4],base:a-0xc000,align:2};
  if(this.prgMode===2){if(a<0xc000)return {reg:this.prgRegs[2],base:a-0x8000,align:2};if(a<0xe000)return {reg:this.prgRegs[3],base:a-0xc000,align:1};return {reg:this.prgRegs[4],base:a-0xe000,align:1}}
  return {reg:this.prgRegs[((a-0x8000)>>13)+1],base:a&0x1fff,align:1};
 }
 readMapped(a){const m=this.prgRegForAddress(a),reg=m.reg;if(m.align===1)return this.readPrgReg(reg,m.base);const rom=!!(reg&0x80),mask=m.align===4?~3:~1,bank=(reg&0x7f)&mask;if(!rom)return this.c.prgRam[((bank*0x2000)+m.base)%this.c.prgRam.length];return this.c.prg[((bank*0x2000)+m.base)%this.c.prg.length]}
 cpuRead(a){if(a>=0x5000&&a<=0x5015){if(a===0x5015){let v=0;if(this.audioRegs[0x15]&1)v|=1;if(this.audioRegs[0x15]&2)v|=2;return v}return 0}if(a>=0x5c00&&a<0x6000)return this.exRam[a-0x5c00];if(a===0x5204){const v=(this.irqPending?0x80:0)|(this.inFrame?0x40:0);this.irqPending=false;return v}if(a===0x5205)return (this.mulA*this.mulB)&255;if(a===0x5206)return ((this.mulA*this.mulB)>>8)&255;if(a>=0x6000&&a<0x8000){const reg=this.prgRegs[0];return (reg&0x80)?this.readRom8(reg&0x7f,a&0x1fff):this.c.prgRam[((reg&0x7f)*0x2000+(a&0x1fff))%this.c.prgRam.length]}if(a<0x8000)return 0;return this.readMapped(a)}
 cpuWrite(a,v){if(a>=0x5000&&a<=0x5015){this.audioRegs[a-0x5000]=v;if(a===0x5011)this.pcm=v&0x7f;return}if(a>=0x5c00&&a<0x6000){this.exRam[a-0x5c00]=v;return}if(a===0x5100){this.prgMode=v&3;return}if(a===0x5101){this.chrMode=v&3;return}if(a===0x5102){this.ramProtect1=v&3;return}if(a===0x5103){this.ramProtect2=v&3;return}if(a===0x5105){this.ntMap=v;return}if(a===0x5106){this.fillTile=v;return}if(a===0x5107){this.fillAttr=v&3;return}if(a>=0x5113&&a<=0x5117){this.prgRegs[a-0x5113]=v;return}if(a>=0x5120&&a<=0x512b){this.chrRegs[a-0x5120]=v;return}if(a===0x5203){this.irqScanline=v;return}if(a===0x5204){this.irqEnabled=!!(v&0x80);if(!this.irqEnabled)this.irqPending=false;return}if(a===0x5205){this.mulA=v;return}if(a===0x5206){this.mulB=v;return}if(a>=0x6000&&a<0x8000&&this.ramWritable()){const reg=this.prgRegs[0];if(!(reg&0x80))this.c.prgRam[((reg&0x7f)*0x2000+(a&0x1fff))%this.c.prgRam.length]=v;return}if(a>=0x8000&&this.ramWritable()){const m=this.prgRegForAddress(a);if(!(m.reg&0x80)){const mask=m.align===4?~3:m.align===2?~1:~0,bank=(m.reg&0x7f)&mask;this.c.prgRam[((bank*0x2000)+m.base)%this.c.prgRam.length]=v}}}
 nametableMode(a){const q=(((a-0x2000)&0x0fff)>>10)&3;return (this.ntMap>>(q*2))&3}
 nametableRead(a,vram){const off=(a-0x2000)&0x3ff,mode=this.nametableMode(a);if(mode===0)return vram[off];if(mode===1)return vram[0x400+off];if(mode===2)return this.exRam[off];return off<0x3c0?this.fillTile:((this.fillAttr&3)*0x55)}
 nametableWrite(a,v,vram){const off=(a-0x2000)&0x3ff,mode=this.nametableMode(a);if(mode===0)vram[off]=v;else if(mode===1)vram[0x400+off]=v;else if(mode===2)this.exRam[off]=v;return true}
 chrBankFor(a){const slot=(a&0x1fff)>>10;if(this.chrMode===0){const b=this.chrRegs[7]&~7;return b+slot}if(this.chrMode===1){const half=slot>>2,b=this.chrRegs[half?7:3]&~3;return b+(slot&3)}if(this.chrMode===2){const pair=slot>>1,b=this.chrRegs[[1,3,5,7][pair]]&~1;return b+(slot&1)}return this.chrRegs[slot]}
 ppuRead(a){a&=0x1fff;const bank=this.chrBankFor(a)%this.chr1Count();return this.c.chr[bank*0x400+(a&0x3ff)]}
 ppuWrite(a,v){if(!this.c.chrRam)return;a&=0x1fff;const bank=this.chrBankFor(a)%this.chr1Count();this.c.chr[bank*0x400+(a&0x3ff)]=v}
 pulsePeriod(ch){const o=ch?4:0;return this.audioRegs[o+2]|((this.audioRegs[o+3]&7)<<8)}
 clockAudio(){for(let ch=0;ch<2;ch++){const p=this.audioPulse[ch],period=this.pulsePeriod(ch);if(p.timer<=0){p.timer=period+1;p.phase=(p.phase+1)&7}else p.timer--}}
 expansionAudioSample(){let sum=0,active=0;const en=this.audioRegs[0x15];for(let ch=0;ch<2;ch++){if(!(en&(1<<ch)))continue;const o=ch?4:0,ctrl=this.audioRegs[o],duty=((ctrl>>6)&3)+1,vol=ctrl&15;if(this.audioPulse[ch].phase<duty)sum+=vol/15;active++}if(this.pcm){sum+=(this.pcm/127)*0.5;active++}return active?(sum/active)*0.18:0}
 clockCpu(){this.clockAudio();if(this.irqPending){this.irqPending=false;return true}return false}
 clockScanline(){this.inFrame=true;this.scanlineCounter=(this.scanlineCounter+1)&255;if(this.scanlineCounter===this.irqScanline&&this.irqEnabled){this.irqPending=true;return true}return false}
 onFrameStart(){this.inFrame=true;this.scanlineCounter=0;this.irqPending=false}
 onVBlank(){this.inFrame=false}
 snapshot(){return{prgMode:this.prgMode,chrMode:this.chrMode,prgRegs:Array.from(this.prgRegs),chrRegs:Array.from(this.chrRegs),ntMap:this.ntMap,fillTile:this.fillTile,fillAttr:this.fillAttr,exRam:Array.from(this.exRam),ramProtect1:this.ramProtect1,ramProtect2:this.ramProtect2,irqScanline:this.irqScanline,irqEnabled:this.irqEnabled,irqPending:this.irqPending,inFrame:this.inFrame,scanlineCounter:this.scanlineCounter,mulA:this.mulA,mulB:this.mulB,audioRegs:Array.from(this.audioRegs),audioPulse:this.audioPulse.map(x=>({...x})),pcm:this.pcm}}
 restore(s){if(!s)return;this.prgMode=s.prgMode??3;this.chrMode=s.chrMode??3;this.prgRegs.set(s.prgRegs||[]);this.chrRegs.set(s.chrRegs||[]);this.ntMap=s.ntMap||0;this.fillTile=s.fillTile||0;this.fillAttr=s.fillAttr||0;this.exRam.set(s.exRam||[]);this.ramProtect1=s.ramProtect1||0;this.ramProtect2=s.ramProtect2||0;this.irqScanline=s.irqScanline||0;this.irqEnabled=!!s.irqEnabled;this.irqPending=!!s.irqPending;this.inFrame=!!s.inFrame;this.scanlineCounter=s.scanlineCounter||0;this.mulA=s.mulA||0;this.mulB=s.mulB||0;if(s.audioRegs)this.audioRegs.set(s.audioRegs);if(s.audioPulse)this.audioPulse=s.audioPulse.map(x=>({...x}));this.pcm=s.pcm||0}
}
class Mapper30 extends Base{
 constructor(c){super(c);this.prgBank=0;this.chrBank=0;this.single=0}
 getMirroring(){if(this.c.fourScreen)return'four';if(this.c.nes2&&this.c.submapper===1)return this.single?'single1':'single0';return this.c.mirroring}
 cpuRead(a){if(a<0x8000)return 0;if(a<0xc000)return this.c.prg[((this.prgBank%Math.max(1,this.c.prg.length/0x4000))*0x4000)+(a-0x8000)];return this.c.prg[this.c.prg.length-0x4000+(a-0xc000)]}
 cpuWrite(a,v){if(a<0x8000)return;this.prgBank=v&0x1f;this.chrBank=(v>>5)&3;this.single=(v>>7)&1}
 ppuRead(a){return this.c.chr[((this.chrBank*0x2000)+(a&0x1fff))%this.c.chr.length]}
 ppuWrite(a,v){if(this.c.chrRam)this.c.chr[((this.chrBank*0x2000)+(a&0x1fff))%this.c.chr.length]=v}
 snapshot(){return{prgBank:this.prgBank,chrBank:this.chrBank,single:this.single}} restore(s){Object.assign(this,s||{})}
}
class Mapper79 extends Base{
 constructor(c){super(c);this.prgBank=0;this.chrBank=0}
 cpuRead(a){if(a<0x8000)return 0;const banks=Math.max(1,this.c.prg.length/0x8000);return this.c.prg[((this.prgBank%banks)*0x8000)+(a-0x8000)]}
 cpuWrite(a,v){if(a>=0x4100&&a<=0x5fff&&(a&0x0100)){this.prgBank=(v>>3)&1;this.chrBank=v&7}}
 ppuRead(a){const banks=Math.max(1,this.c.chr.length/0x2000);return this.c.chr[((this.chrBank%banks)*0x2000)+(a&0x1fff)]}
 ppuWrite(a,v){if(this.c.chrRam){const banks=Math.max(1,this.c.chr.length/0x2000);this.c.chr[((this.chrBank%banks)*0x2000)+(a&0x1fff)]=v}}
 snapshot(){return{prgBank:this.prgBank,chrBank:this.chrBank}} restore(s){Object.assign(this,s||{})}
}


class Mapper19 extends Base{
 constructor(c){super(c);this.handlesPrgRam=true;this.prgRegs=new Uint8Array([0,1,2]);this.chrRegs=new Uint8Array(8);this.ntRegs=new Uint8Array(4);this.irqCounter=0;this.irqEnable=false;this.irqPending=false;this.soundRam=new Uint8Array(128);this.soundAddr=0;this.soundAuto=false;this.phase=new Float64Array(8);this.audioDivider=0}
 prgCount(){return Math.max(1,Math.floor(this.c.prg.length/0x2000))}
 chrCount(){return Math.max(1,Math.floor(this.c.chr.length/0x400))}
 cpuRead(a){
  if(a===0x4800){const v=this.soundRam[this.soundAddr&0x7f];if(this.soundAuto)this.soundAddr=(this.soundAddr+1)&0x7f;return v}
  if(a===0x5000)return this.irqCounter&0xff;
  if(a===0x5800)return ((this.irqCounter>>8)&0x7f)|(this.irqEnable?0x80:0);
  if(a>=0x6000&&a<0x8000)return this.c.prgRam[a%this.c.prgRam.length];
  if(a<0x8000)return null;
  const slot=(a-0x8000)>>13,bank=slot<3?this.prgRegs[slot]:(this.prgCount()-1);
  return this.c.prg[((bank%this.prgCount())*0x2000)+(a&0x1fff)]
 }
 cpuWrite(a,v){
  if(a===0x4800){this.soundRam[this.soundAddr&0x7f]=v;if(this.soundAuto)this.soundAddr=(this.soundAddr+1)&0x7f;return}
  if(a===0x5000){this.irqCounter=(this.irqCounter&0x7f00)|v;this.irqPending=false;return}
  if(a===0x5800){this.irqCounter=(this.irqCounter&0xff)|((v&0x7f)<<8);this.irqEnable=!!(v&0x80);this.irqPending=false;return}
  if(a>=0x6000&&a<0x8000){this.c.prgRam[a%this.c.prgRam.length]=v;return}
  if(a>=0x8000&&a<=0xbfff){const slot=(a-0x8000)>>11;if(slot<8)this.chrRegs[slot]=v;return}
  if(a>=0xc000&&a<=0xdfff){const slot=(a-0xc000)>>11;if(slot<4)this.ntRegs[slot]=v;return}
  if(a>=0xe000&&a<0xe800){this.prgRegs[0]=v&0x3f;return}
  if(a>=0xe800&&a<0xf000){this.prgRegs[1]=v&0x3f;return}
  if(a>=0xf000&&a<0xf800){this.prgRegs[2]=v&0x3f;return}
  if(a>=0xf800){this.soundAddr=v&0x7f;this.soundAuto=!!(v&0x80);return}
 }
 ppuRead(a){a&=0x1fff;const slot=a>>10,bank=this.chrRegs[slot]%this.chrCount();return this.c.chr[bank*0x400+(a&0x3ff)]}
 ppuWrite(a,v){if(!this.c.chrRam)return;a&=0x1fff;const slot=a>>10,bank=this.chrRegs[slot]%this.chrCount();this.c.chr[bank*0x400+(a&0x3ff)]=v}
 nametableRead(a,vram){const rel=(a-0x2000)&0xfff,slot=rel>>10,reg=this.ntRegs[slot];if(reg>=0xe0)return vram[((reg&1)<<10)|(rel&0x3ff)];const count=this.chrCount(),bank=(reg%count);return this.c.chr[bank*0x400+(rel&0x3ff)]}
 nametableWrite(a,v,vram){const rel=(a-0x2000)&0xfff,slot=rel>>10,reg=this.ntRegs[slot];if(reg>=0xe0){vram[((reg&1)<<10)|(rel&0x3ff)]=v;return true}if(this.c.chrRam){const count=this.chrCount(),bank=reg%count;this.c.chr[bank*0x400+(rel&0x3ff)]=v;return true}return true}
 clockCpu(){if(this.irqEnable&&this.irqCounter<0x7fff){this.irqCounter++;if(this.irqCounter>=0x7fff)this.irqPending=true}if(this.irqPending){this.irqPending=false;return true}return false}
 expansionAudioSample(){
  // N163 multiplexes up to 8 wavetable channels. This model keeps the register layout
  // and channel multiplexing, while using a simplified per-CPU-cycle phase accumulator.
  const active=Math.max(1,Math.min(8,((this.soundRam[0x7f]>>4)&7)+1));let sum=0;
  for(let ci=0;ci<active;ci++){
   const base=0x78-ci*8;const freq=(this.soundRam[base]|(this.soundRam[base+2]<<8)|((this.soundRam[base+4]&3)<<16))>>>0;
   const length=256-(this.soundRam[base+4]&0xfc);const waveAddr=this.soundRam[base+6];const vol=this.soundRam[base+7]&15;if(!freq||!vol||length<=0)continue;
   this.phase[ci]=(this.phase[ci]+freq/983040)%length;const pos=(waveAddr+(this.phase[ci]|0))&0xff;const b=this.soundRam[(pos>>1)&0x7f],n=(pos&1)?(b>>4):(b&15);sum+=((n-7.5)/7.5)*(vol/15)
  }
  return (sum/active)*0.18
 }
 persistent(){return{soundRam:Array.from(this.soundRam)}}
 loadPersistent(s){if(s?.soundRam)this.soundRam.set(s.soundRam.slice?.(0,128)||s.soundRam)}
 snapshot(){return{prgRegs:Array.from(this.prgRegs),chrRegs:Array.from(this.chrRegs),ntRegs:Array.from(this.ntRegs),irqCounter:this.irqCounter,irqEnable:this.irqEnable,irqPending:this.irqPending,soundRam:Array.from(this.soundRam),soundAddr:this.soundAddr,soundAuto:this.soundAuto,phase:Array.from(this.phase)}}
 restore(s){if(!s)return;this.prgRegs.set(s.prgRegs||[]);this.chrRegs.set(s.chrRegs||[]);this.ntRegs.set(s.ntRegs||[]);this.irqCounter=s.irqCounter||0;this.irqEnable=!!s.irqEnable;this.irqPending=!!s.irqPending;this.soundRam.set(s.soundRam||[]);this.soundAddr=s.soundAddr||0;this.soundAuto=!!s.soundAuto;this.phase.set(s.phase||[])}
}

class Mapper85 extends Base{
 constructor(c){super(c);this.handlesPrgRam=true;this.prgRegs=new Uint8Array([0,1,2]);this.chrRegs=new Uint8Array(8);this.mirror=c.mirroring;this.ramEnabled=true;this.irqLatch=0;this.irqCounter=0;this.irqEnable=false;this.irqEnableAfterAck=false;this.irqCycleMode=false;this.irqPending=false;this.irqPrescaler=341;this.fmSelect=0;this.fmRegs=new Uint8Array(0x40);this.fmPhase=new Float64Array(6)}
 getMirroring(){return this.mirror}
 prgCount(){return Math.max(1,Math.floor(this.c.prg.length/0x2000))}
 chrCount(){return Math.max(1,Math.floor(this.c.chr.length/0x400))}
 cpuRead(a){if(a>=0x6000&&a<0x8000)return this.ramEnabled?this.c.prgRam[a%this.c.prgRam.length]:0;if(a<0x8000)return null;const slot=(a-0x8000)>>13,bank=slot<3?this.prgRegs[slot]:(this.prgCount()-1);return this.c.prg[((bank%this.prgCount())*0x2000)+(a&0x1fff)]}
 cpuWrite(a,v){
  if(a>=0x6000&&a<0x8000){if(this.ramEnabled)this.c.prgRam[a%this.c.prgRam.length]=v;return}
  const r=a&0xf030;
  if(r===0x8000){this.prgRegs[0]=v;return}if(r===0x8010||r===0x8030){this.prgRegs[1]=v;return}
  if(r===0x9000){this.prgRegs[2]=v;return}if(r===0x9010){this.fmSelect=v&0x3f;return}if(r===0x9030){this.fmRegs[this.fmSelect]=v;return}
  if(a>=0xa000&&a<0xe000){const group=((a>>12)-0xa)*2,sub=(a&0x0030)?1:0,idx=group+sub;if(idx<8)this.chrRegs[idx]=v;return}
  if(r===0xe000){this.mirror=(v&1)?'horizontal':'vertical';this.ramEnabled=!!(v&0x80)||this.ramEnabled;return}
  if(r===0xe010||r===0xe030){this.irqLatch=v;return}
  if(r===0xf000){this.irqEnable=!!(v&2);this.irqEnableAfterAck=!!(v&1);this.irqCycleMode=!!(v&4);this.irqPending=false;if(this.irqEnable){this.irqCounter=this.irqLatch;this.irqPrescaler=341}return}
  if(r===0xf010||r===0xf030){this.irqPending=false;this.irqEnable=this.irqEnableAfterAck;return}
 }
 ppuRead(a){a&=0x1fff;const slot=a>>10,bank=this.chrRegs[slot]%this.chrCount();return this.c.chr[bank*0x400+(a&0x3ff)]}
 ppuWrite(a,v){if(!this.c.chrRam)return;a&=0x1fff;const slot=a>>10,bank=this.chrRegs[slot]%this.chrCount();this.c.chr[bank*0x400+(a&0x3ff)]=v}
 clockIrq(){if(this.irqCounter===0xff){this.irqCounter=this.irqLatch;this.irqPending=true}else this.irqCounter=(this.irqCounter+1)&255}
 clockCpu(){if(this.irqEnable){if(this.irqCycleMode)this.clockIrq();else{this.irqPrescaler-=3;if(this.irqPrescaler<=0){this.irqPrescaler+=341;this.clockIrq()}}}if(this.irqPending){this.irqPending=false;return true}return false}
 expansionAudioSample(){
  // VRC7/YM2413-compatible register interface with lightweight 6-channel FM-like synthesis.
  // It preserves frequency/key/volume semantics; operator-level FM remains experimental.
  let sum=0,active=0;for(let ch=0;ch<6;ch++){const lo=this.fmRegs[0x10+ch],hi=this.fmRegs[0x20+ch],iv=this.fmRegs[0x30+ch];if(!(hi&0x10))continue;const fnum=lo|((hi&1)<<8),block=(hi>>1)&7,vol=iv&15;if(!fnum||vol===15)continue;const step=(fnum*Math.pow(2,block))/131072;this.fmPhase[ch]=(this.fmPhase[ch]+step)%(Math.PI*2);const carrier=Math.sin(this.fmPhase[ch]+Math.sin(this.fmPhase[ch]*2)*0.35);sum+=carrier*((15-vol)/15);active++}return active?(sum/active)*0.16:0
 }
 snapshot(){return{prgRegs:Array.from(this.prgRegs),chrRegs:Array.from(this.chrRegs),mirror:this.mirror,ramEnabled:this.ramEnabled,irqLatch:this.irqLatch,irqCounter:this.irqCounter,irqEnable:this.irqEnable,irqEnableAfterAck:this.irqEnableAfterAck,irqCycleMode:this.irqCycleMode,irqPending:this.irqPending,irqPrescaler:this.irqPrescaler,fmSelect:this.fmSelect,fmRegs:Array.from(this.fmRegs),fmPhase:Array.from(this.fmPhase)}}
 restore(s){if(!s)return;this.prgRegs.set(s.prgRegs||[]);this.chrRegs.set(s.chrRegs||[]);this.mirror=s.mirror||this.c.mirroring;this.ramEnabled=s.ramEnabled!==false;this.irqLatch=s.irqLatch||0;this.irqCounter=s.irqCounter||0;this.irqEnable=!!s.irqEnable;this.irqEnableAfterAck=!!s.irqEnableAfterAck;this.irqCycleMode=!!s.irqCycleMode;this.irqPending=!!s.irqPending;this.irqPrescaler=s.irqPrescaler||341;this.fmSelect=s.fmSelect||0;this.fmRegs.set(s.fmRegs||[]);this.fmPhase.set(s.fmPhase||[])}
}

function createMapper(c){switch(c.mapper){case 0:return new Mapper0(c);case 1:return new Mapper1(c);case 2:return new Mapper2(c);case 3:return new Mapper3(c);case 4:return new Mapper4(c);case 5:return new Mapper5(c);case 7:return new Mapper7(c);case 9:return new Mapper9(c);case 10:return new Mapper10(c);case 11:return new Mapper11(c);case 16:return new Mapper16(c);case 18:return new Mapper18(c);case 19:return new Mapper19(c);case 21:case 22:case 23:case 25:return new MapperVRC24(c);case 24:case 26:return new MapperVRC6(c);case 30:return new Mapper30(c);case 34:return new Mapper34(c);case 66:return new Mapper66(c);case 69:return new Mapper69(c);case 71:return new Mapper71(c);case 78:return new Mapper78(c);case 79:return new Mapper79(c);case 85:return new Mapper85(c);case 94:return new Mapper94(c);case 153:return new Mapper153(c);case 146:return new Mapper79(c);case 159:return new Mapper159(c);case 180:return new Mapper180(c);default:throw new Error(`Mapper ${c.mapper} ainda não é suportado nesta versão`)}}
