export class BIOSHLE {
  constructor(memory, cpu, logger = ()=>{}) {
    this.memory = memory;
    this.cpu = cpu;
    this.logger = logger;
  }

  _fill32(dst, value, words) {
    for (let i=0;i<words;i++) this.memory.write32((dst + i*4)>>>0, value>>>0);
  }

  _copy16(src, dst, halfwords) {
    for (let i=0;i<halfwords;i++) this.memory.write16((dst+i*2)>>>0, this.memory.read16((src+i*2)>>>0));
  }

  _copy32(src, dst, words) {
    for (let i=0;i<words;i++) this.memory.write32((dst+i*4)>>>0, this.memory.read32((src+i*4)>>>0));
  }

  _s16(v) { v &= 0xFFFF; return v & 0x8000 ? v - 0x10000 : v; }
  _s32(v) { return v | 0; }
  _writeS16(addr, v) { this.memory.write16(addr >>> 0, v & 0xFFFF); }

  _bgAffineSet(src, dst, count) {
    count >>>= 0;
    for (let i=0;i<count;i++) {
      const s = (src + i*20) >>> 0;
      const d = (dst + i*16) >>> 0;
      const texX = this._s32(this.memory.read32(s));
      const texY = this._s32(this.memory.read32(s+4));
      const scrX = this._s16(this.memory.read16(s+8));
      const scrY = this._s16(this.memory.read16(s+10));
      const scaleX = this._s16(this.memory.read16(s+12));
      const scaleY = this._s16(this.memory.read16(s+14));
      const alpha = this.memory.read16(s+16) & 0xFFFF;
      const angle = alpha * (Math.PI * 2 / 65536);
      const sin = Math.sin(angle), cos = Math.cos(angle);
      const pa = Math.round(cos * scaleX);
      const pb = Math.round(-sin * scaleX);
      const pc = Math.round(sin * scaleY);
      const pd = Math.round(cos * scaleY);
      const dx = (texX - pa*scrX - pb*scrY) | 0;
      const dy = (texY - pc*scrX - pd*scrY) | 0;
      this._writeS16(d, pa); this._writeS16(d+2, pb);
      this._writeS16(d+4, pc); this._writeS16(d+6, pd);
      this.memory.write32(d+8, dx >>> 0); this.memory.write32(d+12, dy >>> 0);
    }
  }

  _objAffineSet(src, dst, count, offset) {
    count >>>= 0; offset = Math.max(2, offset & 0xFFFF);
    for (let i=0;i<count;i++) {
      const s = (src + i*8) >>> 0;
      const scaleX = this._s16(this.memory.read16(s));
      const scaleY = this._s16(this.memory.read16(s+2));
      const alpha = this.memory.read16(s+4) & 0xFFFF;
      const angle = alpha * (Math.PI * 2 / 65536);
      const sin = Math.sin(angle), cos = Math.cos(angle);
      const vals = [
        Math.round(cos * scaleX), Math.round(-sin * scaleX),
        Math.round(sin * scaleY), Math.round(cos * scaleY)
      ];
      let d = (dst + i*offset*4) >>> 0;
      for (let j=0;j<4;j++,d=(d+offset)>>>0) this._writeS16(d, vals[j]);
    }
  }

  _intrWait(discardOld, mask) {
    mask &= 0x3FFF;
    if (!mask) mask = 0x3FFF;
    let flags = this.memory.read16(0x03007FF8) & 0x3FFF;
    if (discardOld) {
      flags &= ~mask;
      this.memory.write16(0x03007FF8, flags);
    }
    if (flags & mask) {
      this.memory.write16(0x03007FF8, flags & ~mask);
      this.cpu.halted = false;
      this.cpu.waitingForInterrupt = false;
      this.cpu.irqWaitMask = 0;
      return 2;
    }
    this.cpu.irqWaitMask = mask;
    this.cpu.halted = true;
    this.cpu.waitingForInterrupt = true;
    return 2;
  }


  _lz77(src, dst) {
    const header = this.memory.read32(src);
    if ((header & 0xFF) !== 0x10) return 0;
    const size = (header >>> 8) & 0xFFFFFF;
    src += 4;
    const out = [];
    while (out.length < size) {
      const flags = this.memory.read8(src++);
      for (let bit=7; bit>=0 && out.length<size; bit--) {
        if (!(flags & (1<<bit))) out.push(this.memory.read8(src++));
        else {
          const a=this.memory.read8(src++), b=this.memory.read8(src++);
          const len=(a>>>4)+3, disp=(((a&15)<<8)|b)+1;
          for (let i=0;i<len && out.length<size;i++) out.push(out[out.length-disp] ?? 0);
        }
      }
    }
    for (let i=0;i<out.length;i++) this.memory.write8((dst+i)>>>0,out[i]);
    return out.length;
  }

  _rl(src, dst) {
    const header = this.memory.read32(src);
    if ((header & 0xFF) !== 0x30) return 0;
    const size = (header >>> 8) & 0xFFFFFF;
    src += 4;
    const out = [];
    while (out.length < size) {
      const c=this.memory.read8(src++);
      if (c & 0x80) {
        const n=(c&0x7F)+3, v=this.memory.read8(src++);
        for(let i=0;i<n && out.length<size;i++) out.push(v);
      } else {
        const n=(c&0x7F)+1;
        for(let i=0;i<n && out.length<size;i++) out.push(this.memory.read8(src++));
      }
    }
    for (let i=0;i<out.length;i++) this.memory.write8((dst+i)>>>0,out[i]);
    return out.length;
  }

  _clearRange(buffer, start = 0, end = buffer.length) {
    buffer.fill(0, start, end);
  }

