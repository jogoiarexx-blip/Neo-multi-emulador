(()=>{'use strict';const N=window.SNESNova=window.SNESNova||{};const KEY='snes-nova:adaptive-engine:v1';function all(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}}function save(v){localStorage.setItem(KEY,JSON.stringify(v))}
function k(hash,device){return `${hash||'unknown'}@${device||'generic'}`}
function resolveProfile(hash,device,requested,tier){const a=all(),p=a[k(hash,device)]||{};let core=p.core||requested;if(tier==='low'&&core==='bsnes')core='snes9x';return {...p,core,tier}}
function learn(hash,device,sample){if(!hash||!device||!sample)return;const a=all(),key=k(hash,device),old=a[key]||{};let core=sample.core||old.core||'snes9x';if(core==='bsnes'&&((sample.presentFps||60)<54||(sample.stutter||0)>18))core='snes9x';a[key]={...old,core,lastSample:sample,updatedAt:Date.now()};save(a)}
window.addEventListener('snesnova:performance',e=>{const hash=sessionStorage.getItem('snes-nova:active-hash');const device=N.engine?.deviceKey?.();if(hash&&device)learn(hash,device,e.detail)});
N.adaptiveEngine={resolveProfile,learn,get:all};})();
