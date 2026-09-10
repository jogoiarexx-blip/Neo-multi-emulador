import {Bus} from '../js/bus.js';
const b=new Bus();
const fake={region:'NTSC',cpuRead:a=>a===0xfffc?0: a===0xfffd?0x80:0,ppuRead:()=>0,ppuWrite:()=>{},cpuWrite:()=>{},captureFast:t=>({...(t||{}),prgRam:new Uint8Array(8)}),restore:()=>{},clockCpu:()=>false,getMirroring:()=> 'horizontal'};
b.insertCartridge(fake);b.reset();const st=b.snapshotBinary({});if(st.version!==37||!st.integrity)throw new Error('state v37 integrity missing');const bad={...st,ram:new Uint8Array(st.ram)};bad.ram[0]^=1;let ok=false;try{b.restore(bad)}catch{ok=true}if(!ok)throw new Error('corrupt state accepted');b.restore(st);console.log('OK v0.7.8 recovery: integrity checksum + state v37');
