export class SaveMemory {
  constructor(memory) {
    this.memory = memory;
    this.type = "SRAM";
    this.size = 0x10000;
    this.data = new Uint8Array(this.size);
    this.flashIdMode = false;
    this.flashCommandStage = 0;
    this.flashBank = 0;
    this.eepromBits = [];
    this.eepromReadBits = [];
    this.eepromAddressBits = 0;
    this.data.fill(0xFF);
  }

  detectFromROM(bytes) {
    const text = new TextDecoder("ascii").decode(bytes);
    if (text.includes("EEPROM_V")) this.configure("EEPROM");
    else if (text.includes("FLASH1M_V")) this.configure("FLASH1M");
    else if (text.includes("FLASH512_V") || text.includes("FLASH_V")) this.configure("FLASH512");
    else if (text.includes("SRAM_V")) this.configure("SRAM");
    else this.configure("SRAM");
    return this.type;
  }

  configure(type) {
    this.type = type;
    this.size = type === "FLASH1M" ? 0x20000 : type === "EEPROM" ? 0x2000 : 0x10000;
    this.data = new Uint8Array(this.size);
    this.data.fill(0xFF);
    this.flashIdMode=false;this.flashCommandStage=0;this.flashBank=0;
    this.eepromBits=[];this.eepromReadBits=[];this.eepromAddressBits=0;
  }

  _flashOffset(address){const off=address&0xFFFF;return this.type==="FLASH1M"?((this.flashBank&1)*0x10000+off):off;}

  read8(address) {
    const off = address & 0xFFFF;
    if (this.type === "EEPROM") return this.read16(address)&1;
    if (this.flashIdMode && this.type.startsWith("FLASH")) {
      if (off === 0) return 0xC2;
      if (off === 1) return this.type === "FLASH1M" ? 0x09 : 0x1C;
    }
    return this.data[this.type.startsWith("FLASH")?this._flashOffset(address):(off & (this.size-1))];
  }

  _resetFlashCommand(){this.flashCommandStage=0;}
  write8(address, value) {
    const off = address & 0xFFFF; value &= 0xFF;
    if (this.type === "EEPROM") { this.write16(address,value&1); return; }
    if (this.type === "SRAM") { this.data[off & (this.size-1)] = value; return; }
    if (!this.type.startsWith("FLASH")) { this.data[off & (this.size-1)] = value; return; }

    if (value===0xF0) { this.flashIdMode=false; this._resetFlashCommand(); return; }
    switch(this.flashCommandStage){
      case 0:
        if(off===0x5555&&value===0xAA)this.flashCommandStage=1;
        break;
      case 1:
        this.flashCommandStage=(off===0x2AAA&&value===0x55)?2:0;
        break;
      case 2:
        if(off!==0x5555){this._resetFlashCommand();break;}
        if(value===0x90){this.flashIdMode=true;this._resetFlashCommand();}
        else if(value===0xA0)this.flashCommandStage=3;
        else if(value===0x80)this.flashCommandStage=4;
        else if(value===0xB0&&this.type==="FLASH1M")this.flashCommandStage=7;
        else this._resetFlashCommand();
        break;
      case 3: // byte program
        this.data[this._flashOffset(address)] &= value;
        this._resetFlashCommand();
        break;
      case 4: // erase prefix AA
        this.flashCommandStage=(off===0x5555&&value===0xAA)?5:0;
        break;
      case 5: // erase prefix 55
        this.flashCommandStage=(off===0x2AAA&&value===0x55)?6:0;
        break;
      case 6:
        if(off===0x5555&&value===0x10)this.data.fill(0xFF);
        else if(value===0x30){const base=this._flashOffset(address)&~0x0FFF;this.data.fill(0xFF,base,Math.min(base+0x1000,this.data.length));}
        this._resetFlashCommand();
        break;
      case 7:
        this.flashBank=value&1;this._resetFlashCommand();
        break;
      default:this._resetFlashCommand();
    }
  }

  _bitsToInt(bits){let v=0;for(const b of bits)v=(v<<1)|(b&1);return v>>>0;}
  _prepareEEPROMRead(){
    if(this.eepromReadBits.length)return;
    const bits=this.eepromBits;
    if(bits.length!==9&&bits.length!==17)return;
    if(bits[0]!==1||bits[1]!==1)return;
    const addrBits=bits.length-3; this.eepromAddressBits=addrBits;
    const block=this._bitsToInt(bits.slice(2,2+addrBits));
    const base=(block*8)%this.data.length;
    const out=[0,0,0,0];
    for(let i=0;i<8;i++)for(let bit=7;bit>=0;bit--)out.push((this.data[base+i]>>>bit)&1);
    this.eepromReadBits=out;this.eepromBits=[];
  }
  _finishEEPROMWriteIfReady(){
    const bits=this.eepromBits;
    if(bits.length!==73&&bits.length!==81)return false;
    if(bits[0]!==1||bits[1]!==0)return false;
    const addrBits=bits.length-67; this.eepromAddressBits=addrBits;
    const block=this._bitsToInt(bits.slice(2,2+addrBits));
    const base=(block*8)%this.data.length;
    const start=2+addrBits;
    for(let i=0;i<8;i++){let v=0;for(let bit=0;bit<8;bit++)v=(v<<1)|bits[start+i*8+bit];this.data[base+i]=v;}
    this.eepromBits=[];return true;
  }
  read16(){
    this._finishEEPROMWriteIfReady();
    this._prepareEEPROMRead();
    return this.eepromReadBits.length ? this.eepromReadBits.shift() : 1;
  }
  write16(_address,value){
    const bit=value&1;
    if(this.eepromReadBits.length)this.eepromReadBits=[];
    this.eepromBits.push(bit);
    if(this.eepromBits.length>81)this.eepromBits=this.eepromBits.slice(-81);
  }

  exportBytes() { return this.data.slice(); }
  importBytes(bytes) { this.data.fill(0xFF); this.data.set(bytes.subarray(0,this.data.length)); }
  createState(){return{type:this.type,size:this.size,data:Array.from(this.data),flashIdMode:this.flashIdMode,flashCommandStage:this.flashCommandStage,flashBank:this.flashBank,eepromBits:[...this.eepromBits],eepromReadBits:[...this.eepromReadBits],eepromAddressBits:this.eepromAddressBits};}
  restoreState(s){if(!s)return; if(s.type&&s.type!==this.type)this.configure(s.type); if(s.data)this.importBytes(Uint8Array.from(s.data));this.flashIdMode=!!s.flashIdMode;this.flashCommandStage=s.flashCommandStage||0;this.flashBank=s.flashBank||0;this.eepromBits=[...(s.eepromBits||[])];this.eepromReadBits=[...(s.eepromReadBits||[])];this.eepromAddressBits=s.eepromAddressBits||0;}
}
