import {DEFAULT_NES_PALETTE} from './palettes.js';

export class PPU{
 constructor(){
  this.cart=null;this.vram=new Uint8Array(0x1000);this.palette=new Uint8Array(32);this.oam=new Uint8Array(256);
  this.ctrl=0;this.mask=0;this.status=0;this.oamAddr=0;
  // NES internal scrolling registers: v=current VRAM, t=temporary VRAM, x=fine X, w=write latch.
  this.addr=0;this.tempAddr=0;this.fineX=0;this.writeToggle=0;
  this.scrollX=0;this.scrollY=0; // legacy fields retained for old save-state compatibility/diagnostics.
  this.dataBuffer=0;this.openBus=0;this.openBusDecay=0;this.region='NTSC';this.preRenderLine=261;this.totalScanlines=262;this.vblankStart=241;this.ppuHz=5369318;this.scanline=0;this.cycle=0;this.frameComplete=false;this.nmi=false;this.nmiLine=false;this.nmiEdge=false;this.irq=false;this.oddFrame=false;
  this.image=new Uint32Array(256*240);this.displayPalette=new Uint32Array(DEFAULT_NES_PALETTE);this.bgOpaque=new Uint8Array(256*240);this.secondaryOam=new Uint8Array(32);this.secondaryOam.fill(0xff);this.secondaryOamIndex=new Uint8Array(8);this.scanlineSprites=[];this.nextScanlineSprites=[];this.spriteEvalIndex=0;this.spriteEvalFound=0;this.spriteEvalTarget=0;this.spriteEvalActive=false;this.spriteEvalM=0;this.spriteEvalOverflowMode=false;this.dotCounter=0;this.suppressVblank=false;
  // Background fetch pipeline.
  this.bgNextTileId=0;this.bgNextTileAttr=0;this.bgNextTileLsb=0;this.bgNextTileMsb=0;
  this.bgShifterPatternLo=0;this.bgShifterPatternHi=0;this.bgShifterAttrLo=0;this.bgShifterAttrHi=0;
 }
 connectCartridge(c){this.cart=c;this.setRegion(c?.region||'NTSC')}
 setRegion(region){this.region=region==='PAL'?'PAL':region==='Dendy'?'Dendy':'NTSC';if(this.region==='NTSC'){this.preRenderLine=261;this.totalScanlines=262;this.vblankStart=241;this.ppuHz=5369318}else if(this.region==='PAL'){this.preRenderLine=311;this.totalScanlines=312;this.vblankStart=241;this.ppuHz=5320342}else{this.preRenderLine=311;this.totalScanlines=312;this.vblankStart=291;this.ppuHz=5320342}}
 driveOpenBus(v){this.openBus=v&255;this.openBusDecay=Math.max(1,Math.round(this.ppuHz*.6));return this.openBus}
 rendering(){return !!(this.mask&0x18)}
 mirrorAddr(a){a=(a-0x2000)&0x0fff;let table=(a>>10)&3,off=a&0x3ff;const mir=this.cart?.getMirroring?.()||this.cart?.mirroring||'horizontal';if(mir==='vertical')table&=1;else if(mir==='horizontal')table=(table>>1)&1;else if(mir==='single0')table=0;else if(mir==='single1')table=1;else if(mir==='four')return a&0x0fff;return (table&1)*0x400+off}
 ppuRead(a){a&=0x3fff;if(a<0x2000){const v=this.cart?.ppuRead(a,this.dotCounter)||0;if(this.cart?.pollIrq?.())this.irq=true;return v;}if(a<0x3f00){const custom=this.cart?.nametableRead?.(a,this.vram);if(custom!=null)return custom;return this.vram[this.mirrorAddr(a)]}let p=a&0x1f;if(p===0x10)p=0;if(p===0x14)p=4;if(p===0x18)p=8;if(p===0x1c)p=12;let v=this.palette[p]&0x3f;if(this.mask&1)v&=0x30;return v}
 ppuPeek(a){a&=0x3fff;if(a<0x2000)return this.cart?.ppuPeek?.(a)??this.cart?.mapperImpl?.ppuRead?.(a)??0;if(a<0x3f00){const custom=this.cart?.nametableRead?.(a,this.vram);if(custom!=null)return custom;return this.vram[this.mirrorAddr(a)]}let p=a&0x1f;if(p===0x10)p=0;if(p===0x14)p=4;if(p===0x18)p=8;if(p===0x1c)p=12;let v=this.palette[p]&0x3f;if(this.mask&1)v&=0x30;return v}

