import {readFileSync} from 'node:fs';
import {Cartridge} from '../js/cartridge.js';
import {Bus} from '../js/bus.js';
const rom=new Uint8Array(16+0x8000+0x2000);rom.set([0x4e,0x45,0x53,0x1a,2,1,0,0],0);rom[16+0x7ffc]=0x00;rom[16+0x7ffd]=0x80;const c=new Cartridge(rom.buffer);const b=new Bus();b.insertCartridge(c);b.reset();const st=b.snapshotBinary({});if(st.version!==37)throw new Error('state schema != 31');
const main=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');if(!main.includes('quick-journal')||!main.includes("slot='a'"))throw new Error('autosave journal ausente');if(!main.includes('enterSafeMode'))throw new Error('safe mode ausente');
console.log('OK v0.7.8 safe session: state v37, autosave journal A/B, safe mode');
