export class GBAMemory {
  constructor() {
    this.bios = new Uint8Array(0x4000);
    this.biosLoaded = false;
    this.ewram = new Uint8Array(0x40000);
    this.iwram = new Uint8Array(0x8000);
    this.io = new Uint8Array(0x400);
    this.palette = new Uint8Array(0x400);
    this.vram = new Uint8Array(0x18000);
    this.oam = new Uint8Array(0x400);
    this.rom = new Uint8Array(0);
    this.sram = new Uint8Array(0x10000);
    this.sram.fill(0xFF);
    this.apu = null;
    this.saveMemory = null;
    this.timerController = null;
    this.dmaController = null;
    this.reset();
  }

  loadROM(bytes) {
    this.rom = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  }

  loadBIOS(bytes) {
    const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.bios.fill(0);
    this.bios.set(src.subarray(0, this.bios.length));
    this.biosLoaded = src.length >= 0x4000;
  }

  reset() {
    this.ewram.fill(0);
    this.iwram.fill(0);
    this.io.fill(0);
    this.palette.fill(0);
    this.vram.fill(0);
    this.oam.fill(0);
    // KEYINPUT is active-low and boots with every key released.
    this.writeIO16Raw(0x130, 0x03FF);
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
      case 0x0D: return this.saveMemory?.type === "EEPROM" && top === 0x0D ? "EEPROM" : "ROM";
      case 0x0E:
      case 0x0F: return "SRAM";
      default: return "UNMAPPED";
    }
  }

  readIO16Raw(offset) {
    offset &= 0x3FE;
    return this.io[offset] | (this.io[offset + 1] << 8);
  }

  writeIO16Raw(offset, value) {
    offset &= 0x3FE;
    this.io[offset] = value & 0xFF;
    this.io[offset + 1] = (value >>> 8) & 0xFF;
  }

  requestIRQ(mask) {
    this.writeIO16Raw(0x202, this.readIO16Raw(0x202) | (mask & 0x3FFF));
  }

  setKeyInput(value) {
    this.writeIO16Raw(0x130, value & 0x03FF);
  }

  _map(address) {
    address >>>= 0;
    const top = address >>> 24;
    switch (top) {
      case 0x00:
        if (address < 0x4000) return [this.bios, address];
        break;
      case 0x02: return [this.ewram, (address - 0x02000000) & 0x3FFFF];
      case 0x03: return [this.iwram, (address - 0x03000000) & 0x7FFF];
      case 0x04: return [this.io, (address - 0x04000000) & 0x3FF];
      case 0x05: return [this.palette, (address - 0x05000000) & 0x3FF];
      case 0x06: {
        let off = (address - 0x06000000) & 0x1FFFF;
        if (off >= 0x18000) off -= 0x8000;
        return [this.vram, off];
      }
      case 0x07: return [this.oam, (address - 0x07000000) & 0x3FF];
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

  _isEEPROM(address) {
    return this.saveMemory?.type === "EEPROM" && (address >>> 24) === 0x0D;
  }

  read8(address) {
    address >>>= 0;
    if ((address >>> 24) >= 0x0E && this.saveMemory) return this.saveMemory.read8(address);
    if (this._isEEPROM(address)) return this.saveMemory.read16(address) & 1;
    const m = this._map(address);
    return m ? m[0][m[1]] : 0;
  }

  read16(address) {
    address &= ~1;
    if (this._isEEPROM(address)) return this.saveMemory.read16(address);
    return this.read8(address) | (this.read8(address + 1) << 8);
  }

  read32(address) {
    address >>>= 0;
    if (this._isEEPROM(address)) return this.read16(address);
    const rotate = (address & 3) * 8;
    const aligned = address & ~3;
    const value = (this.read8(aligned) |
      (this.read8(aligned + 1) << 8) |
      (this.read8(aligned + 2) << 16) |
      (this.read8(aligned + 3) << 24)) >>> 0;
    if (!rotate) return value;
    return ((value >>> rotate) | (value << (32 - rotate))) >>> 0;
  }

  _notifyIOWrite(address, size) {
    this.timerController?.onIOWrite?.(address >>> 0, size);
    this.dmaController?.onIOWrite?.(address >>> 0, size);
  }

  write8(address, value) {
    address >>>= 0;
    value &= 0xFF;
    if ((address >>> 24) >= 0x0E && this.saveMemory) { this.saveMemory.write8(address, value); return; }
    if (this._isEEPROM(address)) { this.saveMemory.write16(address, value & 1); return; }
    const top = address >>> 24;
    if (top === 0x00 || (top >= 0x08 && top <= 0x0D)) return;

    if (top === 0x04) {
      const off = (address - 0x04000000) & 0x3FF;
      // IF is write-one-to-clear. KEYINPUT/VCOUNT are read-only from the CPU side.
      if (off === 0x202 || off === 0x203) {
        this.io[off] &= ~value;
        return;
      }
      if (off === 0x130 || off === 0x131 || off === 0x006 || off === 0x007) return;
      this.io[off] = value;
      this._notifyIOWrite(address, 1);
      return;
    }

    // On GBA, 8-bit writes to palette RAM and VRAM are replicated to the
    // complete 16-bit bus value. OAM ignores byte writes entirely.
    if (top === 0x05 || top === 0x06) {
      const a = address & ~1;
      const m0 = this._map(a), m1 = this._map(a + 1);
      if (m0) m0[0][m0[1]] = value;
      if (m1) m1[0][m1[1]] = value;
      return;
    }
    if (top === 0x07) return;

    const m = this._map(address);
    if (m) m[0][m[1]] = value;
  }

  write16(address, value) {
    address &= ~1;
    value &= 0xFFFF;
    if (this._isEEPROM(address)) { this.saveMemory.write16(address, value); return; }
    if (address === 0x04000202) {
      this.writeIO16Raw(0x202, this.readIO16Raw(0x202) & ~value);
      return;
    }
    if (address === 0x04000130 || address === 0x04000006) return;
    if ((address >>> 24) === 0x04) {
      const off = (address - 0x04000000) & 0x3FE;
      this.writeIO16Raw(off, value);
      this._notifyIOWrite(address, 2);
      return;
    }
    const top=address>>>24;
    if (top===0x05 || top===0x06 || top===0x07) {
      const m0=this._map(address),m1=this._map(address+1);
      if(m0)m0[0][m0[1]]=value&0xFF;
      if(m1)m1[0][m1[1]]=(value>>>8)&0xFF;
      return;
    }
    this.write8(address, value);
    this.write8(address + 1, value >>> 8);
  }

  write32(address, value) {
    address >>>= 0;
    if (this._isEEPROM(address)) { this.saveMemory.write16(address, value & 1); return; }
    if (address === 0x040000A0 && this.apu) { this.apu.pushFIFO("A", value >>> 0); return; }
    if (address === 0x040000A4 && this.apu) { this.apu.pushFIFO("B", value >>> 0); return; }
    address &= ~3;
    if ((address >>> 24) === 0x04) {
      this.write16(address, value & 0xFFFF);
      this.write16(address + 2, value >>> 16);
      return;
    }
    this.write8(address, value);
    this.write8(address + 1, value >>> 8);
    this.write8(address + 2, value >>> 16);
    this.write8(address + 3, value >>> 24);
  }
}
