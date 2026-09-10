export class GBATimers {
  constructor(memory) {
    this.memory = memory;
    this.apu = null;
    this.timers = Array.from({length:4}, () => ({
      reload:0, counter:0, control:0, enabled:false, prescale:1, accum:0
    }));
  }

  reset() {
    for (const t of this.timers) {
      t.reload = 0; t.counter = 0; t.control = 0;
      t.enabled = false; t.prescale = 1; t.accum = 0;
    }
  }

  _prescaleFromControl(control) {
    return [1,64,256,1024][control & 3] || 1;
  }

  syncFromIO() {
    for (let i=0;i<4;i++) {
      const base = 0x100 + i*4;
      const reload = this.memory.io[base] | (this.memory.io[base+1] << 8);
      const control = this.memory.io[base+2] | (this.memory.io[base+3] << 8);
      const t = this.timers[i];
      const wasEnabled = t.enabled;
      t.reload = reload;
      t.control = control;
      t.enabled = !!(control & 0x80);
      t.prescale = this._prescaleFromControl(control);
      if (t.enabled && !wasEnabled) {
        t.counter = reload;
        t.accum = 0;
      }
    }
  }

  tick(cycles) {
    this.syncFromIO();
    for (let i=0;i<4;i++) {
      const t = this.timers[i];
      if (!t.enabled) continue;
      const cascade = !!(t.control & 0x4);
      if (cascade) continue; // cascade virá depois
      t.accum += cycles;
      while (t.accum >= t.prescale) {
        t.accum -= t.prescale;
        t.counter = (t.counter + 1) & 0xFFFF;
        if (t.counter === 0) {
          t.counter = t.reload;
          if (this.apu) this.apu.onTimerOverflow(i);
          if (t.control & 0x40) {
            const ifAddr = 0x202;
            const cur = this.memory.io[ifAddr] | (this.memory.io[ifAddr+1] << 8);
            const next = cur | (1 << (3+i));
            this.memory.io[ifAddr] = next & 0xFF;
            this.memory.io[ifAddr+1] = next >>> 8;
          }
        }
      }
      const base = 0x100 + i*4;
      this.memory.io[base] = t.counter & 0xFF;
      this.memory.io[base+1] = t.counter >>> 8;
    }
  }
}
