export class GBAMemory {
  constructor() {
    this.bios = new Uint8Array(0x4000);
    this.ewram = new Uint8Array(0x40000);
    this.iwram = new Uint8Array(0x8000);
    this.io = new Uint8Array(0x400);
    this.palette = new Uint8Array(0x400);
    this.vram = new Uint8Array(0x18000);
    this.oam = new Uint8Array(0x400);
    this.rom = new Uint8Array(0);
    this.sram = new Uint8Array(0x10000);
    this.apu = null;
    this.saveMemory = null;
  }

  loadROM(bytes) {
    this.rom = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  }

  reset() {
    this.ewram.fill(0);
    this.iwram.fill(0);
    this.io.fill(0);
    this.palette.fill(0);
    this.vram.fill(0);
    this.oam.fill(0);
  }

  region(address) {
    const top = address >>> 24;
    switch (top) {
      case 0x00: return "BIOS";
      case 0x02: return "EWRAM";
      case 0x03: return "IWRAM";
      case 0x04: return "IO";
      case 0x05: return "PALETTE";
      case 0x06: return "VRAM";
      case 0x07: return "OAM";
      case 0x08:
      case 0x09:
      case 0x0A:
      case 0x0B:
      case 0x0C:
      case 0x0D: return "ROM";
      case 0x0E: return "SRAM";
      default: return "UNMAPPED";
    }
  }

  _map(address) {
    address >>>= 0;
    const top = address >>> 24;

    switch (top) {
      case 0x00:
        if (address < 0x4000) return [this.bios, address];
        break;
      case 0x02:
        return [this.ewram, (address - 0x02000000) & 0x3FFFF];
      case 0x03:
        return [this.iwram, (address - 0x03000000) & 0x7FFF];
      case 0x04:
        return [this.io, (address - 0x04000000) & 0x3FF];
      case 0x05:
        return [this.palette, (address - 0x05000000) & 0x3FF];
      case 0x06: {
        let off = (address - 0x06000000) & 0x1FFFF;
        if (off >= 0x18000) off -= 0x8000; // espelhamento principal da VRAM
        return [this.vram, off];
      }
      case 0x07:
        return [this.oam, (address - 0x07000000) & 0x3FF];
      case 0x08:
      case 0x09:
      case 0x0A:
      case 0x0B:
      case 0x0C:
      case 0x0D: {
        if (!this.rom.length) return null;
        const off = (address - 0x08000000) & 0x01FFFFFF;
        return [this.rom, off % this.rom.length];
      }
      case 0x0E:
      case 0x0F:
        if (this.saveMemory) return null;
        return [this.sram, (address - 0x0E000000) & 0xFFFF];
    }
    return null;
  }

  read8(address) {
    address >>>= 0;
    if ((address >>> 24) >= 0x0E && this.saveMemory) return this.saveMemory.read8(address);
    const m = this._map(address);
    return m ? m[0][m[1]] : 0;
  }

  read16(address) {
    address &= ~1;
    return this.read8(address) | (this.read8(address + 1) << 8);
  }

  read32(address) {
    address &= ~3;
    return (this.read8(address) |
      (this.read8(address + 1) << 8) |
      (this.read8(address + 2) << 16) |
      (this.read8(address + 3) << 24)) >>> 0;
  }

  write8(address, value) {
    address >>>= 0;
    if ((address >>> 24) >= 0x0E && this.saveMemory) { this.saveMemory.write8(address,value); return; }
    value &= 0xFF;
    const top = address >>> 24;
    // ROM/BIOS ignoram escrita nessa etapa.
    if (top === 0x00 || (top >= 0x08 && top <= 0x0D)) return;
    const m = this._map(address);
    if (m) m[0][m[1]] = value;
  }

  write16(address, value) {
    address &= ~1;
    this.write8(address, value);
    this.write8(address + 1, value >>> 8);
  }

  write32(address, value) {
    address >>>= 0;
    if (address === 0x040000A0 && this.apu) { this.apu.pushFIFO("A", value>>>0); return; }
    if (address === 0x040000A4 && this.apu) { this.apu.pushFIFO("B", value>>>0); return; }
    address &= ~3;
    this.write8(address, value);
    this.write8(address + 1, value >>> 8);
    this.write8(address + 2, value >>> 16);
    this.write8(address + 3, value >>> 24);
  }
}
