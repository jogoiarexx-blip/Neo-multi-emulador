import {Controller} from './controller.js';

export class FourScore {
  constructor(controllers){this.controllers=controllers;this.enabled=false;this.strobe=0;this.shift1=0;this.shift2=0}
  setEnabled(v){this.enabled=!!v;this.latch()}
  latch(){
    for(const c of this.controllers)c.latch();
    // Serial stream: P1,P3, signature on $4016; P2,P4, signature on $4017.
    // Signature bytes follow the common Four Score identification pattern.
    this.shift1=(BigInt(this.controllers[0].buttons&255))|(BigInt(this.controllers[2].buttons&255)<<8n)|(0x10n<<16n);
    this.shift2=(BigInt(this.controllers[1].buttons&255))|(BigInt(this.controllers[3].buttons&255)<<8n)|(0x20n<<16n);
  }
  write(v){this.strobe=v&1;for(const c of this.controllers)c.write(v);if(this.strobe)this.latch()}
  readPort(port){
    if(!this.enabled)return this.controllers[port===1?0:1].read()&1;
    if(this.strobe)this.latch();
    const key=port===1?'shift1':'shift2';const bit=Number(this[key]&1n);if(!this.strobe)this[key]>>=1n;return bit;
  }
  snapshot(){return{enabled:this.enabled,strobe:this.strobe,shift1:this.shift1.toString(),shift2:this.shift2.toString()}}
  restore(s){if(!s)return;this.enabled=!!s.enabled;this.strobe=s.strobe&1;try{this.shift1=BigInt(s.shift1||0);this.shift2=BigInt(s.shift2||0)}catch{this.latch()}}
}

export class Zapper {
  constructor(){this.enabled=false;this.trigger=false;this.x=128;this.y=120;this.light=false;this.lastSample=0}
  setEnabled(v){this.enabled=!!v}
  aim(x,y){this.x=Math.max(0,Math.min(255,Math.round(x)));this.y=Math.max(0,Math.min(239,Math.round(y)))}
  setTrigger(v){this.trigger=!!v}
  sample(ppu){
    if(!this.enabled||!ppu?.image){this.light=false;return false}
    // Approximate the photodiode over a small neighborhood. Bit 3 is low when light is seen.
    let hits=0,total=0;for(let yy=-4;yy<=4;yy+=2)for(let xx=-4;xx<=4;xx+=2){const x=Math.max(0,Math.min(255,this.x+xx)),y=Math.max(0,Math.min(239,this.y+yy));const px=ppu.image[y*256+x]>>>0;const r=px&255,g=(px>>>8)&255,b=(px>>>16)&255;if((r*3+g*6+b)>900)hits++;total++}
    this.light=hits>=Math.max(2,Math.ceil(total*.12));this.lastSample=ppu.scanline*341+ppu.cycle;return this.light
  }
  read(ppu){this.sample(ppu);return (this.light?0:0x08)|(this.trigger?0x10:0)}
  snapshot(){return{enabled:this.enabled,trigger:this.trigger,x:this.x,y:this.y,light:this.light,lastSample:this.lastSample}}
  restore(s){if(!s)return;this.enabled=!!s.enabled;this.trigger=!!s.trigger;this.x=s.x??128;this.y=s.y??120;this.light=!!s.light;this.lastSample=s.lastSample||0}
}

export class InputHub {
  constructor(){
    this.controllers=[
      new Controller(),
      new Controller({KeyN:0,KeyM:1,KeyV:2,KeyB:3,KeyW:4,KeyS:5,KeyA:6,KeyD:7}),
      new Controller({Numpad1:0,Numpad2:1,Numpad0:2,NumpadEnter:3,Numpad8:4,Numpad5:5,Numpad4:6,Numpad6:7}),
      new Controller()
    ];
    this.fourScore=new FourScore(this.controllers);this.zapper=new Zapper();this.port2Device='controller';
  }
  setPort2Device(v){this.port2Device=['controller','zapper'].includes(v)?v:'controller';this.zapper.setEnabled(this.port2Device==='zapper')}
  write4016(v){this.fourScore.write(v)}
  read4016(){return this.fourScore.readPort(1)&1}
  read4017(ppu){if(this.port2Device==='zapper'&&!this.fourScore.enabled)return this.zapper.read(ppu);return this.fourScore.readPort(2)&1}
  snapshot(){return{fourScore:this.fourScore.snapshot(),zapper:this.zapper.snapshot(),port2Device:this.port2Device,controllers:this.controllers.map(c=>c.snapshotRuntime())}}
  restore(s){if(!s)return;this.port2Device=s.port2Device||'controller';this.fourScore.restore(s.fourScore);this.zapper.restore(s.zapper);if(s.controllers)s.controllers.forEach((v,i)=>this.controllers[i]?.restoreRuntime(v));this.zapper.setEnabled(this.port2Device==='zapper')}
}
