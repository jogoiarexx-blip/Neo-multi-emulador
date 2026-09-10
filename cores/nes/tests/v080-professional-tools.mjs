import assert from 'assert';
import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
import {Cartridge} from '../js/cartridge.js';import {Bus} from '../js/bus.js';import {DebuggerCore} from '../js/debugger.js';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'..');
const rom=fs.readFileSync(path.join(root,'roms/ducktales-usa.nes'));const ab=rom.buffer.slice(rom.byteOffset,rom.byteOffset+rom.byteLength);const bus=new Bus();bus.insertCartridge(new Cartridge(ab));bus.reset();
assert.equal(typeof bus.ppu.ppuPeek,'function');const before=bus.ppu.dotCounter;const a=bus.ppu.ppuPeek(0x0000);assert.equal(bus.ppu.dotCounter,before);assert.equal(typeof a,'number');
const dbg=new DebuggerCore(bus);bus.setDebugger(dbg);dbg.setEnabled(true);dbg.setEventBreakpoint('nmi',true);dbg.onEvent('nmi');assert.equal(dbg.breakRequested,true);dbg.clearBreakRequest();dbg.setEventBreakpoint('irq',true);dbg.onEvent('irq');assert.equal(dbg.breakRequested,true);dbg.clearBreakRequest();dbg.setEventBreakpoint('sprite0',true);dbg.onEvent('sprite0');assert.equal(dbg.breakRequested,true);
const state=bus.snapshotBinary({});assert.equal(state.version,37);console.log('v0.8.0 professional tools ok');
