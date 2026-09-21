import assert from 'node:assert/strict';
import { GBAMemory } from '../js/memory/memory.js';
import { ARM7TDMI } from '../js/cpu/arm7tdmi.js';
import { BIOSHLE } from '../js/bios_hle.js';
import { GBATimers } from '../js/timer.js';
import { GbaDMA } from '../js/dma.js';
import { SaveMemory } from '../js/save/saveMemory.js';
import { IRQController } from '../js/irq.js';
import { PPU } from '../js/video/ppu.js';

const mem=new GBAMemory();
assert.equal(mem.read16(0x04000130),0x03FF,'KEYINPUT inicia liberado');
mem.requestIRQ(0x0009);assert.equal(mem.read16(0x04000202),0x0009,'IRQ request seta IF');
mem.write16(0x04000202,0x0001);assert.equal(mem.read16(0x04000202),0x0008,'IF é write-one-to-clear');

const cpu=new ARM7TDMI(mem);let swi=-1;cpu.biosHLE={swi:n=>{swi=n;return 7}};cpu.setThumb(true);assert.equal(cpu.executeThumb(0xDF06),7);assert.equal(swi,6,'THUMB SWI chama HLE');cpu.reset();assert.ok(cpu.biosHLE,'reset preserva BIOS HLE');

const hle=new BIOSHLE(mem,cpu);cpu.biosHLE=hle;
mem.ewram[0]=0xAA;cpu.registers[0]=0x01;hle.swi(0x01);assert.equal(mem.ewram[0],0,'RegisterRamReset limpa EWRAM');
cpu.halted=false;cpu.waitingForInterrupt=false;hle.swi(0x02);assert.equal(cpu.halted,true,'Halt entra em espera');cpu.halted=false;cpu.waitingForInterrupt=false;
cpu.registers[0]=3;cpu.registers[1]=20;hle.swi(0x07);assert.equal(cpu.registers[0],6,'DivArm usa argumentos invertidos');
hle.swi(0x0D);assert.equal(cpu.registers[0],0xBAAE187F,'BIOS checksum HLE');

const timers=new GBATimers(mem);mem.timerController=timers;timers.reset();
mem.write16(0x04000100,0xFFFE);mem.write16(0x04000102,0x0080); // timer0 /1
mem.write16(0x04000104,0xFFFE);mem.write16(0x04000106,0x0084); // timer1 cascade
mem.requestIRQ(0);timers.tick(2);assert.equal(timers.timers[0].counter,0xFFFE);assert.equal(timers.timers[1].counter,0xFFFF,'cascade recebe overflow anterior');

afterDma: {
  const dma=new GbaDMA(mem);mem.dmaController=dma;dma.reset();
  mem.write32(0x02000000,0x11223344);mem.write32(0x02000004,0x55667788);
  mem.write32(0x040000B0,0x02000000);mem.write32(0x040000B4,0x03000000);mem.write16(0x040000B8,2);mem.write16(0x040000BA,0x8400);
  assert.equal(mem.read32(0x03000000),0x11223344);assert.equal(mem.read32(0x03000004),0x55667788);assert.equal(dma.channels[0].enabled,false,'DMA imediato desliga após transferência');
}

const save=new SaveMemory(mem);save.configure('FLASH1M');
const cmd=(a,v)=>save.write8(0x0E000000+a,v);
cmd(0x5555,0xAA);cmd(0x2AAA,0x55);cmd(0x5555,0xB0);cmd(0,1);
cmd(0x5555,0xAA);cmd(0x2AAA,0x55);cmd(0x5555,0xA0);cmd(0x1234,0x5A);
assert.equal(save.data[0x11234],0x5A,'FLASH1M bank switching/program');


