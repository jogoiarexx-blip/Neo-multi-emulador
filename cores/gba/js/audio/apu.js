export class APU {
  constructor(memory) {
    this.memory = memory;
    this.enabled = true;
    this.volume = 0.7;
    this.sampleRate = 44100;
    this.clock = 16777216;
    this.accum = 0;
    this.frameSeqCycles = 0;
    this.frameSeqStep = 0;

    this.phase1 = this.phase2 = this.phase3 = 0;
    this.lfsr = 0x7FFF;

    this.fifoA = [];
    this.fifoB = [];
    this.dsA = this.dsB = 0;

    this.left = [];
    this.right = [];

    this.ctx = null;
    this.node = null;
    this.started = false;

    this.env1 = 15;
    this.env2 = 15;
    this.env4 = 15;
    this.length1 = this.length2 = this.length3 = this.length4 = 0;
    this.sweepShadow = 0;
    this.sweepTimer = 0;
    this.sweepEnabled = false;
  }

  reset() {
    this.accum = 0;
    this.frameSeqCycles = 0;
    this.frameSeqStep = 0;
    this.phase1 = this.phase2 = this.phase3 = 0;
    this.lfsr = 0x7FFF;
    this.fifoA.length = this.fifoB.length = 0;
    this.left.length = this.right.length = 0;
    this.dsA = this.dsB = 0;
  }

  async startAudio() {
    if (this.started) {
      if (this.ctx?.state === "suspended") await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({sampleRate:this.sampleRate});
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.node = this.ctx.createScriptProcessor(1024,0,2);
    this.node.onaudioprocess = e => {
      const L=e.outputBuffer.getChannelData(0), R=e.outputBuffer.getChannelData(1);
      for(let i=0;i<L.length;i++){
        L[i]=this.left.length?this.left.shift():0;
        R[i]=this.right.length?this.right.shift():0;
      }
    };
    this.node.connect(this.ctx.destination);
    this.started = true;
  }

  setVolume(v){ this.volume=Math.max(0,Math.min(1,v)); }
  setMuted(m){ this.enabled=!m; }

  _r16(o){ return this.memory.io[o] | (this.memory.io[o+1]<<8); }

  _stepFrameSequencer(cycles){
    this.frameSeqCycles += cycles;
    const stepCycles = this.clock / 512;
    while(this.frameSeqCycles >= stepCycles){
      this.frameSeqCycles -= stepCycles;
      this.frameSeqStep = (this.frameSeqStep + 1) & 7;

      if ((this.frameSeqStep & 1) === 0) {
        if(this.length1>0) this.length1--;
        if(this.length2>0) this.length2--;
        if(this.length3>0) this.length3--;
        if(this.length4>0) this.length4--;
      }

      if (this.frameSeqStep === 2 || this.frameSeqStep === 6) {
        this._clockSweep();
      }

      if (this.frameSeqStep === 7) {
        this._clockEnvelope(0x062, "env1");
        this._clockEnvelope(0x06A, "env2");
        this._clockEnvelope(0x078, "env4");
      }
    }
  }

  _clockEnvelope(off,key){
    const h=this._r16(off);
    const period=(h>>>8)&7;
    const inc=!!(h&(1<<11));
    if(!period) return;
    if(inc) this[key]=Math.min(15,this[key]+1);
    else this[key]=Math.max(0,this[key]-1);
  }

  _clockSweep(){
    const sweep=this._r16(0x060);
    const period=(sweep>>>4)&7;
    if(!period) return;
    this.sweepTimer++;
    if(this.sweepTimer < period) return;
    this.sweepTimer=0;

    const shift=sweep&7;
    if(!shift) return;
    const negate=!!(sweep&(1<<3));
    let delta=this.sweepShadow>>shift;
    let next=negate ? this.sweepShadow-delta : this.sweepShadow+delta;
    if(next>=0 && next<=2047){
      this.sweepShadow=next;
      let reg=this._r16(0x064);
      reg=(reg&~0x7FF)|next;
      this.memory.io[0x064]=reg&255;
      this.memory.io[0x065]=(reg>>>8)&255;
    }
  }

  _pulse(base,key,envKey){
    const h=this._r16(base+2), x=this._r16(base+4);
    const duty=[.125,.25,.5,.75][(h>>>6)&3];
    const vol=(this[envKey] ?? ((h>>>12)&15))/15;
    const f=131072/Math.max(1,2048-(x&0x7FF));
    this[key]=(this[key]+f/this.sampleRate)%1;
    return (this[key]<duty?1:-1)*vol;
  }

  _wave(){
    if(!(this._r16(0x70)&0x80)) return 0;
    const h=this._r16(0x72), x=this._r16(0x74);
    const level=[0,1,.5,.25][(h>>>13)&3];
    const f=2097152/Math.max(1,2048-(x&0x7FF));
    this.phase3=(this.phase3+f/this.sampleRate)%1;
    const i=(this.phase3*32)|0, b=this.memory.io[0x90+(i>>1)];
    const n=(i&1)?(b&15):(b>>>4);
    return ((n/15)*2-1)*level;
  }

  _noise(){
    const h=this._r16(0x7C);
    const vol=(this.env4 ?? ((h>>>12)&15))/15;
    const div=(h&7)||.5, shift=(h>>>4)&15;
    const f=524288/div/(1<<(shift+1));
    if(Math.random()<f/this.sampleRate){
      const bit=(this.lfsr^(this.lfsr>>1))&1;
      this.lfsr=(this.lfsr>>1)|(bit<<14);
    }
    return (this.lfsr&1?-1:1)*vol;
  }

  pushFIFO(which,v){
    const q=which==="A"?this.fifoA:this.fifoB;
    for(let i=0;i<4;i++) if(q.length<32) q.push((v>>>(i*8))&255);
  }

  _pop(which){
    const q=which==="A"?this.fifoA:this.fifoB;
    if(!q.length) return 0;
    const v=q.shift();
    return ((v<<24)>>24)/128;
  }

  needsDMA(which){
    const q=which==="A"?this.fifoA:this.fifoB;
    return q.length <= 16;
  }

  onTimerOverflow(i){
    const h=this._r16(0x82);
    const ta=(h&(1<<10))?1:0, tb=(h&(1<<14))?1:0;
    if(i===ta) this.dsA=this._pop("A");
    if(i===tb) this.dsB=this._pop("B");
  }

  _mix(){
    if(!this.enabled || !(this._r16(0x84)&0x80)) return [0,0];
    const h=this._r16(0x82);
    const bias=this._r16(0x088)&0x03FF;
    const biasGain = Math.max(0.5, Math.min(1.5, bias / 0x200));

    let p=(this._pulse(0x60,"phase1","env1")+this._pulse(0x68,"phase2","env2")+this._wave()+this._noise())*.18;
    let L=p,R=p;
    if(h&(1<<9)) L+=this.dsA*.35;
    if(h&(1<<8)) R+=this.dsA*.35;
    if(h&(1<<13)) L+=this.dsB*.35;
    if(h&(1<<12)) R+=this.dsB*.35;

    L*=this.volume*biasGain;
    R*=this.volume*biasGain;
    return [Math.max(-1,Math.min(1,L)),Math.max(-1,Math.min(1,R))];
  }

  tick(c){
    this._stepFrameSequencer(c);
    if(!this.enabled) return;
    this.accum+=c;
    const cps=this.clock/this.sampleRate;
    while(this.accum>=cps){
      this.accum-=cps;
      const [L,R]=this._mix();
      this.left.push(L); this.right.push(R);
      if(this.left.length>16384){this.left.splice(0,8192);this.right.splice(0,8192);}
    }
  }
}
