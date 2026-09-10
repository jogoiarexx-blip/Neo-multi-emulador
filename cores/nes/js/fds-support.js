const td=new TextDecoder('ascii');
export const FDS_SIDE_SIZE=65500;
const FDS_TRANSFER_THIRDS=448; // 149 + 1/3 CPU cycles per transferred byte.
const FDS_PATCH_PAGE=256;

export function parseFds(buffer){
 const b=new Uint8Array(buffer);let off=0,sides=0;
 if(b.length>=16&&td.decode(b.slice(0,4))==='FDS\x1a'){sides=b[4]||0;off=16}else{sides=Math.floor(b.length/FDS_SIDE_SIZE)}
 if(!sides||b.length<off+sides*FDS_SIDE_SIZE)throw new Error('Imagem FDS inválida ou truncada');
 const out=[];for(let i=0;i<sides;i++){const side=b.slice(off+i*FDS_SIDE_SIZE,off+(i+1)*FDS_SIDE_SIZE);out.push({index:i,label:`Disco ${Math.floor(i/2)+1} — Lado ${i%2?'B':'A'}`,signature:Array.from(side.slice(0,16)).map(x=>x.toString(16).padStart(2,'0')).join('')})}
 return{format:'FDS',sides:out,data:b.slice(off,off+sides*FDS_SIDE_SIZE),headered:off===16};
}
export function validateFdsBios(buffer){const b=new Uint8Array(buffer);if(b.length!==8192)throw new Error('BIOS FDS deve ter exatamente 8192 bytes (8 KB)');return{size:b.length,valid:true}}

function signed7(v){v&=0x7f;return v&0x40?v-0x80:v}
function clamp(v,a,b){return v<a?a:v>b?b:v}

// Famicom Disk System RAM adaptor / disk drive model.
// Timing-sensitive pieces stay isolated from the generic NES CPU/PPU so they
// can be refined without forking the emulator core.
export class FdsDevice{
 constructor(doc,bios){
  if(!doc?.data)throw new Error('Imagem FDS ausente');validateFdsBios(bios);
  this.format='FDS';this.mapper='FDS';this.submapper=0;this.region='NTSC';this.mirroring='vertical';this.battery=true;
  this.prgRam=new Uint8Array(0x8000);this.chr=new Uint8Array(0x2000);this.chrRam=true;this.bios=new Uint8Array(bios);
  this.diskData=new Uint8Array(doc.data);this.originalDiskData=new Uint8Array(doc.data);this.sideCount=doc.sides.length;this.side=0;
  this.inserted=true;this.writeProtected=false;this.diskPos=0;this.transferPhase=0;this.byteCycles=149+1/3;this.readData=0;this.writeData=0;this.dataReady=false;this.endOfDisk=false;
  this.timerLatch=0;this.timerCounter=0;this.timerEnabled=false;this.timerRepeat=false;this.timerIrq=false;this.transferIrq=false;this.transferIrqEnable=false;
  this.diskIoEnable=true;this.soundIoEnable=true;this.ioEnable=true; // ioEnable kept for old states/tests.
  this.scanDisk=false;this.motorOn=false;this.readMode=true;this.crcControl=false;this.crcEnabled=false;this.diskReady=true;
  this.wave=new Uint8Array(64);for(let i=0;i<64;i++)this.wave[i]=32;this.waveWrite=true;this.waveMaster=0;this.freq=0;this.phase=0;this.waveHalt=true;this.envHalt=false;
  this.envSpeed=0xe8;this.volEnv={gain:0,speed:0,disable:true,increase:false,counter:0};this.modEnv={gain:0,speed:0,disable:true,increase:false,counter:0};
  this.modTable=new Uint8Array(32);this.modWritePos=0;this.modFreq=0;this.modPhase=0;this.modCounter=0;this.modDisable=true;this.audioDiv=0;
  this.lastIrq=false;this.diskDirty=false;this.modifiedPages=new Set();this.pendingDirtyPages=new Set();this.transferCount=0;this.diskIrqCount=0;this.timerIrqCount=0;
 }
 getMirroring(){return this.mirroring}
 get suggestedSide(){if(this.sideCount<2)return this.side;const n=this.side+1;return n<this.sideCount?n:0}
 sideOffset(){return this.side*FDS_SIDE_SIZE}
 setSide(index){index=Number(index)|0;if(index<0||index>=this.sideCount)throw new Error('Lado FDS inválido');this.side=index;this.diskPos=0;this.transferPhase=0;this.dataReady=false;this.endOfDisk=false;this.transferIrq=false;this.inserted=true;this.diskReady=true;this.scanDisk=false;this.motorOn=false}
 eject(){this.inserted=false;this.motorOn=false;this.scanDisk=false;this.dataReady=false;this.transferIrq=false;this.diskReady=false}
 insert(index=this.side){this.setSide(index)}
 markPageDirty(abs){const page=Math.floor(abs/FDS_PATCH_PAGE);this.modifiedPages.add(page);this.pendingDirtyPages.add(page);this.diskDirty=true}
 markPersistentClean(){this.pendingDirtyPages.clear();this.diskDirty=false}