 ppuWrite(a,v){a&=0x3fff;v&=255;if(a<0x2000){this.cart?.ppuWrite(a,v,this.dotCounter);if(this.cart?.pollIrq?.())this.irq=true;}else if(a<0x3f00){if(!this.cart?.nametableWrite?.(a,v,this.vram))this.vram[this.mirrorAddr(a)]=v}else{let p=a&0x1f;if(p===0x10)p=0;if(p===0x14)p=4;if(p===0x18)p=8;if(p===0x1c)p=12;this.palette[p]=v&0x3f}}
 updateNmiLine(){const line=!!((this.status&0x80)&&(this.ctrl&0x80));if(line&&!this.nmiLine){this.nmiEdge=true;this.nmi=true}this.nmiLine=line}
 pollNmi(){if(!this.nmiEdge)return false;this.nmiEdge=false;this.nmi=false;return true}
 cpuRead(r){r&=7;let val=this.openBus;switch(r){case 2:val=(this.status&0xe0)|(this.openBus&0x1f);if(this.scanline===this.vblankStart&&(this.cycle===0||this.cycle===1))this.suppressVblank=true;this.status&=~0x80;this.updateNmiLine();this.writeToggle=0;break;case 4:val=this.oam[this.oamAddr];break;case 7:{const x=this.ppuRead(this.addr);if(this.addr<0x3f00){val=this.dataBuffer;this.dataBuffer=x}else{val=(this.openBus&0xc0)|(x&0x3f);this.dataBuffer=this.ppuRead((this.addr-0x1000)&0x3fff)}this.incrementCpuVramAddress();break}}return this.driveOpenBus(val)}
 cpuWrite(r,val){r&=7;val&=255;this.driveOpenBus(val);switch(r){case 0:{const oldNmi=!!(this.ctrl&0x80);this.ctrl=val;this.tempAddr=(this.tempAddr&0xf3ff)|((val&3)<<10);this.updateNmiLine();break}case 1:this.mask=val;break;case 3:this.oamAddr=val;break;case 4:this.oam[this.oamAddr]=val;this.oamAddr=(this.oamAddr+1)&255;break;case 5:if(!this.writeToggle){this.scrollX=val;this.fineX=val&7;this.tempAddr=(this.tempAddr&0x7fe0)|(val>>3);this.writeToggle=1}else{this.scrollY=val;this.tempAddr=(this.tempAddr&0x0c1f)|((val&7)<<12)|((val&0xf8)<<2);this.writeToggle=0}break;case 6:if(!this.writeToggle){this.tempAddr=(this.tempAddr&0x00ff)|((val&0x3f)<<8);this.writeToggle=1}else{this.tempAddr=(this.tempAddr&0xff00)|val;this.addr=this.tempAddr;this.writeToggle=0}break;case 7:this.ppuWrite(this.addr,val);this.incrementCpuVramAddress();break}}
 setDisplayPalette(values){if(!values||values.length<64)throw new Error('Paleta inválida');for(let i=0;i<64;i++)this.displayPalette[i]=Number(values[i])&0xffffff}
 resetDisplayPalette(){this.displayPalette.set(DEFAULT_NES_PALETTE)}
 rgb(ci){if(this.mask&1)ci&=0x30;const rgb=this.displayPalette[ci&0x3f]||0;let r=(rgb>>16)&255,g=(rgb>>8)&255,b=rgb&255;const e=(this.mask>>5)&7;if(e){const boost=1.08,dim=.82;if(e&1){r*=boost;g*=dim;b*=dim}if(e&2){g*=boost;r*=dim;b*=dim}if(e&4){b*=boost;r*=dim;g*=dim}r=Math.max(0,Math.min(255,r|0));g=Math.max(0,Math.min(255,g|0));b=Math.max(0,Math.min(255,b|0))}return 0xff000000|(b<<16)|(g<<8)|r}


