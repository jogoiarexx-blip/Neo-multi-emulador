import {Bus} from '../js/bus.js';
const b=new Bus();
// Four Score stream: P1 then P3 on 4016, P2 then P4 on 4017.
b.controller.buttons=0xA5;b.controller2.buttons=0x5A;b.controller3.buttons=0x3C;b.controller4.buttons=0xC3;b.input.fourScore.setEnabled(true);b.write(0x4016,1);b.write(0x4016,0);
const readByte=a=>{let v=0;for(let i=0;i<8;i++)v|=(b.read(a)&1)<<i;return v};
if(readByte(0x4016)!==0xA5||readByte(0x4016)!==0x3C)throw new Error('Four Score P1/P3 serial');
if(readByte(0x4017)!==0x5A||readByte(0x4017)!==0xC3)throw new Error('Four Score P2/P4 serial');
// Signature bytes are exposed after 16 controller bits.
if(readByte(0x4016)!==0x10||readByte(0x4017)!==0x20)throw new Error('Four Score signature');
// Zapper: trigger appears in bit 4 and bright screen clears bit 3.
b.input.fourScore.setEnabled(false);b.input.setPort2Device('zapper');b.input.zapper.aim(10,10);b.input.zapper.setTrigger(true);for(let y=6;y<=14;y++)for(let x=6;x<=14;x++)b.ppu.image[y*256+x]=0xffffffff;const z=b.read(0x4017);if(!(z&0x10)|| (z&0x08))throw new Error('Zapper trigger/light');
// Save state must keep all four controllers and devices.
const st=b.snapshotBinary({});if(st.version!==37||st.controllers.length!==4||!st.input?.zapper)throw new Error('input state v37');b.input.setPort2Device('controller');b.restore(st);if(b.input.port2Device!=='zapper'||!b.input.zapper.trigger)throw new Error('input restore');
console.log('OK v0.8.6 input devices: Four Score + Zapper + state v37');
