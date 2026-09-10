export class SaveMemory {
  constructor(memory) {
    this.memory = memory;
    this.type = "SRAM";
    this.size = 0x10000;
    this.data = new Uint8Array(this.size);
    this.flashIdMode = false;
    this.flashCommandStage = 0;
    this.eepromBits = [];
  }

  detectFromROM(bytes) {
    const text = new TextDecoder("ascii").decode(bytes);
    if (text.includes("EEPROM_V")) this.configure("EEPROM");
    else if (text.includes("FLASH1M_V")) this.configure("FLASH1M");
    else if (text.includes("FLASH512_V") || text.includes("FLASH_V")) this.configure("FLASH512");
    else if (text.includes("SRAM_V")) this.configure("SRAM");
    else this.configure("SRAM");
    return this.type;
  }

  configure(type) {
    this.type = type;
    this.size = type === "FLASH1M" ? 0x20000 : type === "EEPROM" ? 0x2000 : 0x10000;
    this.data = new Uint8Array(this.size);
  }

  read8(address) {
    const off = address & (this.size - 1);
    if (this.flashIdMode && (this.type === "FLASH512" || this.type === "FLASH1M")) {
      if (off === 0) return 0xC2;
      if (off === 1) return this.type === "FLASH1M" ? 0x09 : 0x1C;
    }
    return this.data[off];
  }

  write8(address, value) {
    const off = address & (this.size - 1);
    value &= 0xFF;

    if (this.type === "SRAM") {
      this.data[off] = value;
      return;
    }

    if (this.type.startsWith("FLASH")) {
      if (this.flashCommandStage === 0 && off === 0x5555 && value === 0xAA) {
        this.flashCommandStage = 1; return;
      }
      if (this.flashCommandStage === 1 && off === 0x2AAA && value === 0x55) {
        this.flashCommandStage = 2; return;
      }
      if (this.flashCommandStage === 2) {
        if (off === 0x5555 && value === 0x90) { this.flashIdMode = true; this.flashCommandStage = 0; return; }
        if (off === 0x5555 && value === 0xF0) { this.flashIdMode = false; this.flashCommandStage = 0; return; }
        if (off === 0x5555 && value === 0xA0) { this.flashCommandStage = 3; return; }
        if (off === 0x5555 && value === 0x80) { this.flashCommandStage = 4; return; }
        this.flashCommandStage = 0;
      } else if (this.flashCommandStage === 3) {
        this.data[off] = value;
        this.flashCommandStage = 0;
        return;
      } else if (this.flashCommandStage === 4) {
        // simplified chip erase sequence
        if (value === 0x10 && off === 0x5555) this.data.fill(0xFF);
        this.flashCommandStage = 0;
        return;
      }
    } else {
      this.data[off] = value;
    }
  }

  exportBytes() { return this.data.slice(); }
  importBytes(bytes) {
    this.data.fill(0);
    this.data.set(bytes.subarray(0, this.data.length));
  }
}
