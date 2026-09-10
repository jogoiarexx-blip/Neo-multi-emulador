import fs from 'fs';
import {Cartridge} from '../js/cartridge.js';
import {Bus} from '../js/bus.js';
const dir=new URL('../roms/',import.meta.url);
for(const name of fs.readdirSync(dir).filter(x=>x.endsWith('.nes'))){
 const b=fs.readFileSync(new URL(name,dir));
 const ab=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
 const cart=new Cartridge(ab),bus=new Bus();bus.insertCartridge(cart);bus.reset();
 for(let f=0;f<3;f++){bus.ppu.frameComplete=false;let guard=0;while(!bus.ppu.frameComplete&&guard<220000){bus.clock();guard++}if(guard>=220000)throw new Error(`${name}: frame timeout`)}
 const s=bus.snapshot();if(s.version!==37)throw new Error(`${name}: save version`);for(let i=0;i<5000;i++)bus.clock();bus.restore(s);
 console.log('OK',name,'mapper',cart.mapper,'PC',bus.cpu.pc.toString(16));
}
