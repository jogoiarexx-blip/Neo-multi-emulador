export class GbaDMA {
  constructor(memory) {
    this.memory = memory;
    this.channels = Array.from({length:4}, (_, i) => ({
      index:i, enabled:false, src:0, dst:0, count:0, control:0
    }));
  }

  reset() {
    for (const c of this.channels) {
      c.enabled = false; c.src = 0; c.dst = 0; c.count = 0; c.control = 0;
    }
  }

  _read32IO(off) {
    return (this.memory.io[off] |
      (this.memory.io[off+1] << 8) |
      (this.memory.io[off+2] << 16) |
      (this.memory.io[off+3] << 24)) >>> 0;
  }

  _read16IO(off) {
    return this.memory.io[off] | (this.memory.io[off+1] << 8);
  }

  sync() {
    for (let i=0;i<4;i++) {
      const base = 0xB0 + i*12;
      const c = this.channels[i];
      c.src = this._read32IO(base);
      c.dst = this._read32IO(base+4);
      c.count = this._read16IO(base+8);
      c.control = this._read16IO(base+10);
      c.enabled = !!(c.control & 0x8000);
    }
  }

  triggerAudio(apu) {
    this.sync();
    for (const c of this.channels) {
      if (!c.enabled) continue;
      const startTiming = (c.control >>> 12) & 0x3;
      if (startTiming !== 3) continue;

      const target = c.dst >>> 0;
      const fifo = target === 0x040000A0 ? "A" : target === 0x040000A4 ? "B" : null;
      if (!fifo || !apu.needsDMA(fifo)) continue;

      let src = c.src >>> 0;
      for (let i=0;i<4;i++) {
        const v = this.memory.read32(src);
        this.memory.write32(target, v);
        src = (src + 4) >>> 0;
      }
      c.src = src;
    }
  }

  trigger(timing = 0) {
    this.sync();
    for (const c of this.channels) {
      if (!c.enabled) continue;
      const startTiming = (c.control >>> 12) & 0x3;
      if (startTiming !== timing) continue;

      let count = c.count || (c.index === 3 ? 0x10000 : 0x4000);
      const word = !!(c.control & 0x0400);
      const size = word ? 4 : 2;
      const srcMode = (c.control >>> 7) & 0x3;
      const dstMode = (c.control >>> 5) & 0x3;

      let src = c.src >>> 0;
      let dst = c.dst >>> 0;

      const stepFor = (mode) => mode === 0 ? size : mode === 1 ? -size : 0;

      const srcStep = stepFor(srcMode);
      const dstStep = stepFor(dstMode);

      for (let n=0;n<count;n++) {
        if (word) this.memory.write32(dst, this.memory.read32(src));
        else this.memory.write16(dst, this.memory.read16(src));
        src = (src + srcStep) >>> 0;
        dst = (dst + dstStep) >>> 0;
      }

      // IRQ
      if (c.control & 0x4000) {
        const ifAddr = 0x202;
        let iff = this.memory.io[ifAddr] | (this.memory.io[ifAddr+1] << 8);
        iff |= (1 << (8 + c.index));
        this.memory.io[ifAddr] = iff & 0xFF;
        this.memory.io[ifAddr+1] = iff >>> 8;
      }

      const repeat = !!(c.control & 0x0200);
      if (!repeat || timing === 0) {
        const base = 0xB0 + c.index*12 + 10;
        let ctl = this._read16IO(base) & ~0x8000;
        this.memory.io[base] = ctl & 0xFF;
        this.memory.io[base+1] = ctl >>> 8;
      }
    }
  }
}
