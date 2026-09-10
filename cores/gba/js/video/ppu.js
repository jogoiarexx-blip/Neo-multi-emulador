export class PPU {
  constructor(canvas, memory, dma = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.memory = memory;
    this.dma = dma;
    this.frame = 0;
    this.vcount = 0;
    this.dotCycles = 0;
    this.cyclesPerLine = 1232;
    this.visibleLines = 160;
    this.totalLines = 228;
    this.image = this.ctx.createImageData(240,160);
    this.clear();
  }

  reset() {
    this.frame = 0;
    this.vcount = 0;
    this.dotCycles = 0;
    this._writeVCount();
    this.clear();
  }

  clear() {
    this.ctx.fillStyle = "#0b1020";
    this.ctx.fillRect(0, 0, 240, 160);
  }

  _read16IO(off) {
    return this.memory.io[off] | (this.memory.io[off+1] << 8);
  }

  _write16IO(off, v) {
    this.memory.io[off] = v & 0xFF;
    this.memory.io[off+1] = (v >>> 8) & 0xFF;
  }

  _writeVCount() {
    this._write16IO(0x006, this.vcount & 0xFFFF);
  }

  _setDispstatBit(bit, on) {
    let v = this._read16IO(0x004);
    if (on) v |= (1 << bit);
    else v &= ~(1 << bit);
    this._write16IO(0x004, v);
  }

  _raiseIRQ(bit) {
    let iff = this._read16IO(0x202);
    iff |= (1 << bit);
    this._write16IO(0x202, iff);
  }

  _checkVCountIRQ() {
    const dispstat = this._read16IO(0x004);
    const compare = (dispstat >>> 8) & 0xFF;
    const match = this.vcount === compare;
    this._setDispstatBit(2, match);
    if (match && (dispstat & (1<<5))) this._raiseIRQ(2);
  }

  _rgb555(v) {
    const r = (v & 31) << 3;
    const g = ((v >>> 5) & 31) << 3;
    const b = ((v >>> 10) & 31) << 3;
    return [r|r>>>5, g|g>>>5, b|b>>>5];
  }

  _setPixel(x,y,color) {
    if (x<0 || x>=240 || y<0 || y>=160) return;
    const [r,g,b] = this._rgb555(color);
    const p = (y*240+x)*4;
    const d = this.image.data;
    d[p]=r; d[p+1]=g; d[p+2]=b; d[p+3]=255;
  }

  _renderMode3Line(y) {
    for (let x=0;x<240;x++) {
      const off = (y*240 + x)*2;
      const color = this.memory.vram[off] | (this.memory.vram[off+1] << 8);
      this._setPixel(x,y,color);
    }
  }

  _renderMode4Line(y) {
    const dispcnt = this._read16IO(0x000);
    const page = (dispcnt & (1<<4)) ? 0xA000 : 0;
    for (let x=0;x<240;x++) {
      const idx = this.memory.vram[page + y*240 + x] || 0;
      const po = idx * 2;
      const color = this.memory.palette[po] | (this.memory.palette[po+1] << 8);
      this._setPixel(x,y,color);
    }
  }

  _renderMode5Line(y) {
    const dispcnt = this._read16IO(0x000);
    const page = (dispcnt & (1<<4)) ? 0xA000 : 0;
    const width = 160, height = 128;
    for (let x=0;x<240;x++) {
      if (x >= width || y >= height) {
        this._setPixel(x,y,0);
        continue;
      }
      const off = page + (y*width + x)*2;
      const color = this.memory.vram[off] | (this.memory.vram[off+1] << 8);
      this._setPixel(x,y,color);
    }
  }

  _renderFallbackLine(y) {
    const backdrop = this.memory.palette[0] | (this.memory.palette[1] << 8);
    for (let x=0;x<240;x++) this._setPixel(x,y,backdrop);
  }

  _objSize(shape, size) {
    const table = [
      [[8,8],[16,16],[32,32],[64,64]],
      [[16,8],[32,8],[32,16],[64,32]],
      [[8,16],[8,32],[16,32],[32,64]]
    ];
    return (table[shape] || table[0])[size] || [8,8];
  }


  _bgSize(sizeCode) {
    return [
      [256,256],
      [512,256],
      [256,512],
      [512,512]
    ][sizeCode & 3];
  }

  _screenEntry(screenBase, mapWidthTiles, tx, ty) {
    const blockX = tx >> 5;
    const blockY = ty >> 5;
    const blocksPerRow = mapWidthTiles >> 5;
    const screenBlock = screenBase + blockY * blocksPerRow + blockX;
    const localX = tx & 31;
    const localY = ty & 31;
    const addr = screenBlock * 0x800 + (localY * 32 + localX) * 2;
    return this.memory.vram[addr] | (this.memory.vram[addr+1] << 8);
  }

  _renderTextBGLine(bg, y, out) {
    const cnt = this._read16IO(0x008 + bg*2);
    const priority = cnt & 3;
    const charBase = ((cnt >>> 2) & 3) * 0x4000;
    const color256 = !!(cnt & (1<<7));
    const screenBase = (cnt >>> 8) & 0x1F;
    const sizeCode = (cnt >>> 14) & 3;
    const [bgW,bgH] = this._bgSize(sizeCode);
    const mapWTiles = bgW >> 3;

    const hofs = this._read16IO(0x010 + bg*4) & 0x1FF;
    const vofs = this._read16IO(0x012 + bg*4) & 0x1FF;

    const sy = (y + vofs) % bgH;
    const tileY = sy >> 3;
    const inY = sy & 7;

    for (let x=0;x<240;x++) {
      const sx = (x + hofs) % bgW;
      const tileX = sx >> 3;
      const inX = sx & 7;
      const entry = this._screenEntry(screenBase, mapWTiles, tileX, tileY);
      const tileIndex = entry & 0x3FF;
      const hflip = !!(entry & (1<<10));
      const vflip = !!(entry & (1<<11));
      const palBank = (entry >>> 12) & 0xF;

      const px = hflip ? 7-inX : inX;
      const py = vflip ? 7-inY : inY;
      let idx = 0;

      if (color256) {
        const addr = charBase + tileIndex*64 + py*8 + px;
        idx = this.memory.vram[addr] || 0;
        if (idx === 0) continue;
        const po = idx*2;
        const color = this.memory.palette[po] | (this.memory.palette[po+1]<<8);
        const cur = out[x];
        if (!cur || priority < cur.priority) out[x] = {priority,color,bg};
      } else {
        const addr = charBase + tileIndex*32 + py*4 + (px>>1);
        const b = this.memory.vram[addr] || 0;
        idx = (px & 1) ? (b>>>4) : (b&0xF);
        if (idx === 0) continue;
        const po = (palBank*16 + idx)*2;
        const color = this.memory.palette[po] | (this.memory.palette[po+1]<<8);
        const cur = out[x];
        if (!cur || priority < cur.priority) out[x] = {priority,color,bg};
      }
    }
  }

  _renderMode0Line(y) {
    const dispcnt = this._read16IO(0x000);
    const layers = new Array(240).fill(null);

    for (let bg=0; bg<4; bg++) {
      if (!(dispcnt & (1 << (8+bg)))) continue;
      this._renderTextBGLine(bg, y, layers);
    }

    const backdrop = this.memory.palette[0] | (this.memory.palette[1] << 8);
    for (let x=0;x<240;x++) {
      const color = layers[x] ? layers[x].color : backdrop;
      this._setPixel(x,y,color);
    }
  }


  _readS16IO(off) {
    const v = this._read16IO(off);
    return v & 0x8000 ? v - 0x10000 : v;
  }

  _readS28IO(off) {
    const b0 = this.memory.io[off];
    const b1 = this.memory.io[off+1];
    const b2 = this.memory.io[off+2];
    const b3 = this.memory.io[off+3];
    let v = (b0 | (b1<<8) | (b2<<16) | ((b3 & 0x0F)<<24)) >>> 0;
    if (v & 0x08000000) v |= 0xF0000000;
    return v | 0;
  }

  _affineBgDims(sizeCode) {
    return [128,256,512,1024][sizeCode & 3];
  }

  _renderAffineBGLine(bg, y, out) {
    const cnt = this._read16IO(0x008 + bg*2);
    const priority = cnt & 3;
    const charBase = ((cnt >>> 2) & 3) * 0x4000;
    const mosaic = !!(cnt & (1<<6));
    const screenBase = (cnt >>> 8) & 0x1F;
    const wrap = !!(cnt & (1<<13));
    const sizeCode = (cnt >>> 14) & 3;
    const dim = this._affineBgDims(sizeCode);

    const regBase = bg === 2 ? 0x020 : 0x030;
    const pa = this._readS16IO(regBase + 0);
    const pb = this._readS16IO(regBase + 2);
    const pc = this._readS16IO(regBase + 4);
    const pd = this._readS16IO(regBase + 6);
    const xRef = this._readS28IO(regBase + 8);
    const yRef = this._readS28IO(regBase + 12);

    let mosaicH = 1, mosaicV = 1;
    if (mosaic) {
      const m = this._read16IO(0x04C);
      mosaicH = (m & 0xF) + 1;
      mosaicV = ((m >>> 4) & 0xF) + 1;
    }

    const srcYScreen = mosaic ? (Math.floor(y / mosaicV) * mosaicV) : y;

    for (let x=0;x<240;x++) {
      const srcXScreen = mosaic ? (Math.floor(x / mosaicH) * mosaicH) : x;
      let sx = (xRef + pa*srcXScreen + pb*srcYScreen) >> 8;
      let sy = (yRef + pc*srcXScreen + pd*srcYScreen) >> 8;

      if (wrap) {
        sx = ((sx % dim) + dim) % dim;
        sy = ((sy % dim) + dim) % dim;
      } else if (sx < 0 || sy < 0 || sx >= dim || sy >= dim) {
        continue;
      }

      const tx = sx >> 3;
      const ty = sy >> 3;
      const inX = sx & 7;
      const inY = sy & 7;
      const tilesPerRow = dim >> 3;
      const mapAddr = screenBase * 0x800 + ty * tilesPerRow + tx;
      const tileIndex = this.memory.vram[mapAddr] || 0;
      const tileAddr = charBase + tileIndex*64 + inY*8 + inX;
      const idx = this.memory.vram[tileAddr] || 0;
      if (idx === 0) continue;

      const po = idx * 2;
      const color = this.memory.palette[po] | (this.memory.palette[po+1] << 8);
      const cur = out[x];
      if (!cur || priority < cur.priority) out[x] = {priority,color,bg};
    }
  }

  _composeLayerBuffer(y, layers) {
    const backdrop = this.memory.palette[0] | (this.memory.palette[1] << 8);
    for (let x=0;x<240;x++) {
      const top=layers[x];
      const topBit=top ? (1<<top.bg) : (1<<5);
      const color=this._applySpecialEffect(top?top.color:backdrop, backdrop, topBit, (1<<5), x, y);
      this._setPixel(x,y,color);
    }
  }

  _renderMode1Line(y) {
    const dispcnt = this._read16IO(0x000);
    const layers = new Array(240).fill(null);
    for (let bg=0; bg<=1; bg++) {
      if (dispcnt & (1 << (8+bg))) this._renderTextBGLine(bg,y,layers);
    }
    if (dispcnt & (1<<10)) this._renderAffineBGLine(2,y,layers);
    this._composeLayerBuffer(y,layers);
  }

  _renderMode2Line(y) {
    const dispcnt = this._read16IO(0x000);
    const layers = new Array(240).fill(null);
    if (dispcnt & (1<<10)) this._renderAffineBGLine(2,y,layers);
    if (dispcnt & (1<<11)) this._renderAffineBGLine(3,y,layers);
    this._composeLayerBuffer(y,layers);
  }

  _renderSpritesLine(y) {
    const dispcnt = this._read16IO(0x000);
    if (!(dispcnt & (1<<12))) return; // OBJ enable

    for (let i=127;i>=0;i--) {
      const o = i*8;
      const attr0 = this.memory.oam[o] | (this.memory.oam[o+1]<<8);
      const attr1 = this.memory.oam[o+2] | (this.memory.oam[o+3]<<8);
      const attr2 = this.memory.oam[o+4] | (this.memory.oam[o+5]<<8);

      const y0 = attr0 & 0xFF;
      const objMode = (attr0 >>> 8) & 0x3;
      const affine = !!(attr0 & (1<<8));
      const doubleSize = affine && !!(attr0 & (1<<9));
      const objMosaic = !!(attr0 & (1<<12));
      const color256 = !!(attr0 & (1<<13));
      const shape = (attr0 >>> 14) & 0x3;
      const x0 = attr1 & 0x1FF;
      const size = (attr1 >>> 14) & 0x3;
      let [w,h] = this._objSize(shape,size);
      const baseW=w, baseH=h;
      const affineIndex=(attr1>>>9)&0x1F;
      if (doubleSize) { w*=2; h*=2; }
      const sy = y0 >= 160 ? y0 - 256 : y0;
      const sx = x0 >= 240 ? x0 - 512 : x0;

      if (objMode === 2) continue;
      if (y < sy || y >= sy+h) continue;

      let line = y - sy;
      let objMosaicH = 1, objMosaicV = 1;
      if (objMosaic) {
        const m = this._read16IO(0x04C);
        objMosaicH = ((m >>> 8) & 0xF) + 1;
        objMosaicV = ((m >>> 12) & 0xF) + 1;
        line = Math.floor(line / objMosaicV) * objMosaicV;
      }
      const tileIndex = attr2 & 0x3FF;
      const palBank = (attr2 >>> 12) & 0xF;

      for (let px=0;px<w;px++) {
        const x = sx + px;
        if (x<0 || x>=240) continue;

        const samplePx = objMosaic ? Math.floor(px / objMosaicH) * objMosaicH : px;
        const tileX = samplePx >> 3;
        const tileY = sampleLine >> 3;
        const inX = samplePx & 7;
        const inY = sampleLine & 7;

        let colorIndex = 0;
        if (color256) {
          const tile = tileIndex + tileY*(w>>3) + tileX;
          const addr = 0x10000 + tile*64 + inY*8 + inX;
          colorIndex = this.memory.vram[addr] || 0;
          if (!colorIndex) continue;
          const po = 0x200 + colorIndex*2;
          const color = this.memory.palette[po] | (this.memory.palette[po+1]<<8);
          this._setPixel(x,y,color);
        } else {
          const tile = tileIndex + tileY*(w>>3) + tileX;
          const addr = 0x10000 + tile*32 + inY*4 + (inX>>1);
          const b = this.memory.vram[addr] || 0;
          colorIndex = (inX & 1) ? (b>>>4) : (b&0xF);
          if (!colorIndex) continue;
          const po = 0x200 + (palBank*16 + colorIndex)*2;
          const color = this.memory.palette[po] | (this.memory.palette[po+1]<<8);
          this._setPixel(x,y,color);
        }
      }
    }
  }


  _blend555(a, b, eva, evb) {
    eva = Math.min(16, eva); evb = Math.min(16, evb);
    const ar=a&31, ag=(a>>>5)&31, ab=(a>>>10)&31;
    const br=b&31, bg=(b>>>5)&31, bb=(b>>>10)&31;
    const r=Math.min(31,((ar*eva+br*evb)>>4));
    const g=Math.min(31,((ag*eva+bg*evb)>>4));
    const bl=Math.min(31,((ab*eva+bb*evb)>>4));
    return r|(g<<5)|(bl<<10);
  }

  _brighten555(c, evy) {
    evy=Math.min(16,evy);
    const r=c&31,g=(c>>>5)&31,b=(c>>>10)&31;
    return (r+(((31-r)*evy)>>4)) | ((g+(((31-g)*evy)>>4))<<5) | ((b+(((31-b)*evy)>>4))<<10);
  }

  _darken555(c, evy) {
    evy=Math.min(16,evy);
    const r=c&31,g=(c>>>5)&31,b=(c>>>10)&31;
    return (r-((r*evy)>>4)) | ((g-((g*evy)>>4))<<5) | ((b-((b*evy)>>4))<<10);
  }

  _windowContains(x,y,hOff,vOff) {
    const h=this._read16IO(hOff), v=this._read16IO(vOff);
    const x1=(h>>>8)&255,x2=h&255,y1=(v>>>8)&255,y2=v&255;
    const inX=x1<=x2?(x>=x1&&x<x2):(x>=x1||x<x2);
    const inY=y1<=y2?(y>=y1&&y<y2):(y>=y1||y<y2);
    return inX&&inY;
  }

  _windowMaskForPixel(x,y) {
    const dispcnt=this._read16IO(0x000), winin=this._read16IO(0x048), winout=this._read16IO(0x04A);
    if ((dispcnt&(1<<13)) && this._windowContains(x,y,0x040,0x044)) return winin&0x3F;
    if ((dispcnt&(1<<14)) && this._windowContains(x,y,0x042,0x046)) return (winin>>>8)&0x3F;
    return winout&0x3F;
  }

  _applySpecialEffect(color, secondColor, topBit, secondBit, x, y) {
    if (!(this._windowMaskForPixel(x,y)&0x20)) return color;
    const bldcnt=this._read16IO(0x050), mode=(bldcnt>>>6)&3;
    if (!(bldcnt&topBit)) return color;
    if (mode===1 && secondColor!=null && (((bldcnt>>>8)&0x3F)&secondBit)) {
      const a=this._read16IO(0x052);
      return this._blend555(color,secondColor,a&31,(a>>>8)&31);
    }
    if (mode===2) return this._brighten555(color,this._read16IO(0x054)&31);
    if (mode===3) return this._darken555(color,this._read16IO(0x054)&31);
    return color;
  }

  renderLine(y) {
    const dispcnt = this._read16IO(0x000);
    const mode = dispcnt & 0x7;
    const forcedBlank = !!(dispcnt & 0x80);

    if (forcedBlank) {
      for (let x=0;x<240;x++) this._setPixel(x,y,0x7FFF);
      return;
    }

    if (mode === 0) this._renderMode0Line(y);
    else if (mode === 1) this._renderMode1Line(y);
    else if (mode === 2) this._renderMode2Line(y);
    else if (mode === 3) this._renderMode3Line(y);
    else if (mode === 4) this._renderMode4Line(y);
    else if (mode === 5) this._renderMode5Line(y);
    else this._renderFallbackLine(y);

    this._renderSpritesLine(y);
  }

  _enterHBlank() {
    this._setDispstatBit(1, true);
    const dispstat = this._read16IO(0x004);
    if (dispstat & (1<<4)) this._raiseIRQ(1);
    if (this.dma) this.dma.trigger(2);
  }

  _leaveHBlank() {
    this._setDispstatBit(1, false);
  }

  _advanceLine() {
    if (this.vcount < this.visibleLines) this.renderLine(this.vcount);

    this.vcount++;
    if (this.vcount === this.visibleLines) {
      this._setDispstatBit(0, true);
      const dispstat = this._read16IO(0x004);
      if (dispstat & (1<<3)) this._raiseIRQ(0);
      if (this.dma) this.dma.trigger(1);
      this.ctx.putImageData(this.image, 0, 0);
      this.frame++;
    }

    if (this.vcount >= this.totalLines) {
      this.vcount = 0;
      this._setDispstatBit(0, false);
    }

    this._writeVCount();
    this._checkVCountIRQ();
  }

  tick(cycles) {
    this.dotCycles += cycles;
    if (this.dotCycles >= 960 && this.dotCycles - cycles < 960) this._enterHBlank();
    while (this.dotCycles >= this.cyclesPerLine) {
      this.dotCycles -= this.cyclesPerLine;
      this._leaveHBlank();
      this._advanceLine();
    }
  }

  testPattern(label = "ROM CARREGADA") {
    const g = this.ctx.createLinearGradient(0, 0, 240, 160);
    g.addColorStop(0, "#111827");
    g.addColorStop(1, "#312e81");
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, 240, 160);
    this.ctx.fillStyle = "#f8fafc";
    this.ctx.textAlign = "center";
    this.ctx.font = "bold 14px monospace";
    this.ctx.fillText("NEO GBA", 120, 66);
    this.ctx.font = "10px monospace";
    this.ctx.fillStyle = "#c4b5fd";
    this.ctx.fillText(label.slice(0, 28), 120, 86);
  }
}
