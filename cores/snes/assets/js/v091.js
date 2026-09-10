(()=>{'use strict';const N=window.SNESNova=window.SNESNova||{}, $=s=>document.querySelector(s);N.version='1.5.0';
function numericIdFromHash(hash){const h=(hash||'').replace(/[^0-9A-F]/gi,'');return parseInt((h.slice(0,8)||'1'),16)>>>0}N.numericGameId=numericIdFromHash;
async function leaveLibrary(){try{await N.session?.stop?.('library')}finally{$('#playerView')?.setAttribute('hidden','');$('#launcherView')?.removeAttribute('hidden');const g=$('#game');if(g)g.replaceChildren();}}
document.addEventListener('DOMContentLoaded',()=>{const b=$('#backBtn'),q=$('#qmLibrary');if(b){const clone=b.cloneNode(true);b.replaceWith(clone);clone.addEventListener('click',leaveLibrary)}if(q){q.addEventListener('click',async e=>{e.preventDefault();await leaveLibrary()},{capture:true})}
const label=$('#sessionPerf');window.addEventListener('snesnova:performance',e=>{if(label)label.textContent=`Apresentação: ${e.detail.presentFps} FPS • 1% low ${e.detail.onePercentLow} • stutter ${e.detail.stutter}%`;});
});
window.addEventListener('snesnova:savestate',()=>N.logger?.log?.('SAVE','Save state confirmado pelo EmulatorJS'));
window.addEventListener('snesnova:loadstate',()=>N.logger?.log?.('SAVE','Load state confirmado pelo EmulatorJS'));
})();