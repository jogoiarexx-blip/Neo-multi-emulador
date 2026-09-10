export class WaitStateControl {
  constructor(memory) {
    this.memory = memory;
  }

  get waitcnt() { return this.memory.read16(0x04000204); }

  accessCycles(address, sequential=false, width=32) {
    const top = address >>> 24;
    if (top < 0x08 || top > 0x0D) return 1;

    const w = this.waitcnt;
    const firstTable = [4,3,2,8];
    const s0 = firstTable[(w>>>2)&3];
    const s1 = firstTable[(w>>>5)&3];
    const s2 = firstTable[(w>>>8)&3];
    let base = top <= 0x09 ? s0 : top <= 0x0B ? s1 : s2;

    if (sequential) {
      if (top <= 0x09) base = (w&(1<<4)) ? 1 : 2;
      else if (top <= 0x0B) base = (w&(1<<7)) ? 1 : 4;
      else base = (w&(1<<10)) ? 1 : 8;
    }
    return width === 32 ? base * 2 : base;
  }
}
