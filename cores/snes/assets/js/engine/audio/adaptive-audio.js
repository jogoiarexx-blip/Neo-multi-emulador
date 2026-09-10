(()=>{'use strict';const N=window.SNESNova=window.SNESNova||{};let last={profile:'auto',state:'idle'};
function profile(){try{return JSON.parse(localStorage.getItem('snes-nova:enhancements:v1')||'{}').audioProfile||'auto'}catch{return 'auto'}}
function resumeContexts(){for(const v of Object.values(window)){try{if(v instanceof AudioContext&&v.state==='suspended')v.resume()}catch{}}last={profile:profile(),state:'active',at:Date.now()};window.dispatchEvent(new CustomEvent('snesnova:audioengine',{detail:last}))}
['pointerdown','keydown','touchstart'].forEach(e=>addEventListener(e,resumeContexts,{once:true,passive:true}));
window.addEventListener('snesnova:performance',e=>{const p=profile();let recommendation=p;if(p==='auto')recommendation=(e.detail.stutter||0)>12?'safe':(e.detail.presentFps||60)>58?'low':'normal';last={profile:p,recommendation,state:'monitoring',at:Date.now()};});
N.audioEngine={profile,getState:()=>last,resumeContexts};})();
