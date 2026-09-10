export class IRQController {
  constructor(memory, cpu) {
    this.memory = memory;
    this.cpu = cpu;
  }

  pending() {
    const ie = this.memory.read16(0x04000200);
    const iff = this.memory.read16(0x04000202);
    const ime = this.memory.read16(0x04000208) & 1;
    const irqDisabled = !!(this.cpu.cpsr & 0x80);
    return !!(ime && !irqDisabled && (ie & iff));
  }

  serviceIfNeeded() {
    if (!this.pending()) return false;
    this.cpu.halted = false;
    this.cpu.waitingForInterrupt = false;
    // IRQ simplificado: salvar retorno em LR e pular para vetor 0x18.
    this.cpu.spsr_irq = this.cpu.cpsr >>> 0;
    this.cpu.registers[14] = (this.cpu.pc + (this.cpu.thumb ? 2 : 4)) >>> 0;
    this.cpu.cpsr = (this.cpu.cpsr & ~0x3F) | 0x12;
    this.cpu.cpsr |= 0x80;
    this.cpu.setThumb(false);
    this.cpu.pc = 0x00000018;
    this.cpu.lastException = "IRQ";
    return true;
  }
}
