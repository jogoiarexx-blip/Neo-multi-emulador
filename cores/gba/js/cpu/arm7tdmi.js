export class ARM7TDMI {
  constructor(memory) {
    this.memory = memory;
    this.registers = new Uint32Array(16);
    this.cpsr = 0x0000001F;
    this.thumb = false;
    this.cycles = 0;
    this.lastInstruction = 0;
    this.halted = false;
    this.lastException = "";
    this.spsr_irq = 0;
    this.biosHLE = null;
    this.waitingForInterrupt = false;
  }

  reset() {
    this.registers.fill(0);
    this.registers[13] = 0x03007F00;
    this.registers[15] = 0x08000000;
    this.cpsr = 0x0000001F;
    this.thumb = false;
    this.cycles = 0;
    this.lastInstruction = 0;
    this.halted = false;
    this.lastException = "";
    this.spsr_irq = 0;
    this.biosHLE = null;
    this.waitingForInterrupt = false;
  }

  get pc() { return this.registers[15] >>> 0; }
  set pc(v) { this.registers[15] = v >>> 0; }

  getFlag(mask) { return (this.cpsr & mask) !== 0; }
  setFlag(mask, on) {
    if (on) this.cpsr |= mask;
    else this.cpsr &= ~mask;
  }

  setThumb(on) {
    this.thumb = !!on;
    this.setFlag(0x20, this.thumb);
  }

  conditionPassed(cond) {
    const N = this.getFlag(0x80000000);
    const Z = this.getFlag(0x40000000);
    const C = this.getFlag(0x20000000);
    const V = this.getFlag(0x10000000);
    switch (cond) {
      case 0x0: return Z;
      case 0x1: return !Z;
      case 0x2: return C;
      case 0x3: return !C;
      case 0x4: return N;
      case 0x5: return !N;
      case 0x6: return V;
      case 0x7: return !V;
      case 0x8: return C && !Z;
      case 0x9: return !C || Z;
      case 0xA: return N === V;
      case 0xB: return N !== V;
      case 0xC: return !Z && (N === V);
      case 0xD: return Z || (N !== V);
      case 0xE: return true;
      default: return false;
    }
  }

  _ror(value, amount) {
    amount &= 31;
    if (!amount) return value >>> 0;
    return ((value >>> amount) | (value << (32 - amount))) >>> 0;
  }

  _asr(value, amount) {
    if (amount >= 32) return (value & 0x80000000) ? 0xFFFFFFFF : 0;
    return (value >> amount) >>> 0;
  }

  _addFlags(a, b, result) {
    a >>>= 0; b >>>= 0; result >>>= 0;
    this._updateNZ(result);
    this.setFlag(0x20000000, (a + b) > 0xFFFFFFFF);
    const sa = a >> 31, sb = b >> 31, sr = result >> 31;
    this.setFlag(0x10000000, sa === sb && sa !== sr);
  }

  _subFlags(a, b, result) {
    a >>>= 0; b >>>= 0; result >>>= 0;
    this._updateNZ(result);
    this.setFlag(0x20000000, a >= b);
    const sa = a >> 31, sb = b >> 31, sr = result >> 31;
    this.setFlag(0x10000000, sa !== sb && sa !== sr);
  }

  _decodeOperand2(instr) {
    const immediate = (instr >>> 25) & 1;
    if (immediate) {
      const imm = instr & 0xFF;
      const rot = ((instr >>> 8) & 0xF) * 2;
      return this._ror(imm, rot);
    }
    const rm = instr & 0xF;
    let value = this.registers[rm] >>> 0;
    const shiftType = (instr >>> 5) & 0x3;
    const shiftByReg = (instr >>> 4) & 1;
    let amount = 0;
    if (shiftByReg) amount = this.registers[(instr >>> 8) & 0xF] & 0xFF;
    else amount = (instr >>> 7) & 0x1F;
    if (amount === 0) return value;
    switch (shiftType) {
      case 0: return (value << amount) >>> 0;
      case 1: return amount >= 32 ? 0 : value >>> amount;
      case 2: return this._asr(value, amount);
      case 3: return this._ror(value, amount);
      default: return value;
    }
  }

  _updateNZ(result) {
    result >>>= 0;
    this.setFlag(0x80000000, !!(result & 0x80000000));
    this.setFlag(0x40000000, result === 0);
  }

  _dataProcessing(instr) {
    const opcode = (instr >>> 21) & 0xF;
    const setFlags = ((instr >>> 20) & 1) !== 0;
    const rn = (instr >>> 16) & 0xF;
    const rd = (instr >>> 12) & 0xF;
    const a = this.registers[rn] >>> 0;
    const b = this._decodeOperand2(instr) >>> 0;
    let result = 0;
    let write = true;

    switch (opcode) {
      case 0x0: result = a & b; break;
      case 0x1: result = a ^ b; break;
      case 0x2: result = (a - b) >>> 0; if (setFlags) this._subFlags(a,b,result); break;
      case 0x4: result = (a + b) >>> 0; if (setFlags) this._addFlags(a,b,result); break;
      case 0x8: result = a & b; write = false; this._updateNZ(result); break;
      case 0xA: result = (a - b) >>> 0; write = false; this._subFlags(a,b,result); break;
      case 0xC: result = a | b; break;
      case 0xD: result = b; break;
      case 0xE: result = a & (~b); break;
      case 0xF: result = (~b) >>> 0; break;
      default: return false;
    }

    if (setFlags && ![0x2,0x4].includes(opcode)) this._updateNZ(result);
    if (write) {
      this.registers[rd] = result >>> 0;
      if (rd === 15) this.pc &= ~3;
    }
    return true;
  }

  _branch(instr) {
    const link = ((instr >>> 24) & 1) !== 0;
    let off = instr & 0x00FFFFFF;
    if (off & 0x00800000) off |= 0xFF000000;
    off = (off << 2) | 0;
    const current = this.pc >>> 0;
    if (link) this.registers[14] = (current - 4) >>> 0;
    this.pc = (current + off) >>> 0;
    return true;
  }

  _bx(instr) {
    const rm = instr & 0xF;
    const target = this.registers[rm] >>> 0;
    this.setThumb(!!(target & 1));
    this.pc = this.thumb ? (target & ~1) >>> 0 : (target & ~3) >>> 0;
    return true;
  }

  _multiply(instr) {
    const accumulate = ((instr >>> 21) & 1) !== 0;
    const setFlags = ((instr >>> 20) & 1) !== 0;
    const rd = (instr >>> 16) & 0xF;
    const rn = (instr >>> 12) & 0xF;
    const rs = (instr >>> 8) & 0xF;
    const rm = instr & 0xF;

    let result = Math.imul(this.registers[rm], this.registers[rs]) >>> 0;
    if (accumulate) result = (result + this.registers[rn]) >>> 0;
    this.registers[rd] = result;
    if (setFlags) this._updateNZ(result);
    return true;
  }

  _singleDataTransfer(instr) {
    const immediateOffset = ((instr >>> 25) & 1) === 0;
    const pre = ((instr >>> 24) & 1) !== 0;
    const up = ((instr >>> 23) & 1) !== 0;
    const byte = ((instr >>> 22) & 1) !== 0;
    const writeBack = ((instr >>> 21) & 1) !== 0;
    const load = ((instr >>> 20) & 1) !== 0;
    const rn = (instr >>> 16) & 0xF;
    const rd = (instr >>> 12) & 0xF;
    if (!immediateOffset) return false;
    const offset = instr & 0xFFF;
    const base = this.registers[rn] >>> 0;
    const indexed = up ? (base + offset) >>> 0 : (base - offset) >>> 0;
    const addr = pre ? indexed : base;
    if (load) {
      this.registers[rd] = byte ? this.memory.read8(addr) : this.memory.read32(addr);
      if (rd === 15) this.pc &= ~3;
    } else {
      const value = this.registers[rd] >>> 0;
      if (byte) this.memory.write8(addr, value);
      else this.memory.write32(addr, value);
    }
    if (writeBack || !pre) this.registers[rn] = indexed;
    return true;
  }

  _halfwordTransfer(instr) {
    const pre = ((instr >>> 24) & 1) !== 0;
    const up = ((instr >>> 23) & 1) !== 0;
    const immediate = ((instr >>> 22) & 1) !== 0;
    const writeBack = ((instr >>> 21) & 1) !== 0;
    const load = ((instr >>> 20) & 1) !== 0;
    const rn = (instr >>> 16) & 0xF;
    const rd = (instr >>> 12) & 0xF;
    const sign = ((instr >>> 6) & 1) !== 0;
    const half = ((instr >>> 5) & 1) !== 0;

    let offset;
    if (immediate) offset = (((instr >>> 8) & 0xF) << 4) | (instr & 0xF);
    else offset = this.registers[instr & 0xF] >>> 0;

    const base = this.registers[rn] >>> 0;
    const indexed = up ? (base + offset) >>> 0 : (base - offset) >>> 0;
    const addr = pre ? indexed : base;

    if (load) {
      let value;
      if (!sign && half) value = this.memory.read16(addr);
      else if (sign && !half) {
        const b = this.memory.read8(addr);
        value = (b & 0x80) ? (b | 0xFFFFFF00) >>> 0 : b;
      } else if (sign && half) {
        const h = this.memory.read16(addr);
        value = (h & 0x8000) ? (h | 0xFFFF0000) >>> 0 : h;
      } else return false;
      this.registers[rd] = value >>> 0;
    } else {
      if (!sign && half) this.memory.write16(addr, this.registers[rd]);
      else return false;
    }

    if (writeBack || !pre) this.registers[rn] = indexed;
    return true;
  }


  _blockDataTransfer(instr) {
    const pre = !!((instr >>> 24) & 1);
    const up = !!((instr >>> 23) & 1);
    const writeBack = !!((instr >>> 21) & 1);
    const load = !!((instr >>> 20) & 1);
    const rn = (instr >>> 16) & 0xF;
    const list = instr & 0xFFFF;

    const regs = [];
    for (let r=0;r<16;r++) if (list & (1<<r)) regs.push(r);
    if (!regs.length) return true;

    const base = this.registers[rn] >>> 0;
    const count = regs.length;
    let addr;

    if (up) addr = pre ? (base + 4) >>> 0 : base;
    else addr = pre ? (base - 4*count) >>> 0 : (base - 4*(count-1)) >>> 0;

    for (const r of regs) {
      if (load) this.registers[r] = this.memory.read32(addr);
      else this.memory.write32(addr, this.registers[r]);
      addr = (addr + 4) >>> 0;
    }

    if (writeBack) {
      this.registers[rn] = up ? (base + 4*count) >>> 0 : (base - 4*count) >>> 0;
    }
    if (load && (list & (1<<15))) this.pc &= ~3;
    return true;
  }

  _swi(instr) {
    const comment = instr & 0x00FFFFFF;
    this.lastException = `SWI 0x${comment.toString(16).toUpperCase()}`;
    if (this.biosHLE) return this.biosHLE.swi(comment & 0xFF);
    return 3;
  }

  executeARM(instr) {
    const cond = instr >>> 28;
    if (!this.conditionPassed(cond)) return 1;

    if ((instr & 0x0FFFFFF0) === 0x012FFF10) {
      this._bx(instr);
      return 3;
    }

    if ((instr & 0x0FC000F0) === 0x00000090) {
      this._multiply(instr);
      return 2;
    }

    if ((instr & 0x0E000090) === 0x00000090) {
      if (this._halfwordTransfer(instr)) return 3;
    }

    if ((instr & 0x0F000000) === 0x0F000000) {
      this._swi(instr);
      return 3;
    }

    if ((instr & 0x0E000000) === 0x08000000) {
      this._blockDataTransfer(instr);
      return 4;
    }

    if ((instr & 0x0E000000) === 0x0A000000) {
      this._branch(instr);
      return 3;
    }

    if ((instr & 0x0C000000) === 0x04000000) {
      if (this._singleDataTransfer(instr)) return 3;
    }

    if ((instr & 0x0C000000) === 0x00000000) {
      if (this._dataProcessing(instr)) return 1;
    }

    return 1;
  }

  executeThumb(op) {
    op &= 0xFFFF;

    // Format 1: LSL/LSR/ASR immediate
    if ((op & 0xE000) === 0x0000) {
      const shiftType = (op >>> 11) & 0x3;
      const imm5 = (op >>> 6) & 0x1F;
      const rs = (op >>> 3) & 0x7;
      const rd = op & 0x7;
      let value = this.registers[rs] >>> 0;
      if (shiftType === 0) value = (value << imm5) >>> 0;
      else if (shiftType === 1) value = imm5 === 0 ? 0 : value >>> imm5;
      else if (shiftType === 2) value = imm5 === 0 ? ((value & 0x80000000) ? 0xFFFFFFFF : 0) : this._asr(value, imm5);
      else return 1;
      this.registers[rd] = value;
      this._updateNZ(value);
      return 1;
    }

    // Format 2: add/subtract register/immediate 3
    if ((op & 0xF800) === 0x1800) {
      const immediate = (op >>> 10) & 1;
      const sub = (op >>> 9) & 1;
      const rnOrImm = (op >>> 6) & 0x7;
      const rs = (op >>> 3) & 0x7;
      const rd = op & 0x7;
      const a = this.registers[rs] >>> 0;
      const b = immediate ? rnOrImm : this.registers[rnOrImm] >>> 0;
      const result = sub ? (a - b) >>> 0 : (a + b) >>> 0;
      this.registers[rd] = result;
      sub ? this._subFlags(a,b,result) : this._addFlags(a,b,result);
      return 1;
    }

    // Format 3: MOV/CMP/ADD/SUB immediate 8
    if ((op & 0xE000) === 0x2000) {
      const kind = (op >>> 11) & 0x3;
      const rd = (op >>> 8) & 0x7;
      const imm = op & 0xFF;
      const a = this.registers[rd] >>> 0;
      let result;
      if (kind === 0) {
        result = imm >>> 0;
        this.registers[rd] = result;
        this._updateNZ(result);
      } else if (kind === 1) {
        result = (a - imm) >>> 0;
        this._subFlags(a,imm,result);
      } else if (kind === 2) {
        result = (a + imm) >>> 0;
        this.registers[rd] = result;
        this._addFlags(a,imm,result);
      } else {
        result = (a - imm) >>> 0;
        this.registers[rd] = result;
        this._subFlags(a,imm,result);
      }
      return 1;
    }

    // Format 4: ALU operations
    if ((op & 0xFC00) === 0x4000) {
      const alu = (op >>> 6) & 0xF;
      const rs = (op >>> 3) & 0x7;
      const rd = op & 0x7;
      const a = this.registers[rd] >>> 0;
      const b = this.registers[rs] >>> 0;
      let r = a;
      switch (alu) {
        case 0x0: r = a & b; this.registers[rd]=r; this._updateNZ(r); break;
        case 0x1: r = a ^ b; this.registers[rd]=r; this._updateNZ(r); break;
        case 0x2: r = (a << (b & 0xFF)) >>> 0; this.registers[rd]=r; this._updateNZ(r); break;
        case 0x3: r = b >= 32 ? 0 : a >>> (b & 0xFF); this.registers[rd]=r; this._updateNZ(r); break;
        case 0x4: r = this._asr(a, b & 0xFF); this.registers[rd]=r; this._updateNZ(r); break;
        case 0x8: r = a & b; this._updateNZ(r); break;
        case 0xA: r = (a - b) >>> 0; this._subFlags(a,b,r); break;
        case 0xC: r = a | b; this.registers[rd]=r; this._updateNZ(r); break;
        case 0xD: r = Math.imul(a,b) >>> 0; this.registers[rd]=r; this._updateNZ(r); break;
        case 0xE: r = a & (~b); this.registers[rd]=r; this._updateNZ(r); break;
        case 0xF: r = (~b) >>> 0; this.registers[rd]=r; this._updateNZ(r); break;
        default: break;
      }
      return alu === 0xD ? 2 : 1;
    }

    // Format 5: hi-reg ops / BX
    if ((op & 0xFC00) === 0x4400) {
      const kind = (op >>> 8) & 0x3;
      const h1 = (op >>> 7) & 1;
      const h2 = (op >>> 6) & 1;
      const rs = ((h2 << 3) | ((op >>> 3) & 0x7)) & 0xF;
      const rd = ((h1 << 3) | (op & 0x7)) & 0xF;
      if (kind === 0) {
        this.registers[rd] = (this.registers[rd] + this.registers[rs]) >>> 0;
        if (rd === 15) this.pc &= ~1;
      } else if (kind === 1) {
        const a=this.registers[rd]>>>0,b=this.registers[rs]>>>0,r=(a-b)>>>0;
        this._subFlags(a,b,r);
      } else if (kind === 2) {
        this.registers[rd] = this.registers[rs] >>> 0;
        if (rd === 15) this.pc &= ~1;
      } else {
        const target = this.registers[rs] >>> 0;
        this.setThumb(!!(target & 1));
        this.pc = this.thumb ? (target & ~1) : (target & ~3);
      }
      return 2;
    }

    // Format 9: load/store immediate word/byte
    if ((op & 0xE000) === 0x6000) {
      const byte = (op >>> 12) & 1;
      const load = (op >>> 11) & 1;
      const imm5 = (op >>> 6) & 0x1F;
      const rb = (op >>> 3) & 0x7;
      const rd = op & 0x7;
      const offset = byte ? imm5 : imm5 << 2;
      const addr = (this.registers[rb] + offset) >>> 0;
      if (load) this.registers[rd] = byte ? this.memory.read8(addr) : this.memory.read32(addr);
      else byte ? this.memory.write8(addr,this.registers[rd]) : this.memory.write32(addr,this.registers[rd]);
      return 2;
    }

    // Format 10: load/store halfword
    if ((op & 0xF000) === 0x8000) {
      const load = (op >>> 11) & 1;
      const imm5 = (op >>> 6) & 0x1F;
      const rb = (op >>> 3) & 0x7;
      const rd = op & 0x7;
      const addr = (this.registers[rb] + (imm5 << 1)) >>> 0;
      if (load) this.registers[rd] = this.memory.read16(addr);
      else this.memory.write16(addr, this.registers[rd]);
      return 2;
    }


    // Format 6: PC-relative load
    if ((op & 0xF800) === 0x4800) {
      const rd = (op >>> 8) & 0x7;
      const imm = (op & 0xFF) << 2;
      const base = (this.pc + 2) & ~3;
      this.registers[rd] = this.memory.read32((base + imm) >>> 0);
      return 2;
    }

    // Format 11: SP-relative load/store
    if ((op & 0xF000) === 0x9000) {
      const load = !!((op >>> 11) & 1);
      const rd = (op >>> 8) & 0x7;
      const imm = (op & 0xFF) << 2;
      const addr = (this.registers[13] + imm) >>> 0;
      if (load) this.registers[rd] = this.memory.read32(addr);
      else this.memory.write32(addr, this.registers[rd]);
      return 2;
    }

    // Format 12: load address (PC/SP relative)
    if ((op & 0xF000) === 0xA000) {
      const useSP = !!((op >>> 11) & 1);
      const rd = (op >>> 8) & 0x7;
      const imm = (op & 0xFF) << 2;
      const base = useSP ? this.registers[13] : ((this.pc + 2) & ~3);
      this.registers[rd] = (base + imm) >>> 0;
      return 1;
    }

    // Format 13: add/sub offset to SP
    if ((op & 0xFF00) === 0xB000) {
      const sub = !!((op >>> 7) & 1);
      const imm = (op & 0x7F) << 2;
      this.registers[13] = sub
        ? (this.registers[13] - imm) >>> 0
        : (this.registers[13] + imm) >>> 0;
      return 1;
    }

    // Format 14: PUSH/POP
    if ((op & 0xF600) === 0xB400) {
      const load = !!((op >>> 11) & 1);
      const extra = !!((op >>> 8) & 1);
      const list = op & 0xFF;
      const regs = [];
      for (let r=0;r<8;r++) if (list & (1<<r)) regs.push(r);
      if (!load && extra) regs.push(14);
      if (load && extra) regs.push(15);

      if (!load) {
        for (let i=regs.length-1;i>=0;i--) {
          this.registers[13] = (this.registers[13] - 4) >>> 0;
          this.memory.write32(this.registers[13], this.registers[regs[i]]);
        }
      } else {
        for (const r of regs) {
          this.registers[r] = this.memory.read32(this.registers[13]);
          this.registers[13] = (this.registers[13] + 4) >>> 0;
        }
        if (extra) this.pc = this.registers[15] & ~1;
      }
      return 3;
    }

    // Format 15: multiple load/store
    if ((op & 0xF000) === 0xC000) {
      const load = !!((op >>> 11) & 1);
      const rb = (op >>> 8) & 0x7;
      const list = op & 0xFF;
      let addr = this.registers[rb] >>> 0;
      let count = 0;
      for (let r=0;r<8;r++) {
        if (!(list & (1<<r))) continue;
        if (load) this.registers[r] = this.memory.read32(addr);
        else this.memory.write32(addr, this.registers[r]);
        addr = (addr + 4) >>> 0;
        count++;
      }
      this.registers[rb] = addr;
      return Math.max(1, count);
    }

    // Format 19: long branch with link (duas metades)
    if ((op & 0xF800) === 0xF000) {
      let off = op & 0x7FF;
      if (off & 0x400) off |= 0xFFFFF800;
      this.registers[14] = (this.pc + ((off << 12) | 0)) >>> 0;
      return 1;
    }
    if ((op & 0xF800) === 0xF800) {
      const off = (op & 0x7FF) << 1;
      const target = (this.registers[14] + off) >>> 0;
      this.registers[14] = (this.pc - 2) | 1;
      this.pc = target & ~1;
      return 3;
    }

    // Conditional branch / SWI
    if ((op & 0xF000) === 0xD000) {
      const cond = (op >>> 8) & 0xF;
      const imm8 = op & 0xFF;
      if (cond === 0xF) {
        this.lastException = `THUMB SWI 0x${imm8.toString(16).toUpperCase()}`;
        return 3;
      }
      if (cond !== 0xE && this.conditionPassed(cond)) {
        let off = imm8;
        if (off & 0x80) off |= 0xFFFFFF00;
        this.pc = (this.pc + ((off << 1) | 0)) >>> 0;
      }
      return 2;
    }

    // Unconditional branch
    if ((op & 0xF800) === 0xE000) {
      let off = op & 0x7FF;
      if (off & 0x400) off |= 0xFFFFF800;
      this.pc = (this.pc + ((off << 1) | 0)) >>> 0;
      return 2;
    }

    return 1;
  }

  step() {
    if (this.halted) return 1;

    if (this.thumb) {
      const fetchAddress = this.pc >>> 0;
      const op = this.memory.read16(fetchAddress);
      this.lastInstruction = op;
      this.pc = (this.pc + 2) >>> 0;
      const spent = this.executeThumb(op);
      this.cycles += spent;
      return spent;
    }

    const fetchAddress = this.pc >>> 0;
    const instr = this.memory.read32(fetchAddress);
    this.lastInstruction = instr >>> 0;
    this.pc = (this.pc + 4) >>> 0;
    const spent = this.executeARM(instr);
    this.cycles += spent;
    return spent;
  }
}
