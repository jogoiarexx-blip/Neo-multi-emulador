export class GBATimers {
  constructor(memory) {
    this.memory = memory;
    this.apu = null;
    this.timers = Array.from({length:4}, () => ({
      reload:0, counter:0, control:0, enabled:false, prescale:1, accum:0
    }));
  }

  reset() {
    for (let i=0;i<4;i++) {
      const t=this.timers[i];
      Object.assign(t,{reload:0,counter:0,control:0,enabled:false,prescale:1,accum:0});
      this.memory.writeIO16Raw?.(0x100+i*4,0);
      this.memory.writeIO16Raw?.(0x102+i*4,0);
    }
  }

  _prescaleFromControl(control) { return [1,64,256,1024][control & 3] || 1; }

  _applyControl(i, control) {
    const t=this.timers[i];
    const was=t.enabled;
    t.control=control & 0x00C7;
    t.enabled=!!(t.control & 0x80);
    t.prescale=this._prescaleFromControl(t.control);
    if (t.enabled && !was) { t.counter=t.reload; t.accum=0; this._publishCounter(i); }
    if (!t.enabled && was) t.accum=0;
  }

  onIOWrite(address) {
    if (address < 0x04000100 || address > 0x0400010F) return;
    const off=address-0x04000000;
    const i=((off-0x100)/4)|0;
    if (i<0 || i>3) return;
    const base=0x100+i*4;
    if (off===base || off===base+1) {
      this.timers[i].reload=this.memory.readIO16Raw(base);
      if (!this.timers[i].enabled) this.timers[i].counter=this.timers[i].reload;
    }
    if (off===base+2 || off===base+3) this._applyControl(i,this.memory.readIO16Raw(base+2));
  }

  _publishCounter(i) { this.memory.writeIO16Raw?.(0x100+i*4,this.timers[i].counter & 0xFFFF); }

  _increment(i, increments) {
    const t=this.timers[i];
    if (!t.enabled || increments<=0) return 0;
    let overflows=0;
    let remaining=increments;
    while (remaining>0) {
      const toOverflow=0x10000-t.counter;
      if (remaining < toOverflow) { t.counter=(t.counter+remaining)&0xFFFF; remaining=0; break; }
      remaining-=toOverflow;
      t.counter=t.reload;
      overflows++;
      if (this.apu) this.apu.onTimerOverflow(i);
      if (t.control & 0x40) this.memory.requestIRQ?.(1 << (3+i));
      // Avoid pathological loops if a caller supplies an enormous cycle burst.
      if (overflows>0x10000) { remaining=0; break; }
    }
    this._publishCounter(i);
    return overflows;
  }

  tick(cycles) {
    let cascadePulses=0;
    for (let i=0;i<4;i++) {
      const t=this.timers[i];
      if (!t.enabled) { cascadePulses=0; continue; }
      const cascade=i>0 && !!(t.control & 0x4);
      if (cascade) {
        cascadePulses=this._increment(i,cascadePulses);
        continue;
      }
      t.accum += cycles;
      const increments=Math.floor(t.accum/t.prescale);
      if (increments>0) t.accum-=increments*t.prescale;
      cascadePulses=this._increment(i,increments);
    }
  }

  createState(){return this.timers.map(t=>({...t}));}
  restoreState(state){
    if(!Array.isArray(state))return;
    state.slice(0,4).forEach((s,i)=>{Object.assign(this.timers[i],s);this._publishCounter(i);this.memory.writeIO16Raw?.(0x102+i*4,this.timers[i].control);});
  }
}
