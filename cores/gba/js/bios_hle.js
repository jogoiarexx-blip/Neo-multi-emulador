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

      case 0x08: { // Sqrt
        this.cpu.registers[0] = Math.floor(Math.sqrt(this.cpu.registers[0] >>> 0)) >>> 0;
        return 8;
      }

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
      case 0x05: // VBlankIntrWait
        this.cpu.halted = true;
        this.cpu.waitingForInterrupt = true;
        return 2;

      case 0x11: // LZ77UnCompWram
      case 0x12: // LZ77UnCompVram
        return Math.max(2, this._lz77(this.cpu.registers[0]>>>0, this.cpu.registers[1]>>>0) >> 2);

      case 0x14: // RLUnCompWram
      case 0x15: // RLUnCompVram
        return Math.max(2, this._rl(this.cpu.registers[0]>>>0, this.cpu.registers[1]>>>0) >> 2);

      case 0x0E: // BgAffineSet - placeholder HLE safe no-op
      case 0x0F: // ObjAffineSet
        this.logger(`[BIOS HLE] SWI ${number.toString(16)} reconhecido (parcial)`);
        return 4;

      default:
        this.logger(`[BIOS HLE] SWI não implementado: 0x${number.toString(16).toUpperCase()}`);
        return 2;
    }
  }
}