  _registerRamReset(flags) {
    // GBA BIOS RegisterRamReset: implement the memory blocks that are safe to
    // model directly. IWRAM keeps the small BIOS work area at the top intact.
    if (flags & 0x01) this.memory.ewram.fill(0);
    if (flags & 0x02) this.memory.iwram.fill(0, 0, 0x7E00);
    if (flags & 0x04) this.memory.palette.fill(0);
    if (flags & 0x08) this.memory.vram.fill(0);
    if (flags & 0x10) this.memory.oam.fill(0);
    if (flags & 0x20) {
      for (let off = 0x120; off <= 0x12A; off++) this.memory.io[off] = 0;
    }
    if (flags & 0x40) {
      for (let off = 0x060; off <= 0x0A7; off++) this.memory.io[off] = 0;
      this.memory.apu?.reset?.();
    }
    if (flags & 0x80) {
      // Reset the commonly BIOS-initialised IO area while preserving KEYINPUT.
      for (let off = 0x000; off <= 0x05F; off++) this.memory.io[off] = 0;
      for (let off = 0x0B0; off <= 0x11F; off++) this.memory.io[off] = 0;
      for (let off = 0x130; off <= 0x3FF; off++) this.memory.io[off] = 0;
      this.memory.setKeyInput?.(0x03FF);
    }
  }

  swi(number) {
    number &= 0xFF;
    switch (number) {
      case 0x00: // SoftReset
        this.cpu.registers.fill(0);
        this.cpu.registers[13] = 0x03007F00;
        this.cpu.pc = 0x08000000;
        this.cpu.setThumb(false);
        this.logger("[BIOS HLE] SoftReset");
        return 4;

      case 0x01: // RegisterRamReset
        this._registerRamReset(this.cpu.registers[0] & 0xFF);
        return 8;

      case 0x02: // Halt
      case 0x03: // Stop (modelled as interrupt-wait in HLE)
        this.cpu.halted = true;
        this.cpu.waitingForInterrupt = true;
        return 2;

      case 0x06: { // Div
        const num = this.cpu.registers[0] | 0;
        const den = this.cpu.registers[1] | 0;
        if (den === 0) return 2;
        const q = (num / den) | 0;
        const r = (num % den) | 0;
        this.cpu.registers[0] = q >>> 0;
        this.cpu.registers[1] = r >>> 0;
        this.cpu.registers[3] = Math.abs(q) >>> 0;
        return 12;
      }

      case 0x07: { // DivArm: denominator and numerator are swapped vs Div
        const den = this.cpu.registers[0] | 0;
        const num = this.cpu.registers[1] | 0;
        if (den === 0) return 2;
        const q = (num / den) | 0;
        const r = (num % den) | 0;
        this.cpu.registers[0] = q >>> 0;
        this.cpu.registers[1] = r >>> 0;
        this.cpu.registers[3] = Math.abs(q) >>> 0;
        return 12;
      }

      case 0x08: { // Sqrt
        this.cpu.registers[0] = Math.floor(Math.sqrt(this.cpu.registers[0] >>> 0)) >>> 0;
        return 8;
      }

      case 0x0D: // BIOS checksum used by some software as a presence probe
        this.cpu.registers[0] = 0xBAAE187F;
        return 2;

      case 0x0B: { // CpuSet
        const src = this.cpu.registers[0] >>> 0;
        const dst = this.cpu.registers[1] >>> 0;
        const control = this.cpu.registers[2] >>> 0;
        const count = control & 0x1FFFFF;
        const word = !!(control & (1<<26));
        const fill = !!(control & (1<<24));
        if (word) {
          if (fill) this._fill32(dst, this.memory.read32(src), count);
          else this._copy32(src, dst, count);
        } else {
          const v = this.memory.read16(src);
          if (fill) for (let i=0;i<count;i++) this.memory.write16((dst+i*2)>>>0, v);
          else this._copy16(src, dst, count);
        }
        return Math.max(1, count);
      }

      case 0x0C: { // CpuFastSet
        const src = this.cpu.registers[0] >>> 0;
        const dst = this.cpu.registers[1] >>> 0;
        const control = this.cpu.registers[2] >>> 0;
        const words = (control & 0x1FFFFF) * 8;
        const fill = !!(control & (1<<24));
        if (fill) this._fill32(dst, this.memory.read32(src), words);
        else this._copy32(src, dst, words);
        return Math.max(1, words);
      }

      case 0x04: // IntrWait
        return this._intrWait(!!this.cpu.registers[0], this.cpu.registers[1] >>> 0);

      case 0x05: // VBlankIntrWait
        return this._intrWait(true, 1);

      case 0x11: // LZ77UnCompWram
      case 0x12: // LZ77UnCompVram
        return Math.max(2, this._lz77(this.cpu.registers[0]>>>0, this.cpu.registers[1]>>>0) >> 2);

      case 0x14: // RLUnCompWram
      case 0x15: // RLUnCompVram
        return Math.max(2, this._rl(this.cpu.registers[0]>>>0, this.cpu.registers[1]>>>0) >> 2);

      case 0x0E: { // BgAffineSet
        const count=this.cpu.registers[2]>>>0;
        this._bgAffineSet(this.cpu.registers[0]>>>0,this.cpu.registers[1]>>>0,count);
        return Math.max(4,count*8);
      }

      case 0x0F: { // ObjAffineSet
        const count=this.cpu.registers[2]>>>0, offset=this.cpu.registers[3]>>>0;
        this._objAffineSet(this.cpu.registers[0]>>>0,this.cpu.registers[1]>>>0,count,offset);
        return Math.max(4,count*6);
      }

      default:
        this.logger(`[BIOS HLE] SWI não implementado: 0x${number.toString(16).toUpperCase()}`);
        return 2;
    }
  }
}
