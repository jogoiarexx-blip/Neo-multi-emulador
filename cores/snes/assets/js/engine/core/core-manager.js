(()=>{'use strict';const N=window.SNESNova=window.SNESNova||{};const map={snes9x:'./vendor/emulatorjs/stable-4.2.3/data/',bsnes:'./vendor/emulatorjs/bsnes-4.3.0-pre/data/'};const memo=new Map();
async function exists(url){try{const r=await fetch(url,{method:'HEAD',cache:'no-store'});return r.ok}catch{return false}}
async function runtime(core){const base=map[core]||map.snes9x;const local=await exists(base+'loader.js');return {core,base,local};}
async function prefetch(core){if(memo.has(core))return memo.get(core);const p=(async()=>{const r=await runtime(core);if(!r.local)return r;const urls=[r.base+'loader.js'];for(const u of urls){try{const res=await fetch(u,{cache:'force-cache'});if(res.ok&&'caches'in window){const c=await caches.open('snes-nova-engine-runtime-v1');await c.put(u,res.clone())}}catch{}}return r})();memo.set(core,p);return p}
function warm(core){if('requestIdleCallback'in window)requestIdleCallback(()=>prefetch(core),{timeout:2500});else setTimeout(()=>prefetch(core),500)}
N.coreManager={runtime,prefetch,warm};})();
