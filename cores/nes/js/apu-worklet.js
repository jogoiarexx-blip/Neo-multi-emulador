class NeoNesAPUProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.capacity=262144; // ~5.4 s @48 kHz, fixed circular buffer: no shift()/GC churn.
    this.ring=new Float32Array(this.capacity);this.readPos=0;this.writePos=0;this.available=0;this.gain=1;this.underruns=0;this.overruns=0;
    this.port.onmessage=e=>{const d=e.data||{};
      if(d.type==='samples'&&d.buffer){const src=new Float32Array(d.buffer);for(let i=0;i<src.length;i++){if(this.available>=this.capacity){this.readPos=(this.readPos+1)%this.capacity;this.available--;this.overruns++;}this.ring[this.writePos]=src[i];this.writePos=(this.writePos+1)%this.capacity;this.available++;}}
      else if(d.type==='flush'){this.readPos=this.writePos=this.available=0;}
      else if(d.type==='gain')this.gain=Number.isFinite(d.value)?d.value:1;
      else if(d.type==='stats')this.port.postMessage({type:'stats',available:this.available,underruns:this.underruns,overruns:this.overruns});
    };
  }
  process(inputs,outputs){const out=outputs[0][0];for(let i=0;i<out.length;i++){let s=0;if(this.available>0){s=this.ring[this.readPos];this.readPos=(this.readPos+1)%this.capacity;this.available--;}else this.underruns++;out[i]=s*this.gain;}return true;}
}
registerProcessor('neo-nes-apu',NeoNesAPUProcessor);
