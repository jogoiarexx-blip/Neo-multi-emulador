export class IRQController {
  constructor(memory, cpu) {
    this.memory = memory;
    this.cpu = cpu;
  }

  rawPendingMask() {
    const ie = this.memory.read16(0x04000200);
    const iff = this.memory.read16(0x04000202);
    return ie & iff & 0x3FFF;
  }

  pendingMask() {
    const ime = this.memory.read16(0x04000208) & 1;
    return ime ? this.rawPendingMask() : 0;
  }

  pending() {
    const irqDisabled = !!(this.cpu.cpsr & 0x80);
    return !irqDisabled && this.pendingMask() !== 0;
  }

  _recordBIOSIRQ(mask) {
    // The real BIOS accumulates serviced IRQ flags in IWRAM at 0x03007FF8.
    // IntrWait/VBlankIntrWait use this software flag rather than raw IF.
    const old = this.memory.read16(0x03007FF8);
    this.memory.write16(0x03007FF8, old | (mask & 0x3FFF));
  }

  serviceIfNeeded() {
    const rawMask = this.rawPendingMask();
    if (rawMask) {
      const waitMask = this.cpu.irqWaitMask >>> 0;
      if (!this.cpu.waitingForInterrupt || !waitMask || (rawMask & waitMask)) {
        this.cpu.halted = false;
        this.cpu.waitingForInterrupt = false;
        this.cpu.irqWaitMask = 0;
      }
    }

    const mask = this.pendingMask();
    if (!mask || (this.cpu.cpsr & 0x80)) return false;

    if (!this.memory.biosLoaded) {
      // HLE the small BIOS IRQ dispatcher: remember/ack IF and call the user
      // handler pointer stored by most GBA runtimes at 0x03007FFC.
      this._recordBIOSIRQ(mask);
      const handler = this.memory.read32(0x03007FFC) >>> 0;
      if (handler) this.cpu.enterIRQ({ hle: true, handler, mask });
      else { this.memory.write16(0x04000202, mask); this.cpu.lastException = 'IRQ HLE (sem handler)'; }
      return true;
    }

    if (typeof this.cpu.enterIRQ === 'function') this.cpu.enterIRQ();
    return true;
  }
}
