import { Cartridge } from "./memory/cartridge.js";
import { GBAMemory } from "./memory/memory.js";
import { ARM7TDMI } from "./cpu/arm7tdmi.js";
import { PPU } from "./video/ppu.js";
import { GBATimers } from "./timer.js";
import { IRQController } from "./irq.js";
import { GbaDMA } from "./dma.js";
import { Controls } from "./input/controls.js";
import { BIOSHLE } from "./bios_hle.js";
import { WaitStateControl } from "./waitstate.js";
import { APU } from "./audio/apu.js";
import { SaveMemory } from "./save/saveMemory.js";
import { PersistentStore } from "./save/persistentStore.js";
import { IndexedDBStore } from "./save/indexedDBStore.js";

export class NeoGBA {
  constructor(canvas, logger = console.log) {
    this.memory = new GBAMemory();
    this.cpu = new ARM7TDMI(this.memory);
    this.dma = new GbaDMA(this.memory);
    this.ppu = new PPU(canvas, this.memory, this.dma);
    this.timers = new GBATimers(this.memory);
    this.irq = new IRQController(this.memory, this.cpu);
    this.controls = new Controls(this.memory);
    this.waitstate = new WaitStateControl(this.memory);
    this.biosHLE = new BIOSHLE(this.memory, this.cpu, this.logger);
    this.apu = new APU(this.memory);
    this.saveMemory = new SaveMemory(this.memory);
    this.store = new PersistentStore();
    this.idb = new IndexedDBStore();
    this.memory.saveMemory = this.saveMemory;
    this.memory.apu = this.apu;
    this.timers.apu = this.apu;
    this.cpu.biosHLE = this.biosHLE;
    this.logger = logger;
    this.cartridge = null;
    this.running = false;
    this.totalCycles = 0;
    this.paused = false;
  }

  loadROM(buffer) {
    this.cartridge = new Cartridge(buffer);
    this.memory.loadROM(this.cartridge.bytes);
    this.saveMemory.detectFromROM(this.cartridge.bytes);
    const prior = this.store.loadSRAM(this.cartridge.header.gameCode);
    if (prior) this.saveMemory.importBytes(prior);
    this.cpu.reset();
    this.dma.reset();
    this.timers.reset();
    this.ppu.reset();
    this.totalCycles = 0;
    this.ppu.testPattern(this.cartridge.header.title || "GBA ROM");
    this.running = true;
    this.paused = false;
    this.logger(`ROM carregada: ${this.cartridge.header.title || "Sem título"}`);
    this.logger(`Tamanho: ${this.cartridge.bytes.length.toLocaleString("pt-BR")} bytes`);
    this.logger(`PC inicial: 0x${this.cpu.pc.toString(16).toUpperCase().padStart(8,"0")}`);
    return this.cartridge.describe();
  }

  reset() {
    if (!this.cartridge) return;
    this.memory.reset();
    this.cpu.reset();
    this.dma.reset();
    this.timers.reset();
    this.ppu.reset();
    this.totalCycles = 0;
    this.paused = false;
    this.running = true;
    this.ppu.testPattern(this.cartridge.header.title || "GBA ROM");
    this.logger("Emulador resetado.");
  }

  runCycles(budget = 2000) {
    if (!this.running || this.paused) return 0;
    let spent = 0;
    this.controls.pollGamepad();
    while (spent < budget) {
      this.irq.serviceIfNeeded();
      const c = this.cpu.step();
      this.timers.tick(c);
      this.ppu.tick(c);
      this.apu.tick(c);
      this.dma.triggerAudio(this.apu);
      spent += c;
      this.totalCycles += c;
    }
    return spent;
  }

  savePersistent() {
    if (!this.cartridge) return;
    this.store.saveSRAM(this.cartridge.header.gameCode, this.saveMemory.exportBytes());
  }

  createState() {
    if (!this.cartridge) return null;
    return {
      version: 1,
      cpu: {
        registers: Array.from(this.cpu.registers),
        cpsr: this.cpu.cpsr >>> 0,
        thumb: this.cpu.thumb,
        cycles: this.cpu.cycles
      },
      memory: {
        ewram: Array.from(this.memory.ewram),
        iwram: Array.from(this.memory.iwram),
        io: Array.from(this.memory.io),
        palette: Array.from(this.memory.palette),
        vram: Array.from(this.memory.vram),
        oam: Array.from(this.memory.oam)
      },
      ppu: { vcount:this.ppu.vcount, frame:this.ppu.frame, dotCycles:this.ppu.dotCycles },
      save: Array.from(this.saveMemory.data)
    };
  }