 incrementCpuVramAddress(){
  const active=this.rendering()&&((this.scanline>=0&&this.scanline<240)||this.scanline===this.preRenderLine)&&((this.cycle>=1&&this.cycle<=256)||(this.cycle>=321&&this.cycle<=336));
  if(active){this.incrementScrollX();this.incrementScrollY()}else this.addr=(this.addr+((this.ctrl&4)?32:1))&0x7fff;
 }
 beginSpriteEvaluation(targetY){this.nextScanlineSprites.length=0;this.spriteEvalIndex=0;this.spriteEvalFound=0;this.spriteEvalTarget=targetY;this.spriteEvalActive=targetY>=0&&targetY<240;this.spriteEvalM=0;this.spriteEvalOverflowMode=false;this.secondaryOam.fill(0xff);this.secondaryOamIndex.fill(0xff);}
 stepSpriteEvaluation(){if(!this.spriteEvalActive||this.spriteEvalIndex>=64)return;const h=(this.ctrl&0x20)?16:8,y=this.spriteEvalTarget,n=this.spriteEvalIndex;let o=n*4;
  if(!this.spriteEvalOverflowMode){const sy=(this.oam[o]+1)&255;this.spriteEvalIndex++;if(y<sy||y>=sy+h)return;const slot=this.spriteEvalFound;this.secondaryOam[slot*4]=this.oam[o];this.secondaryOam[slot*4+1]=this.oam[o+1];this.secondaryOam[slot*4+2]=this.oam[o+2];this.secondaryOam[slot*4+3]=this.oam[o+3];this.secondaryOamIndex[slot]=n;this.spriteEvalFound++;this.nextScanlineSprites.push({i:n,sy,tile:this.oam[o+1],attr:this.oam[o+2],sx:this.oam[o+3]});if(this.spriteEvalFound>=8){this.spriteEvalOverflowMode=true;this.spriteEvalM=0}return}
  // Approximate the 2C02 overflow bug: after eight sprites, the internal m counter can walk diagonally through OAM bytes.
  o=n*4+(this.spriteEvalM&3);const candidate=(this.oam[o]+1)&255,inRange=y>=candidate&&y<candidate+h;this.spriteEvalIndex++;if(inRange){this.status|=0x20;this.spriteEvalM=(this.spriteEvalM+1)&3}
 }
 finishSpriteEvaluation(){const h=(this.ctrl&0x20)?16:8,y=this.spriteEvalTarget;this.scanlineSprites.length=0;for(const q of this.nextScanlineSprites){let row=y-q.sy;if(q.attr&0x80)row=h-1-row;let pt,tileIndex,fineY;if(h===16){pt=(q.tile&1)*0x1000;tileIndex=q.tile&0xfe;if(row>=8){tileIndex++;fineY=row-8}else fineY=row}else{pt=(this.ctrl&0x08)?0x1000:0;tileIndex=q.tile;fineY=row}const lo=this.ppuRead(pt+tileIndex*16+fineY),hi=this.ppuRead(pt+tileIndex*16+fineY+8);this.scanlineSprites.push({i:q.i,attr:q.attr,sx:q.sx,lo,hi});}this.spriteEvalActive=false;}