// ARM/THUMB pipeline and branch regression tests.
{
  const m=new GBAMemory();
  const c=new ARM7TDMI(m);
  const put32=(off,v)=>{m.rom[off]=v&255;m.rom[off+1]=(v>>>8)&255;m.rom[off+2]=(v>>>16)&255;m.rom[off+3]=(v>>>24)&255};
  m.loadROM(new Uint8Array(32));
  put32(0,0xEA000000); // B +0 -> current+8
  c.reset(); c.step(); assert.equal(c.pc,0x08000008,'ARM B usa PC arquitetural current+8');
  put32(0,0xEB000000); // BL +0
  c.reset(); c.step(); assert.equal(c.pc,0x08000008,'ARM BL destino current+8'); assert.equal(c.registers[14],0x08000004,'ARM BL LR aponta para próxima instrução');
  put32(0,0xE1A0000F); // MOV r0,pc
  c.reset(); c.step(); assert.equal(c.registers[0],0x08000008,'ARM leitura de r15 observa pipeline +8');
  m.rom.fill(0); m.rom[0]=0x00;m.rom[1]=0xE0; // THUMB B +0
  c.reset();c.setThumb(true);c.step();assert.equal(c.pc,0x08000004,'THUMB B usa PC arquitetural current+4');
  m.rom.fill(0);m.rom[0]=0x00;m.rom[1]=0xF0;m.rom[2]=0x00;m.rom[3]=0xF8; // BL +0 pair
  c.reset();c.setThumb(true);c.step();c.step();assert.equal(c.pc,0x08000004,'THUMB BL destino correto');assert.equal(c.registers[14],0x08000005,'THUMB BL LR mantém bit THUMB');
}

// GBA bus quirks used by commercial games.
{
  const m=new GBAMemory();
  m.write8(0x05000001,0x5A);assert.equal(m.read16(0x05000000),0x5A5A,'palette byte write replica no barramento 16-bit');
  m.write8(0x06000003,0xA5);assert.equal(m.read16(0x06000002),0xA5A5,'VRAM byte write replica no barramento 16-bit');
  m.write16(0x07000000,0x1234);m.write8(0x07000000,0xFF);assert.equal(m.read16(0x07000000),0x1234,'OAM ignora byte write');
  m.write32(0x02000000,0x11223344);assert.equal(m.read32(0x02000001),0x44112233,'read32 desalinhado rotaciona palavra ARM7TDMI');
}

// HLE IRQ dispatcher: handler can inspect IF and returns through BX LR.
{
  const m=new GBAMemory(), c=new ARM7TDMI(m), irq=new IRQController(m,c);
  m.write16(0x04000200,1);m.write16(0x04000208,1);m.requestIRQ(1);
  m.write32(0x03007FFC,0x02000001); // THUMB user IRQ handler
  m.ewram[0]=0x70;m.ewram[1]=0x47; // BX LR
  c.pc=0x08000100;c.cpsr&=~0x80;
  assert.equal(irq.serviceIfNeeded(),true,'IRQ HLE é atendida');
  assert.equal(c.pc,0x02000000);assert.equal(c.thumb,true);assert.equal(m.read16(0x04000202)&1,1,'IF fica visível ao handler');
  c.step();assert.equal(c.pc,0x08000100,'IRQ HLE retorna para próxima instrução');assert.equal(m.read16(0x04000202)&1,0,'IRQ HLE reconhece IF ao retornar');
  assert.equal(m.read16(0x03007FF8)&1,1,'BIOS IRQ flag é acumulada para IntrWait');
}

// PPU OBJ smoke: sprites should render without ReferenceError and support flip/priority path.
{
  const m=new GBAMemory();
  const ctx={
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    fillRect(){},putImageData(){},createLinearGradient(){return{addColorStop(){}}},fillText(){},
    set fillStyle(v){},get fillStyle(){return''},set textAlign(v){},set font(v){}
  };
  const canvas={getContext:()=>ctx};
  const ppu=new PPU(canvas,m);
  m.write16(0x04000000,1<<12); // OBJ enabled, mode 0
  for(let i=1;i<128;i++){const o=i*8;m.oam[o+1]=0x02;} // disable regular OBJs via attr0 bit9
  m.oam[0]=0;m.oam[1]=0; // y=0, regular
  m.oam[2]=0;m.oam[3]=0; // x=0, 8x8
  m.oam[4]=0;m.oam[5]=0; // tile0, prio0, pal0
  m.vram[0x10000]=0x01; // first pixel palette index 1
  m.palette[0x202]=0x1F;m.palette[0x203]=0; // OBJ palette red
  ppu.renderLine(0);
  assert.equal(ppu.image.data[0],255,'OBJ pixel renderizado');
}

console.log('GBA core regression: OK');