  restoreState(state) {
    if (!state) return false;
    this.cpu.registers.set(state.cpu.registers);
    this.cpu.cpsr = state.cpu.cpsr >>> 0;
    this.cpu.setThumb(!!state.cpu.thumb);
    this.cpu.cycles = state.cpu.cycles || 0;

    this.memory.ewram.set(state.memory.ewram);
    this.memory.iwram.set(state.memory.iwram);
    this.memory.io.set(state.memory.io);
    this.memory.palette.set(state.memory.palette);
    this.memory.vram.set(state.memory.vram);
    this.memory.oam.set(state.memory.oam);

    this.ppu.vcount = state.ppu.vcount || 0;
    this.ppu.frame = state.ppu.frame || 0;
    this.ppu.dotCycles = state.ppu.dotCycles || 0;
    if (state.save) this.saveMemory.data.set(state.save.slice(0,this.saveMemory.data.length));
    return true;
  }

  saveStateSlot(slot=1) {
    if (!this.cartridge) return false;
    this.store.saveState(this.cartridge.header.gameCode, this.createState(), slot);
    return true;
  }

  loadStateSlot(slot=1) {
    if (!this.cartridge) return false;
    return this.restoreState(this.store.loadState(this.cartridge.header.gameCode, slot));
  }

  exportSaveBlob() {
    if (!this.cartridge) return null;
    this.savePersistent();
    return new Blob([this.saveMemory.exportBytes()], {type:"application/octet-stream"});
  }

  importSaveBytes(bytes) {
    if (!this.cartridge) return false;
    this.saveMemory.importBytes(bytes);
    this.savePersistent();
    return true;
  }

  async saveROMToLibrary(file, info) {
    const bytes = await file.arrayBuffer();
    const key = info.gameCode || info.title || file.name;
    await this.idb.put("roms",{key,title:info.title||file.name,gameCode:info.gameCode||"",filename:file.name,size:info.sizeBytes,bytes,addedAt:Date.now()});
    return true;
  }

  async getLibraryROMs() { return await this.idb.all("roms"); }

  async openLibraryROM(key) {
    const item = await this.idb.get("roms",key);
    if (!item) return null;
    return new File([item.bytes], item.filename || `${key}.gba`, {type:"application/octet-stream"});
  }

  async removeLibraryROM(key) { return await this.idb.delete("roms",key); }

  saveGameProfile(profile) {
    if (!this.cartridge) return false;
    localStorage.setItem(`neo-gba:profile:${this.cartridge.header.gameCode || this.cartridge.header.title}`,JSON.stringify(profile));
    return true;
  }

  loadGameProfile() {
    if (!this.cartridge) return null;
    try { return JSON.parse(localStorage.getItem(`neo-gba:profile:${this.cartridge.header.gameCode || this.cartridge.header.title}`)||"null"); }
    catch { return null; }
  }

  async quickSave() {
    if (!this.cartridge) return false;
    const key = `${this.cartridge.header.gameCode || this.cartridge.header.title}:quick`;
    await this.idb.put("states",{key,state:this.createState(),savedAt:Date.now()});
    return true;
  }

  async quickLoad() {
    if (!this.cartridge) return false;
    const key = `${this.cartridge.header.gameCode || this.cartridge.header.title}:quick`;
    const item = await this.idb.get("states",key);
    return item ? this.restoreState(item.state) : false;
  }

  async autosaveState() {
    if (!this.cartridge) return false;
    const key = `${this.cartridge.header.gameCode || this.cartridge.header.title}:autosave`;
    await this.idb.put("states",{key,state:this.createState(),savedAt:Date.now()});
    return true;
  }

  togglePause() {
    if (!this.running) return false;
    this.paused = !this.paused;
    this.logger(this.paused ? "Emulação pausada." : "Emulação retomada.");
    return this.paused;
  }
}
