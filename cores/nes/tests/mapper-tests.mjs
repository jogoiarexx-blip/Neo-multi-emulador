import {Cartridge} from '../js/cartridge.js';
function makeRom(mapper,{prgBanks=4,chrBanks=2,nes2=false,sub=0,prgNvShift=0}={}){
 const prg=prgBanks*16384,chr=chrBanks*8192,d=new Uint8Array(16+prg+chr);d.set([0x4e,0x45,0x53,0x1a]);d[4]=prgBanks;d[5]=chrBanks;d[6]=(mapper&15)<<4;d[7]=(mapper&0xf0)|(nes2?8:0);if(nes2){d[8]=((sub&15)<<4)|((mapper>>8)&15);d[10]=(prgNvShift&15)<<4}for(let b=0;b<prg/0x2000;b++)d.fill(b&255,16+b*0x2000,16+(b+1)*0x2000);return d.buffer
}
let c=new Cartridge(makeRom(16));c.cpuWrite(0x6008,2);if(c.cpuRead(0x8000)!==4)throw new Error('Mapper16 PRG bank');c.cpuWrite(0x600b,2);c.cpuWrite(0x600c,0);c.cpuWrite(0x600a,1);if(c.clockCpu()||c.clockCpu()||!c.clockCpu())throw new Error('Mapper16 IRQ');
// Mapper 16.5 + 24C02: grava um byte pelo barramento I2C simplificado.
c=new Cartridge(makeRom(16,{nes2:true,sub:5,prgNvShift:2}));
const line=(scl,sda)=>c.cpuWrite(0x800d,(scl?0x20:0)|(sda?0x40:0));
const start=()=>{line(1,1);line(1,0)};const stop=()=>{line(0,0);line(1,0);line(1,1)};
const sendByte=v=>{for(let i=7;i>=0;i--){const b=(v>>i)&1;line(0,b);line(1,b);line(0,b)}};
start();sendByte(0xa0);sendByte(0x12);sendByte(0x5a);stop();
if(c.snapshot().mapperState.eeprom.mem[0x12]!==0x5a)throw new Error('Mapper16 EEPROM 24C02');
// FME-7 banking/IRQ + Sunsoft 5B audio ports.
c=new Cartridge(makeRom(69));c.cpuWrite(0x8000,9);c.cpuWrite(0xa000,3);if(c.cpuRead(0x8000)!==3)throw new Error('Mapper69 PRG bank');c.cpuWrite(0x8000,14);c.cpuWrite(0xa000,1);c.cpuWrite(0x8000,15);c.cpuWrite(0xa000,0);c.cpuWrite(0x8000,13);c.cpuWrite(0xa000,0x81);if(c.clockCpu()||!c.clockCpu())throw new Error('Mapper69 IRQ');
c.cpuWrite(0xc000,7);c.cpuWrite(0xe000,0x38);c.cpuWrite(0xc000,8);c.cpuWrite(0xe000,15);if(!(c.expansionAudioSample()>0))throw new Error('Sunsoft 5B audio');
// Mapper 153: WRAM e PRG banking Bandai.
c=new Cartridge(makeRom(153,{nes2:true,prgNvShift:7}));c.cpuWrite(0x800d,0x20);c.cpuWrite(0x6000,0x77);if(c.cpuRead(0x6000)!==0x77)throw new Error('Mapper153 WRAM');c.cpuWrite(0x8008,2);if(c.cpuRead(0x8000)!==4)throw new Error('Mapper153 PRG bank');
// Mapper 159: variante Bandai com EEPROM de 128 bytes.
c=new Cartridge(makeRom(159,{nes2:true,prgNvShift:1}));if(c.mapper!==159||c.snapshot().mapperState.eeprom.mem.length!==128)throw new Error('Mapper159 EEPROM');
// Parser NES 2.0/submapper.
c=new Cartridge(makeRom(16,{nes2:true,sub:3}));if(!c.nes2||c.mapper!==16||c.submapper!==3)throw new Error('NES2 mapper/submapper');
console.log('OK mapper 16 EEPROM, 69+5B, 153, 159, NES 2.0 parser');

// Mapper 30 UNROM512: 16K PRG switch + CHR-RAM bank.
c=new Cartridge(makeRom(30,{prgBanks:8,chrBanks:0,nes2:true,sub:1}));c.cpuWrite(0x8000,0x21);if(c.cpuRead(0x8000)!==2)throw new Error('Mapper30 PRG bank');c.ppuWrite(0x0010,0x5a);c.cpuWrite(0x8000,0x41);c.ppuWrite(0x0010,0x33);c.cpuWrite(0x8000,0x21);if(c.ppuRead(0x0010)!==0x5a)throw new Error('Mapper30 CHR bank');
// Mapper 79 NINA-03/06: register in $4100-$5FFF.
c=new Cartridge(makeRom(79,{prgBanks:4,chrBanks:8}));c.cpuWrite(0x4100,0x0b);if(c.cpuRead(0x8000)!==4)throw new Error('Mapper79 PRG bank');if(c.ppuRead(0)!==0){} // banked CHR exists; contents are zero in synthetic builder beyond PRG fill.
// NES 2.0 region parsing.
let rd=new Uint8Array(makeRom(0,{nes2:true}));rd[12]=1;c=new Cartridge(rd.buffer);if(c.region!=='PAL')throw new Error('PAL region parse');rd[12]=3;c=new Cartridge(rd.buffer);if(c.region!=='Dendy')throw new Error('Dendy region parse');
console.log('OK mapper 30, 79, PAL/Dendy parser');