 cpuRead(a){
  a&=0xffff;
  if(a>=0x6000&&a<0xe000)return this.prgRam[a-0x6000];if(a>=0xe000)return this.bios[a-0xe000];
  if(a>=0x4030&&a<=0x4033&&!this.diskIoEnable)return 0;
  if(a===0x4030){const v=(this.timerIrq?1:0)|(this.transferIrq?2:0)|(this.endOfDisk?0x40:0);this.timerIrq=false;this.transferIrq=false;return v}
  if(a===0x4031){const v=this.readData;this.dataReady=false;this.transferIrq=false;return v}
  if(a===0x4032){let v=0;if(!this.inserted)v|=1;if(!this.diskReady)v|=2;if(this.writeProtected||!this.inserted)v|=4;return v}
  if(a===0x4033)return this.motorOn?0x80:0;
  if(a>=0x4040&&a<=0x407f){if(!this.soundIoEnable)return 0;const sample=this.waveWrite?this.wave[a-0x4040]:this.wave[(this.phase>>>18)&63];return 0x40|(sample&0x3f)}
  if(a===0x4090)return 0x40|(this.volEnv.gain&0x3f);
  if(a===0x4091)return (this.phase>>>12)&0xff;
  if(a===0x4092)return 0x40|(this.modEnv.gain&0x3f);
  if(a===0x4093)return (this.modPhase>>>5)&0x7f;
  return 0;
 }
 cpuWrite(a,v){
  a&=0xffff;v&=255;
  if(a>=0x6000&&a<0xe000){this.prgRam[a-0x6000]=v;return}
  if(a===0x4023){this.diskIoEnable=!!(v&1);this.soundIoEnable=!!(v&2);this.ioEnable=this.diskIoEnable;if(!this.diskIoEnable){this.timerEnabled=false;this.timerIrq=false;this.transferIrq=false}return}
  if(a>=0x4020&&a<=0x4026&&!this.diskIoEnable)return;
  if(a===0x4020){this.timerLatch=(this.timerLatch&0xff00)|v;return}
  if(a===0x4021){this.timerLatch=(this.timerLatch&0xff)|(v<<8);return}
  if(a===0x4022){this.timerRepeat=!!(v&1);this.timerEnabled=!!(v&2);if(this.timerEnabled)this.timerCounter=this.timerLatch;else this.timerIrq=false;return}
  if(a===0x4024){this.writeData=v;this.transferIrq=false;return}
  if(a===0x4025){
   const wasScanning=this.scanDisk;
   this.scanDisk=!!(v&1);this.motorOn=!(v&2);this.readMode=!!(v&4);this.mirroring=(v&8)?'horizontal':'vertical';this.crcControl=!!(v&0x10);this.crcEnabled=!!(v&0x40);this.transferIrqEnable=!!(v&0x80);
   if(!this.scanDisk){this.diskPos=0;this.transferPhase=0;this.dataReady=false;this.endOfDisk=false;this.transferIrq=false;this.diskReady=!!this.inserted}
   else if(!wasScanning){this.transferPhase=0;this.dataReady=false;this.endOfDisk=false;this.diskReady=!!this.inserted}
   return;
  }
  if(a>=0x4040&&a<=0x4092&&!this.soundIoEnable)return;
  if(a>=0x4040&&a<=0x407f){if(this.waveWrite)this.wave[a-0x4040]=v&0x3f;return}
  if(a===0x4080){this.volEnv.disable=!!(v&0x80);this.volEnv.increase=!!(v&0x40);this.volEnv.speed=v&0x3f;this.volEnv.counter=0;if(this.volEnv.disable)this.volEnv.gain=v&0x3f;return}
  if(a===0x4082){this.freq=(this.freq&0xf00)|v;return}
  if(a===0x4083){this.freq=(this.freq&0xff)|((v&0x0f)<<8);this.envHalt=!!(v&0x40);this.waveHalt=!!(v&0x80);if(this.waveHalt){this.phase=0;this.modPhase=0}if(this.envHalt){this.volEnv.counter=0;this.modEnv.counter=0}return}
  if(a===0x4084){this.modEnv.disable=!!(v&0x80);this.modEnv.increase=!!(v&0x40);this.modEnv.speed=v&0x3f;this.modEnv.counter=0;if(this.modEnv.disable)this.modEnv.gain=v&0x3f;return}
  if(a===0x4085){this.modCounter=signed7(v);return}
  if(a===0x4086){this.modFreq=(this.modFreq&0xf00)|v;return}
  if(a===0x4087){this.modFreq=(this.modFreq&0xff)|((v&0x0f)<<8);this.modDisable=!!(v&0x80);return}
  if(a===0x4088){if(this.modDisable){this.modTable[this.modWritePos&31]=v&7;this.modWritePos=(this.modWritePos+1)&31;this.modPhase=(this.modPhase+0x20000)&0xffffff}return}
  if(a===0x4089){this.waveWrite=!!(v&0x80);this.waveMaster=v&3;return}
  if(a===0x408a){this.envSpeed=v;return}
 }
 ppuRead(a){return this.chr[a&0x1fff]}
 ppuPeek(a){return this.chr[a&0x1fff]}
 ppuWrite(a,v){this.chr[a&0x1fff]=v&255}
 pollIrq(){if(!this.lastIrq)return false;this.lastIrq=false;return true}
 clockEnvelopeUnit(e){
  if(e.disable||this.envHalt||this.envSpeed===0)return;
  const period=8*(e.speed+1)*(this.envSpeed+1);
  if(++e.counter>=period){e.counter=0;if(e.increase){if(e.gain<32)e.gain++}else if(e.gain>0)e.gain--}
 }
 clockAudio(){
  this.clockEnvelopeUnit(this.volEnv);this.clockEnvelopeUnit(this.modEnv);
  if(!this.soundIoEnable)return;
  if(++this.audioDiv<16)return;this.audioDiv=0;
  if(!this.modDisable&&!this.waveHalt){this.modPhase=(this.modPhase+this.modFreq)&0xffffff;const idx=(this.modPhase>>>19)&31;const code=this.modTable[idx]&7;const delta=[0,1,2,4,0,-4,-2,-1][code];if(code===4)this.modCounter=0;else this.modCounter=clamp(this.modCounter+delta,-64,63)}
  if(!this.waveHalt&&!this.waveWrite){const mod=(this.modCounter*(this.modEnv.gain&0x3f))>>4;const pitch=clamp(this.freq+mod,0,0xfff);this.phase=(this.phase+(pitch<<4))&0xffffff}
 }
 clockDisk(){
  if(!this.diskIoEnable||!this.inserted||!this.scanDisk||!this.diskReady)return;
  if(this.readMode&&!this.motorOn)return;
  this.transferPhase+=3;if(this.transferPhase<FDS_TRANSFER_THIRDS)return;this.transferPhase-=FDS_TRANSFER_THIRDS;
  if(this.diskPos>=FDS_SIDE_SIZE){this.endOfDisk=true;this.diskReady=false;this.motorOn=false;return}
  const p=this.sideOffset()+this.diskPos;
  if(this.readMode){this.readData=this.diskData[p];this.dataReady=true}else if(!this.writeProtected){this.diskData[p]=this.writeData;this.markPageDirty(p)}
  this.diskPos++;this.transferCount++;
  if(this.transferIrqEnable){this.transferIrq=true;this.lastIrq=true;this.diskIrqCount++}
 }
 clockCpu(){
  if(this.timerEnabled&&this.diskIoEnable){if(this.timerCounter<=0){this.timerIrq=true;this.lastIrq=true;this.timerIrqCount++;if(this.timerRepeat)this.timerCounter=this.timerLatch;else this.timerEnabled=false}else this.timerCounter--}
  this.clockDisk();this.clockAudio();if(this.lastIrq){this.lastIrq=false;return true}return false;
 }
 expansionAudioSample(){
  if(!this.soundIoEnable||this.waveWrite||this.waveHalt||!this.freq)return 0;
  const idx=(this.phase>>>18)&63,centered=(this.wave[idx]&63)-32,master=[1,2/3,1/2,2/5][this.waveMaster&3];
  return (centered/32)*(Math.min(32,this.volEnv.gain)/32)*master*0.24;
 }
 persistent(){
  const patches=[];for(const page of [...this.modifiedPages].sort((a,b)=>a-b)){const start=page*FDS_PATCH_PAGE,end=Math.min(this.diskData.length,start+FDS_PATCH_PAGE);patches.push({page,data:new Uint8Array(this.diskData.slice(start,end))})}
  return{format:'NEO-FDS-PERSIST-v2',side:this.side,diskPos:this.diskPos,patchSize:FDS_PATCH_PAGE,patches};
 }
 loadPersistent(v){
  if(v?.diskData&&v.diskData.length===this.diskData.length){this.diskData.set(v.diskData);for(let p=0;p<Math.ceil(this.diskData.length/FDS_PATCH_PAGE);p++){const s=p*FDS_PATCH_PAGE,e=Math.min(this.diskData.length,s+FDS_PATCH_PAGE);let diff=false;for(let i=s;i<e;i++){if(this.diskData[i]!==this.originalDiskData[i]){diff=true;break}}if(diff)this.modifiedPages.add(p)}}
  if(Array.isArray(v?.patches)){for(const patch of v.patches){const page=Number(patch?.page);if(!Number.isInteger(page)||page<0)continue;const data=patch.data instanceof Uint8Array?patch.data:new Uint8Array(patch.data||[]),start=page*(v.patchSize||FDS_PATCH_PAGE);if(start>=this.diskData.length)continue;this.diskData.set(data.subarray(0,Math.min(data.length,this.diskData.length-start)),start);this.modifiedPages.add(page)}}
  if(Number.isInteger(v?.side)&&v.side>=0&&v.side<this.sideCount)this.side=v.side;if(Number.isInteger(v?.diskPos))this.diskPos=Math.max(0,Math.min(FDS_SIDE_SIZE,v.diskPos));this.diskDirty=false;this.pendingDirtyPages.clear();
 }
 snapshot(){
  const diskPatches=this.persistent().patches;
  return{format:'NEO-FDS-STATE-v2',side:this.side,inserted:this.inserted,writeProtected:this.writeProtected,diskPos:this.diskPos,transferPhase:this.transferPhase,readData:this.readData,writeData:this.writeData,dataReady:this.dataReady,endOfDisk:this.endOfDisk,timerLatch:this.timerLatch,timerCounter:this.timerCounter,timerEnabled:this.timerEnabled,timerRepeat:this.timerRepeat,timerIrq:this.timerIrq,transferIrq:this.transferIrq,transferIrqEnable:this.transferIrqEnable,diskIoEnable:this.diskIoEnable,soundIoEnable:this.soundIoEnable,scanDisk:this.scanDisk,motorOn:this.motorOn,readMode:this.readMode,crcControl:this.crcControl,crcEnabled:this.crcEnabled,diskReady:this.diskReady,mirroring:this.mirroring,wave:Array.from(this.wave),waveWrite:this.waveWrite,waveMaster:this.waveMaster,freq:this.freq,phase:this.phase,waveHalt:this.waveHalt,envHalt:this.envHalt,envSpeed:this.envSpeed,volEnv:{...this.volEnv},modEnv:{...this.modEnv},modTable:Array.from(this.modTable),modWritePos:this.modWritePos,modFreq:this.modFreq,modPhase:this.modPhase,modCounter:this.modCounter,modDisable:this.modDisable,audioDiv:this.audioDiv,prgRam:Array.from(this.prgRam),chr:Array.from(this.chr),diskDirty:this.diskDirty,diskPatches,transferCount:this.transferCount,diskIrqCount:this.diskIrqCount,timerIrqCount:this.timerIrqCount};
 }
 captureFast(t={}){Object.assign(t,this.snapshot());t.prgRam=t.prgRam instanceof Uint8Array?t.prgRam:new Uint8Array(this.prgRam.length);t.prgRam.set(this.prgRam);t.chr=t.chr instanceof Uint8Array?t.chr:new Uint8Array(this.chr.length);t.chr.set(this.chr);t.wave=t.wave instanceof Uint8Array?t.wave:new Uint8Array(this.wave.length);t.wave.set(this.wave);t.modTable=t.modTable instanceof Uint8Array?t.modTable:new Uint8Array(this.modTable.length);t.modTable.set(this.modTable);return t}
 restore(s){
  if(!s)return;for(const k of ['side','inserted','writeProtected','diskPos','transferPhase','readData','writeData','dataReady','endOfDisk','timerLatch','timerCounter','timerEnabled','timerRepeat','timerIrq','transferIrq','transferIrqEnable','diskIoEnable','soundIoEnable','scanDisk','motorOn','readMode','crcControl','crcEnabled','diskReady','mirroring','waveWrite','waveMaster','freq','phase','waveHalt','envHalt','envSpeed','modWritePos','modFreq','modPhase','modCounter','modDisable','audioDiv','diskDirty','transferCount','diskIrqCount','timerIrqCount'])if(k in s)this[k]=s[k];
  this.ioEnable=this.diskIoEnable;if(s.volEnv)this.volEnv={...s.volEnv};if(s.modEnv)this.modEnv={...s.modEnv};if(s.prgRam)this.prgRam.set(s.prgRam);if(s.chr)this.chr.set(s.chr);if(s.wave)this.wave.set(s.wave);if(s.modTable)this.modTable.set(s.modTable);
  if(Array.isArray(s.diskPatches)){for(const p of s.diskPatches){const start=(p.page|0)*FDS_PATCH_PAGE,data=p.data instanceof Uint8Array?p.data:new Uint8Array(p.data||[]);if(start>=0&&start<this.diskData.length)this.diskData.set(data.subarray(0,Math.min(data.length,this.diskData.length-start)),start)}}
 }
}