 // ---- Background pipeline ----
 loadBackgroundShifters(){
  this.bgShifterPatternLo=((this.bgShifterPatternLo&0xff00)|this.bgNextTileLsb)&0xffff;
  this.bgShifterPatternHi=((this.bgShifterPatternHi&0xff00)|this.bgNextTileMsb)&0xffff;
  this.bgShifterAttrLo=((this.bgShifterAttrLo&0xff00)|((this.bgNextTileAttr&1)?0xff:0x00))&0xffff;
  this.bgShifterAttrHi=((this.bgShifterAttrHi&0xff00)|((this.bgNextTileAttr&2)?0xff:0x00))&0xffff;
 }
 shiftBackground(){this.bgShifterPatternLo=(this.bgShifterPatternLo<<1)&0xffff;this.bgShifterPatternHi=(this.bgShifterPatternHi<<1)&0xffff;this.bgShifterAttrLo=(this.bgShifterAttrLo<<1)&0xffff;this.bgShifterAttrHi=(this.bgShifterAttrHi<<1)&0xffff}
 incrementScrollX(){if(!this.rendering())return;if((this.addr&0x001f)===31){this.addr&=~0x001f;this.addr^=0x0400}else this.addr=(this.addr+1)&0x7fff}
 incrementScrollY(){if(!this.rendering())return;if((this.addr&0x7000)!==0x7000)this.addr=(this.addr+0x1000)&0x7fff;else{this.addr&=~0x7000;let y=(this.addr&0x03e0)>>5;if(y===29){y=0;this.addr^=0x0800}else if(y===31)y=0;else y++;this.addr=(this.addr&~0x03e0)|(y<<5)}}
 transferAddressX(){if(this.rendering())this.addr=(this.addr&~0x041f)|(this.tempAddr&0x041f)}
 transferAddressY(){if(this.rendering())this.addr=(this.addr&~0x7be0)|(this.tempAddr&0x7be0)}
 fetchBackground(){
  // Called during cycles 1-256 and 321-336. Each 8-cycle group reproduces the NES fetch sequence.
  switch((this.cycle-1)&7){
   case 0:this.loadBackgroundShifters();this.bgNextTileId=this.ppuRead(0x2000|(this.addr&0x0fff));break;
   case 2:{let a=this.ppuRead(0x23c0|(this.addr&0x0c00)|((this.addr>>4)&0x38)|((this.addr>>2)&0x07));if(this.addr&0x40)a>>=4;if(this.addr&0x02)a>>=2;this.bgNextTileAttr=a&3;break}
   case 4:{const fineY=(this.addr>>12)&7;this.bgNextTileLsb=this.ppuRead(((this.ctrl&0x10)?0x1000:0)+(this.bgNextTileId<<4)+fineY);break}
   case 6:{const fineY=(this.addr>>12)&7;this.bgNextTileMsb=this.ppuRead(((this.ctrl&0x10)?0x1000:0)+(this.bgNextTileId<<4)+fineY+8);break}
   case 7:this.incrementScrollX();break;
  }
 }
 backgroundPixel(x){
  if(!(this.mask&0x08)||(!(this.mask&0x02)&&x<8))return 0;
  const mux=0x8000>>this.fineX;
  const p0=(this.bgShifterPatternLo&mux)?1:0,p1=(this.bgShifterPatternHi&mux)?1:0,pixel=p0|(p1<<1);
  if(!pixel)return 0;
  const a0=(this.bgShifterAttrLo&mux)?1:0,a1=(this.bgShifterAttrHi&mux)?1:0;
  return 0x100|((a0|(a1<<1))<<2)|pixel;
 }

 // Sprite evaluation is still scanline-level in v1.8, but pattern bytes are fetched once per sprite row rather than once per pixel.
 // Sprite evaluation is performed incrementally across PPU cycles 65-256 for the next scanline.
 spritePixel(x){if(!(this.mask&0x10)||(!(this.mask&0x04)&&x<8))return 0;for(let si=0;si<this.scanlineSprites.length;si++){const s=this.scanlineSprites[si],col=x-s.sx;if(col<0||col>=8)continue;const bit=(s.attr&0x40)?col:(7-col),px=((s.lo>>bit)&1)|(((s.hi>>bit)&1)<<1);if(!px)continue;const pal=(s.attr&3)<<2;return 0x100|(s.attr&0x20?0x200:0)|(s.i===0?0x400:0)|pal|px}return 0}
 renderPixel(x,y){
  const bg=this.backgroundPixel(x),opaque=!!(bg&0x100),idx=y*256+x;this.bgOpaque[idx]=opaque?1:0;
  const sp=this.spritePixel(x);
  if((sp&0x400)&&opaque&&x<255&&(this.mask&0x18)===0x18)this.status|=0x40;
  let ci;if(sp&&(!(sp&0x200)||!opaque))ci=this.ppuRead(0x3f10+(sp&0x0f));else if(opaque)ci=this.ppuRead(0x3f00+(bg&0x0f));else ci=this.ppuRead(0x3f00);
  this.image[idx]=this.rgb(ci);
 }

