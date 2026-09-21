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
    this.waitstate = null;
    this.waitingForInterrupt = false;
    this.unsupportedInstructions = 0;
    this.lastFetchAddress = null;
    this.bankedSP_irq = 0x03007FA0;
    this.bankedLR_irq = 0;
    this.userSP = 0x03007F00;
    this.userLR = 0;
    this.hleIRQActive = false;
    this.hleIRQReturnPC = 0;
    this.hleIRQReturnCPSR = 0;
    this.hleIRQReturnSentinel = 0x00003FF0;
    this.hleIRQSavedRegs = null;
    this.hleIRQMask = 0;
    this.irqWaitMask = 0;
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
    this.waitingForInterrupt = false;
    this.unsupportedInstructions = 0;
    this.lastFetchAddress = null;
    this.bankedSP_irq = 0x03007FA0;
    this.bankedLR_irq = 0;
    this.userSP = 0x03007F00;
    this.userLR = 0;
    this.hleIRQActive = false;
    this.hleIRQReturnPC = 0;
    this.hleIRQReturnCPSR = 0;
    this.hleIRQSavedRegs = null;
    this.hleIRQMask = 0;
    this.irqWaitMask = 0;
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

  // During execute*, PC has already advanced to the next instruction. ARM code
  // observes current+8 and THUMB current+4, so one extra prefetch width is added.
  _architecturalPC(extra = 0) {
    const prefetch = this.thumb ? 2 : 4;
    return (this.pc + prefetch + extra) >>> 0;
  }

  _readReg(index, { registerShift = false, store = false } = {}) {
    index &= 0xF;
    if (index !== 15) return this.registers[index] >>> 0;
    // ARM register-shifted operands and STR/STM of r15 observe an additional
    // pipeline word on ARM7TDMI. THUMB never uses those ARM encodings.
    const extra = !this.thumb && (registerShift || store) ? 4 : 0;
    return this._architecturalPC(extra);
  }

  _finishHLEIRQ() {
    if (!this.hleIRQActive) return false;
    if (this.hleIRQSavedRegs) {
      for (const r of [0,1,2,3,12]) this.registers[r] = this.hleIRQSavedRegs[r] >>> 0;
    }
    this.bankedSP_irq = this.registers[13] >>> 0;
    if (this.hleIRQMask) this.memory.write16(0x04000202, this.hleIRQMask);
    this.cpsr = this.hleIRQReturnCPSR >>> 0;
    this.setThumb(!!(this.cpsr & 0x20));
    this.registers[13] = this.userSP >>> 0;
    this.registers[14] = this.userLR >>> 0;
    this.pc = this.thumb ? (this.hleIRQReturnPC & ~1) >>> 0 : (this.hleIRQReturnPC & ~3) >>> 0;
    this.hleIRQActive = false;
    this.hleIRQSavedRegs = null;
    this.hleIRQMask = 0;
    this.lastException = 'IRQ HLE return';
    return true;
  }

  _isHLEIRQReturnTarget(target) {
    return this.hleIRQActive && ((target & ~3) >>> 0) === (this.hleIRQReturnSentinel >>> 0);
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

  _addWithCarry(a, b, carryIn = 0) {
    a >>>= 0; b >>>= 0; carryIn &= 1;
    const unsigned = a + b + carryIn;
    const result = unsigned >>> 0;
    const signed = (a | 0) + (b | 0) + carryIn;
    return { result, carry: unsigned > 0xFFFFFFFF, overflow: signed > 0x7FFFFFFF || signed < -0x80000000 };
  }

  _applyArithmeticFlags(meta) {
    this._updateNZ(meta.result);
    this.setFlag(0x20000000, !!meta.carry);
    this.setFlag(0x10000000, !!meta.overflow);
  }

  _shiftWithCarry(value, type, amount, byRegister = false) {
    value >>>= 0;
    const oldCarry = this.getFlag(0x20000000) ? 1 : 0;
    if (byRegister && amount === 0) return { value, carry: oldCarry };
    if (!byRegister && amount === 0) {
      if (type === 0) return { value, carry: oldCarry };
      if (type === 1) return { value:0, carry:(value>>>31)&1 };
      if (type === 2) return { value:(value&0x80000000)?0xFFFFFFFF:0, carry:(value>>>31)&1 };
      return { value:((oldCarry<<31)|(value>>>1))>>>0, carry:value&1 }; // RRX
    }
    if (type === 0) {
      if (amount < 32) return { value:(value<<amount)>>>0, carry:(value>>>(32-amount))&1 };
      if (amount === 32) return { value:0, carry:value&1 };
      return { value:0, carry:0 };
    }
    if (type === 1) {
      if (amount < 32) return { value:value>>>amount, carry:(value>>>(amount-1))&1 };
      if (amount === 32) return { value:0, carry:(value>>>31)&1 };
      return { value:0, carry:0 };
    }
    if (type === 2) {
      if (amount < 32) return { value:this._asr(value,amount), carry:(value>>>(amount-1))&1 };
      const c=(value>>>31)&1; return { value:c?0xFFFFFFFF:0, carry:c };
    }
    amount &= 31;
    if (amount === 0) return { value, carry:(value>>>31)&1 };
    const out=this._ror(value,amount);
    return { value:out, carry:(out>>>31)&1 };
  }

  _decodeOperand2Details(instr) {
    const oldCarry=this.getFlag(0x20000000)?1:0;
    if ((instr >>> 25) & 1) {
      const imm=instr&0xFF, rot=((instr>>>8)&0xF)*2, value=this._ror(imm,rot);
      return { value, carry:rot ? ((value>>>31)&1) : oldCarry };
    }
    const rm=instr&0xF, type=(instr>>>5)&3, byRegister=!!((instr>>>4)&1);
    const value=this._readReg(rm,{registerShift:byRegister});
    const amount=byRegister ? (this.registers[(instr>>>8)&0xF]&0xFF) : ((instr>>>7)&0x1F);
    return this._shiftWithCarry(value,type,amount,byRegister);
  }

  _decodeOperand2(instr) {
    return this._decodeOperand2Details(instr).value >>> 0;
  }

  _updateNZ(result) {
    result >>>= 0;
    this.setFlag(0x80000000, !!(result & 0x80000000));
    this.setFlag(0x40000000, result === 0);
  }

  _dataProcessing(instr) {
    const opcode=(instr>>>21)&0xF, setFlags=!!((instr>>>20)&1), rn=(instr>>>16)&0xF, rd=(instr>>>12)&0xF;
    const a=this._readReg(rn), sh=this._decodeOperand2Details(instr), b=sh.value>>>0;
    const carryIn=this.getFlag(0x20000000)?1:0;
    let result=0, write=true, arithmetic=null, logical=false;
    switch(opcode){
      case 0x0: result=a&b; logical=true; break; // AND
      case 0x1: result=a^b; logical=true; break; // EOR
      case 0x2: arithmetic=this._addWithCarry(a,(~b)>>>0,1); result=arithmetic.result; break; // SUB
      case 0x3: arithmetic=this._addWithCarry(b,(~a)>>>0,1); result=arithmetic.result; break; // RSB
      case 0x4: arithmetic=this._addWithCarry(a,b,0); result=arithmetic.result; break; // ADD
      case 0x5: arithmetic=this._addWithCarry(a,b,carryIn); result=arithmetic.result; break; // ADC
      case 0x6: arithmetic=this._addWithCarry(a,(~b)>>>0,carryIn); result=arithmetic.result; break; // SBC
      case 0x7: arithmetic=this._addWithCarry(b,(~a)>>>0,carryIn); result=arithmetic.result; break; // RSC
      case 0x8: result=a&b; write=false; logical=true; break; // TST
      case 0x9: result=a^b; write=false; logical=true; break; // TEQ
      case 0xA: arithmetic=this._addWithCarry(a,(~b)>>>0,1); result=arithmetic.result; write=false; break; // CMP
      case 0xB: arithmetic=this._addWithCarry(a,b,0); result=arithmetic.result; write=false; break; // CMN
      case 0xC: result=a|b; logical=true; break; // ORR
      case 0xD: result=b; logical=true; break; // MOV
      case 0xE: result=a&(~b); logical=true; break; // BIC
      case 0xF: result=(~b)>>>0; logical=true; break; // MVN
      default:return false;
    }
    const flags=setFlags || !write;
    if(flags){
      if(arithmetic)this._applyArithmeticFlags(arithmetic);
      else {this._updateNZ(result); if(logical)this.setFlag(0x20000000,!!sh.carry);}
    }
    if(write){
      this.registers[rd]=result>>>0;
      if(rd===15){
        if (this._isHLEIRQReturnTarget(result)) { this._finishHLEIRQ(); return true; }
        if(setFlags && (this.cpsr&0x1F)===0x12){this.cpsr=this.spsr_irq>>>0;this.setThumb(!!(this.cpsr&0x20));this.registers[13]=this.userSP>>>0;this.registers[14]=this.userLR>>>0;}
        this.pc=this.thumb?(this.pc&~1):(this.pc&~3);
      }
    }
    return true;
  }

  _branch(instr) {
    const link = ((instr >>> 24) & 1) !== 0;
    let off = instr & 0x00FFFFFF;
    if (off & 0x00800000) off |= 0xFF000000;
    off = (off << 2) | 0;
    // step() has advanced PC by four bytes; ARM branches use current+8.
    const architecturalPC = this._architecturalPC();
    if (link) this.registers[14] = this.pc >>> 0; // address of next ARM instruction
    this.pc = (architecturalPC + off) >>> 0;
    return true;
  }

  _bx(instr) {
    const rm = instr & 0xF;
    const target = this._readReg(rm) >>> 0;
    if (this._isHLEIRQReturnTarget(target) || (this.hleIRQActive && target === 0)) { this._finishHLEIRQ(); return true; }
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

  _multiplyLong(instr) {
    const signed=!!((instr>>>22)&1), accumulate=!!((instr>>>21)&1), setFlags=!!((instr>>>20)&1);
    const rdHi=(instr>>>16)&0xF, rdLo=(instr>>>12)&0xF, rs=(instr>>>8)&0xF, rm=instr&0xF;
    let a=BigInt(this.registers[rm]>>>0), b=BigInt(this.registers[rs]>>>0);
    if(signed){if(a&0x80000000n)a-=0x100000000n;if(b&0x80000000n)b-=0x100000000n;}
    let v=a*b;
    if(accumulate){const cur=(BigInt(this.registers[rdHi]>>>0)<<32n)|BigInt(this.registers[rdLo]>>>0);v+=cur;}
    v=BigInt.asUintN(64,v);
    this.registers[rdLo]=Number(v&0xFFFFFFFFn)>>>0;this.registers[rdHi]=Number((v>>32n)&0xFFFFFFFFn)>>>0;
    if(setFlags){this.setFlag(0x80000000,!!(v&0x8000000000000000n));this.setFlag(0x40000000,v===0n);}
    return true;
  }

  _swap(instr){
    const byte=!!((instr>>>22)&1), rn=(instr>>>16)&0xF, rd=(instr>>>12)&0xF, rm=instr&0xF, addr=this.registers[rn]>>>0;
    const old=byte?this.memory.read8(addr):this.memory.read32(addr);
    if(byte)this.memory.write8(addr,this.registers[rm]);else this.memory.write32(addr,this.registers[rm]);
    this.registers[rd]=old>>>0;return true;
  }

  _psrTransfer(instr){
    const isMRS=(instr&0x0FBF0FFF)===0x010F0000;
    if(isMRS){const rd=(instr>>>12)&0xF,useSpsr=!!(instr&(1<<22));this.registers[rd]=(useSpsr?this.spsr_irq:this.cpsr)>>>0;return true;}
    const isMSRReg=(instr&0x0DB0FFF0)===0x0120F000, isMSRImm=(instr&0x0DB0F000)===0x0320F000;
    if(!isMSRReg&&!isMSRImm)return false;
    const useSpsr=!!(instr&(1<<22)), fieldMask=(instr>>>16)&0xF;
    let value=isMSRImm?this._decodeOperand2(instr):this._readReg(instr&0xF), mask=0;
    if(fieldMask&1)mask|=0x000000FF;if(fieldMask&2)mask|=0x0000FF00;if(fieldMask&4)mask|=0x00FF0000;if(fieldMask&8)mask|=0xFF000000;
    if(useSpsr)this.spsr_irq=((this.spsr_irq&~mask)|(value&mask))>>>0;
    else {this.cpsr=((this.cpsr&~mask)|(value&mask))>>>0;this.setThumb(!!(this.cpsr&0x20));}
    return true;
  }

  enterIRQ(options = {}){
    const { hle = false, handler = 0, mask = 0 } = options || {};
    if((this.cpsr&0x1F)!==0x12){this.userSP=this.registers[13]>>>0;this.userLR=this.registers[14]>>>0;}
    this.spsr_irq=this.cpsr>>>0;
    // IRQ LR points four bytes beyond the next instruction; SUBS pc,lr,#4
    // therefore resumes exactly at the interrupted next instruction.
    this.bankedLR_irq=(this.pc+4)>>>0;
    this.registers[13]=this.bankedSP_irq>>>0;this.registers[14]=this.bankedLR_irq>>>0;
    this.cpsr=((this.cpsr&~0x3F)|0x12|0x80)>>>0;this.setThumb(false);
    this.halted=false;this.waitingForInterrupt=false;
    if (hle && handler) {
      this.hleIRQActive = true;
      this.hleIRQReturnPC = (this.bankedLR_irq - 4) >>> 0;
      this.hleIRQReturnCPSR = this.spsr_irq >>> 0;
      this.hleIRQSavedRegs = {};
      this.hleIRQMask = mask & 0x3FFF;
      for (const r of [0,1,2,3,12]) this.hleIRQSavedRegs[r] = this.registers[r] >>> 0;
      this.registers[14] = this.hleIRQReturnSentinel >>> 0;
      this.setThumb(!!(handler & 1));
      this.pc = this.thumb ? (handler & ~1) >>> 0 : (handler & ~3) >>> 0;
      this.lastException='IRQ HLE';
      return;
    }
    this.pc=0x18;this.lastException='IRQ';
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
    const offset = immediateOffset ? (instr & 0xFFF) : this._decodeOperand2Details(instr & ~(1<<25)).value;
    const base = this._readReg(rn);
    const indexed = up ? (base + offset) >>> 0 : (base - offset) >>> 0;
    const addr = pre ? indexed : base;
    if (load) {
      this.registers[rd] = byte ? this.memory.read8(addr) : this.memory.read32(addr);
      if (rd === 15) this.pc &= ~3;
    } else {
      const value = this._readReg(rd,{store:true});
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

    const base = this._readReg(rn);
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
      if (!sign && half) this.memory.write16(addr, this._readReg(rd,{store:true}));
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

    const base = this._readReg(rn);
    const count = regs.length;
    let addr;

    if (up) addr = pre ? (base + 4) >>> 0 : base;
    else addr = pre ? (base - 4*count) >>> 0 : (base - 4*(count-1)) >>> 0;

    for (const r of regs) {
      if (load) this.registers[r] = this.memory.read32(addr);
      else this.memory.write32(addr, this._readReg(r,{store:true}));
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

    if ((instr & 0x0F8000F0) === 0x00800090) { this._multiplyLong(instr); return 3; }
    if ((instr & 0x0FB00FF0) === 0x01000090) { this._swap(instr); return 3; }
    if (this._psrTransfer(instr)) return 1;
    if ((instr & 0x0FC000F0) === 0x00000090) { this._multiply(instr); return 2; }

    if ((instr & 0x0E000090) === 0x00000090) {
      if (this._halfwordTransfer(instr)) return 3;
    }

    if ((instr & 0x0F000000) === 0x0F000000) return this._swi(instr);

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

    this.unsupportedInstructions++;
    this.lastException = `ARM não implementada 0x${(instr>>>0).toString(16).toUpperCase().padStart(8,"0")}`;
    return 1;
  }

  executeThumb(op) {
    op &= 0xFFFF;

    // Format 1: LSL/LSR/ASR immediate
    if ((op & 0xE000) === 0x0000) {
      const shiftType=(op>>>11)&3, imm5=(op>>>6)&0x1F, rs=(op>>>3)&7, rd=op&7;
      if(shiftType===3)return 1;
      const sh=this._shiftWithCarry(this.registers[rs],shiftType,imm5,false);
      this.registers[rd]=sh.value;this._updateNZ(sh.value);this.setFlag(0x20000000,!!sh.carry);return 1;
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
      const alu=(op>>>6)&0xF, rs=(op>>>3)&7, rd=op&7, a=this.registers[rd]>>>0, b=this.registers[rs]>>>0;
      let r=a, meta=null, sh=null;
      switch(alu){
        case 0x0:r=a&b;this.registers[rd]=r;this._updateNZ(r);break;
        case 0x1:r=a^b;this.registers[rd]=r;this._updateNZ(r);break;
        case 0x2:sh=this._shiftWithCarry(a,0,b&0xFF,true);this.registers[rd]=sh.value;this._updateNZ(sh.value);this.setFlag(0x20000000,!!sh.carry);break;
        case 0x3:sh=this._shiftWithCarry(a,1,b&0xFF,true);this.registers[rd]=sh.value;this._updateNZ(sh.value);this.setFlag(0x20000000,!!sh.carry);break;
        case 0x4:sh=this._shiftWithCarry(a,2,b&0xFF,true);this.registers[rd]=sh.value;this._updateNZ(sh.value);this.setFlag(0x20000000,!!sh.carry);break;
        case 0x5:meta=this._addWithCarry(a,b,this.getFlag(0x20000000)?1:0);this.registers[rd]=meta.result;this._applyArithmeticFlags(meta);break;
        case 0x6:meta=this._addWithCarry(a,(~b)>>>0,this.getFlag(0x20000000)?1:0);this.registers[rd]=meta.result;this._applyArithmeticFlags(meta);break;
        case 0x7:sh=this._shiftWithCarry(a,3,b&0xFF,true);this.registers[rd]=sh.value;this._updateNZ(sh.value);this.setFlag(0x20000000,!!sh.carry);break;
        case 0x8:r=a&b;this._updateNZ(r);break;
        case 0x9:meta=this._addWithCarry(0,(~b)>>>0,1);this.registers[rd]=meta.result;this._applyArithmeticFlags(meta);break;
        case 0xA:meta=this._addWithCarry(a,(~b)>>>0,1);this._applyArithmeticFlags(meta);break;
        case 0xB:meta=this._addWithCarry(a,b,0);this._applyArithmeticFlags(meta);break;
        case 0xC:r=a|b;this.registers[rd]=r;this._updateNZ(r);break;
        case 0xD:r=Math.imul(a,b)>>>0;this.registers[rd]=r;this._updateNZ(r);break;
        case 0xE:r=a&(~b);this.registers[rd]=r;this._updateNZ(r);break;
        case 0xF:r=(~b)>>>0;this.registers[rd]=r;this._updateNZ(r);break;
      }
      return alu===0xD?2:1;
    }

    // Format 5: hi-reg ops / BX
    if ((op & 0xFC00) === 0x4400) {
      const kind = (op >>> 8) & 0x3;
      const h1 = (op >>> 7) & 1;
      const h2 = (op >>> 6) & 1;
      const rs = ((h2 << 3) | ((op >>> 3) & 0x7)) & 0xF;
      const rd = ((h1 << 3) | (op & 0x7)) & 0xF;
      if (kind === 0) {
        const result=(this._readReg(rd)+this._readReg(rs))>>>0;
        if (rd === 15 && this._isHLEIRQReturnTarget(result)) this._finishHLEIRQ();
        else { this.registers[rd]=result; if (rd === 15) this.pc &= ~1; }
      } else if (kind === 1) {
        const a=this._readReg(rd),b=this._readReg(rs),r=(a-b)>>>0;
        this._subFlags(a,b,r);
      } else if (kind === 2) {
        const result=this._readReg(rs);
        if (rd === 15 && this._isHLEIRQReturnTarget(result)) this._finishHLEIRQ();
        else { this.registers[rd] = result >>> 0; if (rd === 15) this.pc &= ~1; }
      } else {
        const target = this._readReg(rs) >>> 0;
        if (this._isHLEIRQReturnTarget(target)) this._finishHLEIRQ();
        else { this.setThumb(!!(target & 1)); this.pc = this.thumb ? (target & ~1) : (target & ~3); }
      }
      return 2;
    }

    // Formats 7/8: register-offset and signed/halfword transfers
    if ((op & 0xF000) === 0x5000) {
      const ro=(op>>>6)&7, rb=(op>>>3)&7, rd=op&7, addr=(this.registers[rb]+this.registers[ro])>>>0;
      if (!(op & 0x0200)) {
        const load=!!(op&0x0800), byte=!!(op&0x0400);
        if(load)this.registers[rd]=byte?this.memory.read8(addr):this.memory.read32(addr);
        else if(byte)this.memory.write8(addr,this.registers[rd]);else this.memory.write32(addr,this.registers[rd]);
      } else {
        const h=!!(op&0x0800), sign=!!(op&0x0400);
        if(!h&&!sign)this.memory.write16(addr,this.registers[rd]);
        else if(!h&&sign){const v=this.memory.read8(addr);this.registers[rd]=(v&0x80)?(v|0xFFFFFF00)>>>0:v;}
        else if(h&&!sign)this.registers[rd]=this.memory.read16(addr);
        else {const v=this.memory.read16(addr);this.registers[rd]=(v&0x8000)?(v|0xFFFF0000)>>>0:v;}
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
        if (extra) {
          const target=this.registers[15]>>>0;
          if (this._isHLEIRQReturnTarget(target)) this._finishHLEIRQ();
          else this.pc = target & ~1;
        }
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
      this.registers[14] = (this._architecturalPC() + ((off << 12) | 0)) >>> 0;
      return 1;
    }
    if ((op & 0xF800) === 0xF800) {
      const off = (op & 0x7FF) << 1;
      const target = (this.registers[14] + off) >>> 0;
      this.registers[14] = (this.pc | 1) >>> 0;
      this.pc = target & ~1;
      return 3;
    }

    // Conditional branch / SWI
    if ((op & 0xF000) === 0xD000) {
      const cond = (op >>> 8) & 0xF;
      const imm8 = op & 0xFF;
      if (cond === 0xF) {
        this.lastException = `THUMB SWI 0x${imm8.toString(16).toUpperCase()}`;
        return this.biosHLE ? this.biosHLE.swi(imm8) : 3;
      }
      if (cond !== 0xE && this.conditionPassed(cond)) {
        let off = imm8;
        if (off & 0x80) off |= 0xFFFFFF00;
        this.pc = (this._architecturalPC() + ((off << 1) | 0)) >>> 0;
      }
      return 2;
    }

    // Unconditional branch
    if ((op & 0xF800) === 0xE000) {
      let off = op & 0x7FF;
      if (off & 0x400) off |= 0xFFFFF800;
      this.pc = (this._architecturalPC() + ((off << 1) | 0)) >>> 0;
      return 2;
    }

    this.unsupportedInstructions++;
    this.lastException = `THUMB não implementada 0x${op.toString(16).toUpperCase().padStart(4,"0")}`;
    return 1;
  }

  step() {
    if (this.halted) return 1;
    const width=this.thumb?16:32, fetchAddress=this.pc>>>0;
    const sequential=this.lastFetchAddress!==null && fetchAddress===((this.lastFetchAddress+(width>>>3))>>>0);
    const wait=this.waitstate?.accessCycles?.(fetchAddress,sequential,width) || 1;
    this.lastFetchAddress=fetchAddress;
    if (this.thumb) {
      const op=this.memory.read16(fetchAddress);this.lastInstruction=op;this.pc=(this.pc+2)>>>0;
      const spent=Math.max(1,this.executeThumb(op)+(wait-1));this.cycles+=spent;return spent;
    }
    const instr=this.memory.read32(fetchAddress);this.lastInstruction=instr>>>0;this.pc=(this.pc+4)>>>0;
    const spent=Math.max(1,this.executeARM(instr)+(wait-1));this.cycles+=spent;return spent;
  }
}
