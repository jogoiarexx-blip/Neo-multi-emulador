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
    this.logger = typeof logger === "function" ? logger : console.log;
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
    this.memory.timerController = this.timers;
    this.memory.dmaController = this.dma;
    this.timers.apu = this.apu;
    this.cpu.biosHLE = this.biosHLE;
    this.cpu.waitstate = this.waitstate;

    this.cartridge = null;
    this.running = false;
    this.totalCycles = 0;
    this.paused = false;
    this.clockHz = 16777216;
    this.cyclesPerFrame = this.ppu.cyclesPerLine * this.ppu.totalLines;
    this.nominalFps = this.clockHz / this.cyclesPerFrame;
  }

  _resetCoreState() {
    this.memory.reset();
    this.cpu.reset();
    this.cpu.biosHLE = this.biosHLE;
    this.cpu.waitstate = this.waitstate;
    this.dma.reset();
    this.timers.reset();
    this.ppu.reset();
    this.apu.reset();
    this.totalCycles = 0;
    this.paused = false;
  }

  loadROM(buffer) {
    this.cartridge = new Cartridge(buffer);
    this.memory.loadROM(this.cartridge.bytes);
    this.saveMemory.detectFromROM(this.cartridge.bytes);
    const prior = this.store.loadSRAM(this.cartridge.header.gameCode);
    if (prior) this.saveMemory.importBytes(prior);
    this._resetCoreState();
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
    this._resetCoreState();
    this.running = true;
    this.ppu.testPattern(this.cartridge.header.title || "GBA ROM");
    this.logger("Emulador resetado.");
  }

  runCycles(budget = 2000, {pollInput=true} = {}) {
    if (!this.running || this.paused) return 0;
    let spent = 0;
    if (pollInput) this.controls.pollGamepad();
    while (spent < budget) {
      this.irq.serviceIfNeeded();
      // HALT can be advanced in small batches until a device raises an IRQ.
      const remaining = budget - spent;
      const c = this.cpu.halted ? Math.min(64, remaining) : this.cpu.step();
      this.timers.tick(c);
      this.ppu.tick(c);
      this.apu.tick(c);
      this.dma.triggerAudio(this.apu);
      spent += c;
      this.totalCycles += c;
    }
    return spent;
  }

  runFrame(maxCycles = this.cyclesPerFrame * 2) {
    if (!this.running || this.paused) return 0;
    this.controls.pollGamepad();
    const startFrame = this.ppu.frame;
    let spent = 0;
    while (this.ppu.frame === startFrame && spent < maxCycles) {
      const slice = Math.min(4096, maxCycles - spent);
      spent += this.runCycles(slice, {pollInput:false});
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
      version: 3,
      totalCycles: this.totalCycles,
      cpu: {
        registers: Array.from(this.cpu.registers), cpsr: this.cpu.cpsr >>> 0, thumb: this.cpu.thumb, cycles: this.cpu.cycles,
        spsr_irq:this.cpu.spsr_irq>>>0, halted:!!this.cpu.halted, waitingForInterrupt:!!this.cpu.waitingForInterrupt,
        unsupportedInstructions:this.cpu.unsupportedInstructions||0, bankedSP_irq:this.cpu.bankedSP_irq>>>0, bankedLR_irq:this.cpu.bankedLR_irq>>>0,
        userSP:this.cpu.userSP>>>0, userLR:this.cpu.userLR>>>0, lastException:this.cpu.lastException||"",
        irqWaitMask:this.cpu.irqWaitMask>>>0, hleIRQActive:!!this.cpu.hleIRQActive, hleIRQReturnPC:this.cpu.hleIRQReturnPC>>>0,
        hleIRQReturnCPSR:this.cpu.hleIRQReturnCPSR>>>0, hleIRQMask:this.cpu.hleIRQMask>>>0, hleIRQSavedRegs:this.cpu.hleIRQSavedRegs?{...this.cpu.hleIRQSavedRegs}:null
      },
      memory: {
        ewram:Array.from(this.memory.ewram), iwram:Array.from(this.memory.iwram), io:Array.from(this.memory.io),
        palette:Array.from(this.memory.palette), vram:Array.from(this.memory.vram), oam:Array.from(this.memory.oam)
      },
      ppu: {vcount:this.ppu.vcount, frame:this.ppu.frame, dotCycles:this.ppu.dotCycles},
      timers:this.timers.createState?.(),
      dma:this.dma.createState?.(),
      apu:this.apu.createState?.(),
      saveMemory:this.saveMemory.createState?.(),
      controls:{gamepadState:this.controls.gamepadState}
    };
  }

  restoreState(state) {
    if (!state?.cpu || !state?.memory) return false;
    this.cpu.registers.set(state.cpu.registers || []);
    this.cpu.cpsr = state.cpu.cpsr >>> 0;
    this.cpu.setThumb(!!state.cpu.thumb);
    this.cpu.cycles = state.cpu.cycles || 0;
    this.cpu.spsr_irq=state.cpu.spsr_irq>>>0||0;this.cpu.halted=!!state.cpu.halted;this.cpu.waitingForInterrupt=!!state.cpu.waitingForInterrupt;
    this.cpu.unsupportedInstructions=state.cpu.unsupportedInstructions||0;this.cpu.bankedSP_irq=state.cpu.bankedSP_irq>>>0||0x03007FA0;
    this.cpu.bankedLR_irq=state.cpu.bankedLR_irq>>>0||0;this.cpu.userSP=state.cpu.userSP>>>0||0x03007F00;this.cpu.userLR=state.cpu.userLR>>>0||0;
    this.cpu.lastException=state.cpu.lastException||"";this.cpu.irqWaitMask=state.cpu.irqWaitMask>>>0||0;
    this.cpu.hleIRQActive=!!state.cpu.hleIRQActive;this.cpu.hleIRQReturnPC=state.cpu.hleIRQReturnPC>>>0||0;this.cpu.hleIRQReturnCPSR=state.cpu.hleIRQReturnCPSR>>>0||0;
    this.cpu.hleIRQMask=state.cpu.hleIRQMask>>>0||0;this.cpu.hleIRQSavedRegs=state.cpu.hleIRQSavedRegs?{...state.cpu.hleIRQSavedRegs}:null;
    this.cpu.biosHLE=this.biosHLE;this.cpu.waitstate=this.waitstate;this.cpu.lastFetchAddress=null;

    for (const [name,target] of [['ewram',this.memory.ewram],['iwram',this.memory.iwram],['io',this.memory.io],['palette',this.memory.palette],['vram',this.memory.vram],['oam',this.memory.oam]]) {
      if (state.memory[name]) target.set(state.memory[name].slice(0,target.length));
    }
    this.ppu.vcount=state.ppu?.vcount||0;this.ppu.frame=state.ppu?.frame||0;this.ppu.dotCycles=state.ppu?.dotCycles||0;
    if(state.saveMemory)this.saveMemory.restoreState?.(state.saveMemory);
    else if(state.save)this.saveMemory.data.set(state.save.slice(0,this.saveMemory.data.length));
    this.timers.restoreState?.(state.timers);this.dma.restoreState?.(state.dma);this.apu.restoreState?.(state.apu);
    if(state.controls?.gamepadState!==undefined)this.controls.gamepadState=state.controls.gamepadState&0x03FF;
    this.controls.sync();this.totalCycles=state.totalCycles||this.cpu.cycles||0;
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