 clock(){
  if(this.openBusDecay>0&&--this.openBusDecay===0)this.openBus=0;
  const rendering=this.rendering(),pre=this.scanline===this.preRenderLine,visible=this.scanline>=0&&this.scanline<240,renderLine=visible||pre;
  if(pre&&this.cycle===1){this.cart?.onFrameStart?.();this.status&=~0xe0;this.nmi=false;this.nmiEdge=false;this.updateNmiLine();this.suppressVblank=false}

  // Visible pixel is sampled from current shifters before they advance for this PPU dot.
  if(visible&&this.cycle>=1&&this.cycle<=256)this.renderPixel(this.cycle-1,this.scanline);

  if(renderLine&&rendering){
   if((this.cycle>=1&&this.cycle<=256)||(this.cycle>=321&&this.cycle<=336)){
    this.shiftBackground();
    this.fetchBackground();
   }
   if(this.cycle===256)this.incrementScrollY();
   if(this.cycle===257){this.loadBackgroundShifters();this.transferAddressX();this.finishSpriteEvaluation()}
   if(pre&&this.cycle>=280&&this.cycle<=304)this.transferAddressY();
   if(this.cycle===338||this.cycle===340)this.bgNextTileId=this.ppuRead(0x2000|(this.addr&0x0fff));
  }

  // Secondary-OAM style evaluation spread over PPU dots, rather than one scanline-level burst.
  if(renderLine&&this.cycle===1)this.beginSpriteEvaluation(pre?0:this.scanline+1);
  // 2C02 secondary OAM clear phase: 32 bytes are cleared over dots 1-64.
  if(renderLine&&this.cycle>=1&&this.cycle<=64&&((this.cycle&1)===0))this.secondaryOam[(this.cycle>>1)-1]=0xff;
  // Evaluation phase occupies dots 65-256; one candidate is advanced every two PPU dots in this model.
  if(renderLine&&this.cycle>=65&&this.cycle<=256&&((this.cycle-65)%2===0))this.stepSpriteEvaluation();

  // Odd frame dot skip when rendering enabled.
  if(this.region==='NTSC'&&pre&&this.cycle===339&&this.oddFrame&&rendering){this.cycle=0;this.scanline=0;this.frameComplete=true;this.oddFrame=!this.oddFrame;return}

  this.cycle++;this.dotCounter++;
  if(this.cycle>=341){this.cycle=0;if(this.scanline>=0&&this.scanline<240&&this.rendering()&&this.cart?.clockScanline?.())this.irq=true;this.scanline++;if(this.scanline===this.vblankStart){this.cart?.onVBlank?.();if(!this.suppressVblank){this.status|=0x80;this.updateNmiLine()}else this.suppressVblank=false}if(this.scanline>=this.totalScanlines){this.scanline=0;this.frameComplete=true;this.oddFrame=!this.oddFrame}}
 }

