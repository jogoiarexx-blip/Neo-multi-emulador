import {Bus} from '../js/bus.js';import {Cartridge} from '../js/cartridge.js';
const rom=new Uint8Array(16+0x8000+0x2000);rom.set([0x4e,0x45,0x53,0x1a,2,1,0,0],0);rom[16+0x7ffc]=0;rom[16+0x7ffd]=0x80;const b=new Bus();b.insertCartridge(new Cartridge(rom.buffer));b.reset();
b.controller.buttons=0xA5;b.controller2.buttons=0x5A;b.write(0x4016,1);b.write(0x4016,0);if((b.read(0x4016)&1)!==1||(b.read(0x4017)&1)!==0)throw new Error('controller ports');
const st=b.snapshotBinary({});if(st.version!==37||!st.controllers||st.controllers.length!==4)throw new Error('state v37 controllers');const pc=b.cpu.pc;b.clock();b.restore(st);if(b.cpu.pc!==pc)throw new Error('state roundtrip');console.log('OK v0.7.8 determinism: P1/P2 ports + state v37');
