export class Controller {
  constructor(map=null){
    this.buttons=0;this.shift=0;this.strobe=0;
    this.sources={keyboard:0,gamepad:0,touch:0};
    this.map=map?{...map}:{KeyZ:0,KeyX:1,ShiftLeft:2,ShiftRight:2,Enter:3,ArrowUp:4,ArrowDown:5,ArrowLeft:6,ArrowRight:7};
  }
  recompute(){this.buttons=(this.sources.keyboard|this.sources.gamepad|this.sources.touch)&0xff}
  set(code,down){const b=this.map[code];if(b===undefined)return;this.setBit(b,down,'keyboard')}
  setBit(bit,down,source='touch'){bit=Number(bit);let m=this.sources[source]||0;if(down)m|=(1<<bit);else m&=~(1<<bit);this.sources[source]=m&0xff;this.recompute()}
  setMask(source,mask){this.sources[source]=mask&0xff;this.recompute()}
  clearSource(source){this.sources[source]=0;this.recompute()}
  write(v){this.strobe=v&1;if(this.strobe)this.shift=this.buttons}
  read(){let r=(this.shift&1)|0x40;if(!this.strobe)this.shift=(this.shift>>1)|0x80;else this.shift=this.buttons;return r}
  latch(){this.shift=this.buttons}
  setMapping(button,code){const bit=Number(button);for(const k of Object.keys(this.map))if(this.map[k]===bit)delete this.map[k];this.map[code]=bit}
  getMapping(bit){return Object.keys(this.map).find(k=>this.map[k]===bit)||''}
  snapshotMapping(){const out={};for(let i=0;i<8;i++)out[i]=this.getMapping(i);return out}
  restoreMapping(m){if(!m)return;for(const [bit,code] of Object.entries(m))if(code)this.setMapping(Number(bit),code)}
  snapshotRuntime(){return{buttons:this.buttons,shift:this.shift,strobe:this.strobe,sources:{...this.sources}}}
  restoreRuntime(s){if(!s)return;this.buttons=s.buttons&255;this.shift=s.shift&255;this.strobe=s.strobe&1;this.sources={keyboard:s.sources?.keyboard||0,gamepad:s.sources?.gamepad||0,touch:s.sources?.touch||0};this.recompute()}
}