 captureFast(t={}){t.vram=t.vram instanceof Uint8Array?t.vram:new Uint8Array(this.vram.length);t.palette=t.palette instanceof Uint8Array?t.palette:new Uint8Array(this.palette.length);t.oam=t.oam instanceof Uint8Array?t.oam:new Uint8Array(this.oam.length);t.secondaryOam=t.secondaryOam instanceof Uint8Array?t.secondaryOam:new Uint8Array(32);t.secondaryOamIndex=t.secondaryOamIndex instanceof Uint8Array?t.secondaryOamIndex:new Uint8Array(8);t.vram.set(this.vram);t.palette.set(this.palette);t.oam.set(this.oam);t.secondaryOam.set(this.secondaryOam);t.secondaryOamIndex.set(this.secondaryOamIndex);for(const k of ['ctrl','mask','status','oamAddr','addr','tempAddr','fineX','writeToggle','scrollX','scrollY','dataBuffer','openBus','openBusDecay','scanline','cycle','bgNextTileId','bgNextTileAttr','bgNextTileLsb','bgNextTileMsb','bgShifterPatternLo','bgShifterPatternHi','bgShifterAttrLo','bgShifterAttrHi','spriteEvalIndex','spriteEvalFound','spriteEvalTarget','spriteEvalM','dotCounter'])t[k]=this[k];t.region=this.region;t.oddFrame=this.oddFrame;t.suppressVblank=this.suppressVblank;t.spriteEvalOverflowMode=this.spriteEvalOverflowMode;t.nmiLine=this.nmiLine;t.nmiEdge=this.nmiEdge;return t}
 snapshot(){return {vram:Array.from(this.vram),palette:Array.from(this.palette),oam:Array.from(this.oam),secondaryOam:Array.from(this.secondaryOam),secondaryOamIndex:Array.from(this.secondaryOamIndex),ctrl:this.ctrl,mask:this.mask,status:this.status,oamAddr:this.oamAddr,addr:this.addr,tempAddr:this.tempAddr,fineX:this.fineX,writeToggle:this.writeToggle,scrollX:this.scrollX,scrollY:this.scrollY,dataBuffer:this.dataBuffer,openBus:this.openBus,openBusDecay:this.openBusDecay,region:this.region,scanline:this.scanline,cycle:this.cycle,oddFrame:this.oddFrame,bgNextTileId:this.bgNextTileId,bgNextTileAttr:this.bgNextTileAttr,bgNextTileLsb:this.bgNextTileLsb,bgNextTileMsb:this.bgNextTileMsb,bgShifterPatternLo:this.bgShifterPatternLo,bgShifterPatternHi:this.bgShifterPatternHi,bgShifterAttrLo:this.bgShifterAttrLo,bgShifterAttrHi:this.bgShifterAttrHi,spriteEvalIndex:this.spriteEvalIndex,spriteEvalFound:this.spriteEvalFound,spriteEvalTarget:this.spriteEvalTarget,dotCounter:this.dotCounter,suppressVblank:this.suppressVblank,spriteEvalM:this.spriteEvalM,spriteEvalOverflowMode:this.spriteEvalOverflowMode,nmiLine:this.nmiLine,nmiEdge:this.nmiEdge}}
 restore(s){if(!s)return;this.vram.set(s.vram||[]);this.palette.set(s.palette||[]);this.oam.set(s.oam||[]);this.secondaryOam.set(s.secondaryOam||new Uint8Array(32).fill(0xff));this.secondaryOamIndex.set(s.secondaryOamIndex||new Uint8Array(8).fill(0xff));for(const k of ['ctrl','mask','status','oamAddr','addr','tempAddr','fineX','writeToggle','scrollX','scrollY','dataBuffer','openBus','openBusDecay','scanline','cycle','bgNextTileId','bgNextTileAttr','bgNextTileLsb','bgNextTileMsb','bgShifterPatternLo','bgShifterPatternHi','bgShifterAttrLo','bgShifterAttrHi','spriteEvalIndex','spriteEvalFound','spriteEvalTarget','spriteEvalM','dotCounter'])this[k]=s[k]??0;if(s.region)this.setRegion(s.region);this.oddFrame=!!s.oddFrame;this.suppressVblank=!!s.suppressVblank;this.spriteEvalM=s.spriteEvalM||0;this.spriteEvalOverflowMode=!!s.spriteEvalOverflowMode;this.nmiLine=!!s.nmiLine;this.nmiEdge=!!s.nmiEdge;this.frameComplete=false;this.nmi=this.nmiEdge;this.irq=false;this.scanlineSprites.length=0;this.nextScanlineSprites.length=0;this.spriteEvalActive=false}
}
