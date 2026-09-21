export class GbaDMA {
  constructor(memory) {
    this.memory = memory;
    this.channels = Array.from({length:4}, (_, i) => ({
      index:i, enabled:false, src:0, dst:0, count:0, control:0,
      initialSrc:0, initialDst:0, initialCount:0
    }));
    this.inTransfer=false;
  }

  reset() {
    for (const c of this.channels) Object.assign(c,{enabled:false,src:0,dst:0,count:0,control:0,initialSrc:0,initialDst:0,initialCount:0});
    this.inTransfer=false;
  }

  _read32IO(off) { return (this.memory.io[off] | (this.memory.io[off+1]<<8) | (this.memory.io[off+2]<<16) | (this.memory.io[off+3]<<24))>>>0; }
  _read16IO(off) { return this.memory.io[off] | (this.memory.io[off+1]<<8); }
  _write16IO(off,v){ this.memory.writeIO16Raw?.(off,v); }

  _syncChannel(i) {
    const base=0xB0+i*12, c=this.channels[i];
    const rawSrc=this._read32IO(base), rawDst=this._read32IO(base+4), rawCount=this._read16IO(base+8), rawCtl=this._read16IO(base+10);
    const enabled=!!(rawCtl&0x8000), rising=enabled&&!c.enabled;
    c.control=rawCtl;
    if (!c.enabled || rising) {
      c.src=rawSrc>>>0; c.dst=rawDst>>>0; c.count=rawCount;
      c.initialSrc=c.src; c.initialDst=c.dst; c.initialCount=c.count;
    }
    c.enabled=enabled;
    return rising;
  }

  sync(){for(let i=0;i<4;i++)this._syncChannel(i);}

  onIOWrite(address) {
    if(this.inTransfer || address<0x040000B0 || address>0x040000DF)return;
    const i=Math.floor((address-0x040000B0)/12);
    if(i<0||i>3)return;
    const rising=this._syncChannel(i);
    if(rising && (((this.channels[i].control>>>12)&3)===0)) this._runChannel(this.channels[i],0);
  }

  _disable(c){
    c.enabled=false;
    const base=0xB0+c.index*12+10;
    this._write16IO(base,this._read16IO(base)&~0x8000);
  }

  _runChannel(c,timing,{audioFifo=null}={}) {
    if(!c.enabled)return false;
    const word=audioFifo ? true : !!(c.control&0x0400);
    const size=word?4:2;
    const srcMode=(c.control>>>7)&3;
    const dstMode=(c.control>>>5)&3;
    const repeat=!!(c.control&0x0200);
    let count=audioFifo?4:(c.count || (c.index===3?0x10000:0x4000));
    let src=c.src>>>0, dst=audioFifo?(audioFifo==='A'?0x040000A0:0x040000A4):(c.dst>>>0);
    const stepFor=(mode,isDst=false)=>mode===0?size:mode===1?-size:(mode===3&&isDst?size:0);
    const srcStep=stepFor(srcMode), dstStep=audioFifo?0:stepFor(dstMode,true);
    this.inTransfer=true;
    try{
      for(let n=0;n<count;n++){
        if(word)this.memory.write32(dst,this.memory.read32(src));
        else this.memory.write16(dst,this.memory.read16(src));
        src=(src+srcStep)>>>0; dst=(dst+dstStep)>>>0;
      }
    } finally { this.inTransfer=false; }
    c.src=src; c.dst=dst;
    if(c.control&0x4000)this.memory.requestIRQ?.(1<<(8+c.index));
    if(repeat && timing!==0){
      c.count=c.initialCount;
      if(dstMode===3)c.dst=c.initialDst;
    } else this._disable(c);
    return true;
  }

  triggerAudio(apu) {
    this.sync();
    for(const c of this.channels){
      if(!c.enabled || ((c.control>>>12)&3)!==3)continue;
      const fifo=c.dst===0x040000A0?'A':c.dst===0x040000A4?'B':null;
      if(fifo && apu.needsDMA(fifo))this._runChannel(c,3,{audioFifo:fifo});
    }
  }

  trigger(timing=0) {
    this.sync();
    for(const c of this.channels) if(c.enabled && ((c.control>>>12)&3)===timing) this._runChannel(c,timing);
  }

  createState(){return this.channels.map(c=>({...c}));}
  restoreState(state){if(!Array.isArray(state))return;state.slice(0,4).forEach((s,i)=>Object.assign(this.channels[i],s));}
}
