(()=>{
'use strict';
const N=window.SNESNova=window.SNESNova||{};
const LS='snes-nova:engine:v1';
function load(){try{return Object.assign({mode:'auto',prefetch:true,workerRom:true,lowLatencyInput:true,adaptiveSync:true,coreWarmup:true},JSON.parse(localStorage.getItem(LS)||'{}'))}catch{return {mode:'auto',prefetch:true,workerRom:true,lowLatencyInput:true,adaptiveSync:true,coreWarmup:true}}}
const config=load();
function save(){localStorage.setItem(LS,JSON.stringify(config));}
function simdSupported(){try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]))}catch{return false}}
function caps(){return {
  wasm:typeof WebAssembly!=='undefined',simd:simdSupported(),threads:typeof SharedArrayBuffer!=='undefined'&&crossOriginIsolated===true,
  worker:typeof Worker!=='undefined',offscreen:typeof OffscreenCanvas!=='undefined',audioWorklet:(()=>{try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return false;const ctx=new C();const ok=!!ctx.audioWorklet;ctx.close?.();return ok}catch{return false}})(),
  webgl2:(()=>{try{return !!document.createElement('canvas').getContext('webgl2',{powerPreference:'high-performance'})}catch{return false}})(),
  cores:navigator.hardwareConcurrency||2,memory:navigator.deviceMemory||null,dpr:devicePixelRatio||1
}}
function deviceKey(c=caps()){return ['c'+Math.min(16,c.cores),'m'+(c.memory||'x'),'g'+(c.webgl2?2:1),'s'+(c.simd?1:0),'t'+(c.threads?1:0)].join('-')}
function tier(c=caps()){let score=0;score+=Math.min(c.cores,12)*2;score+=c.webgl2?8:0;score+=c.simd?6:0;score+=c.threads?6:0;score+=(c.memory||4)>=8?6:(c.memory||4)>=4?2:0;return score>=40?'high':score>=24?'medium':'low'}
async function prepareBoot(ctx={}){const c=caps();const result={caps:c,deviceKey:deviceKey(c),tier:tier(c),core:ctx.core||'snes9x',romHash:ctx.romHash||'',startedAt:performance.now()};
  if(config.prefetch&&N.coreManager?.prefetch) await N.coreManager.prefetch(result.core).catch(()=>{});
  if(N.adaptiveEngine?.resolveProfile){result.profile=N.adaptiveEngine.resolveProfile(result.romHash,result.deviceKey,result.core,result.tier)}
  window.dispatchEvent(new CustomEvent('snesnova:engineprepared',{detail:result}));return result;
}
function recommendedBuild(core,c=caps()){if(core==='snes9x'&&c.simd)return 'simd';if(core==='bsnes'&&c.simd&&tier(c)!=='low')return 'simd';return 'standard'}
N.engine={version:'1.5.0',config,caps,deviceKey,tier,prepareBoot,recommendedBuild,save};
})();
