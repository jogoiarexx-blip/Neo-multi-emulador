import { ascii, hex } from "../utils/binary.js";

export class Cartridge {
  constructor(arrayBuffer) {
    this.buffer = arrayBuffer;
    this.bytes = new Uint8Array(arrayBuffer);
    this.header = this.parseHeader();
  }

  parseHeader() {
    if (this.bytes.length < 0xC0) throw new Error("Arquivo pequeno demais para uma ROM GBA válida.");
    const title = ascii(this.bytes, 0xA0, 12);
    const gameCode = ascii(this.bytes, 0xAC, 4);
    const makerCode = ascii(this.bytes, 0xB0, 2);
    const fixedValue = this.bytes[0xB2];
    const version = this.bytes[0xBC];
    const complement = this.bytes[0xBD];
    const calculated = this.calculateHeaderChecksum();

    return {
      title,
      gameCode,
      makerCode,
      fixedValue,
      version,
      complement,
      calculated,
      checksumValid: complement === calculated
    };
  }

  calculateHeaderChecksum() {
    let chk = 0;
    for (let i = 0xA0; i <= 0xBC; i++) chk = (chk - this.bytes[i]) & 0xFF;
    return (chk - 0x19) & 0xFF;
  }

  describe() {
    return {
      ...this.header,
      sizeBytes: this.bytes.length,
      fixedValueHex: hex(this.header.fixedValue)
    };
  }
}
