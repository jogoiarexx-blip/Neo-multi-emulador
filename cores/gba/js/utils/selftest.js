export function runMemorySelfTest(memory) {
  const results = [];

  memory.write32(0x02000000, 0x12345678);
  results.push(["EWRAM 32-bit", memory.read32(0x02000000) === 0x12345678]);

  memory.write16(0x03000002, 0xBEEF);
  results.push(["IWRAM 16-bit", memory.read16(0x03000002) === 0xBEEF]);

  memory.write8(0x05000000, 0x5A);
  results.push(["Palette 8-bit", memory.read8(0x05000000) === 0x5A]);

  memory.write32(0x06000000, 0xCAFEBABE);
  results.push(["VRAM 32-bit", memory.read32(0x06000000) === 0xCAFEBABE]);

  memory.write8(0x0E000123, 0x77);
  results.push(["SRAM 8-bit", memory.read8(0x0E000123) === 0x77]);

  return results;
}
