(()=>{
  'use strict';
  const q=new URLSearchParams(location.search);
  const rom=q.get('autoload');
  const title=q.get('game')||'Game Boy / Game Boy Color';
  const titleEl=document.getElementById('gameTitle');
  const empty=document.getElementById('empty');
  const game=document.getElementById('game');
  titleEl.textContent=title;
  window.__NEOGBState={phase:'idle',paused:false,runtime:'',started:false};
  if(!rom)return;

  const candidates=[
    {label:'local GB',path:'./vendor/emulatorjs/stable-4.2.3/data/'},
    {label:'runtime compartilhado SNES',path:'../snes/vendor/emulatorjs/stable-4.2.3/data/'},
    {label:'CDN EmulatorJS 4.2.3',path:'https://cdn.emulatorjs.org/4.2.3/data/'}
  ];

  const showError=(message)=>{
    game.style.display='none';empty.style.display='block';empty.textContent=message;
    window.__NEOGBState.phase='error';
  };

  async function exists(path){
    try{const r=await fetch(path+'loader.js',{method:'GET',cache:'no-store'});return r.ok}catch{return false}
  }

  function configure(path,label){
    empty.style.display='none';game.style.display='block';
    Object.assign(window.__NEOGBState,{phase:'loading',runtime:label,started:false});
    window.EJS_player='#game';
    window.EJS_core='gb';
    window.EJS_gameName=title;
    window.EJS_color='#57e8ff';
    window.EJS_startOnLoaded=true;
    window.EJS_pathtodata=path;
    window.EJS_gameUrl=rom;
    window.EJS_threads=false;
    window.EJS_language='pt-BR';
    window.EJS_onGameStart=()=>{Object.assign(window.__NEOGBState,{phase:'running',started:true,paused:false});window.dispatchEvent(new CustomEvent('neogb:started'));};
    window.EJS_onExit=()=>{Object.assign(window.__NEOGBState,{phase:'idle',started:false,paused:false});window.dispatchEvent(new CustomEvent('neogb:exit'));};
    window.EJS_onLoadState=()=>window.dispatchEvent(new CustomEvent('neogb:loadstate'));
    window.EJS_onSaveState=()=>window.dispatchEvent(new CustomEvent('neogb:savestate'));
  }

  async function boot(){
    let selected=null;
    for(const candidate of candidates){if(await exists(candidate.path)){selected=candidate;break}}
    if(!selected){showError('Não foi possível localizar o runtime GB. Instale o runtime local ou verifique a conexão.');return}
    configure(selected.path,selected.label);
    const old=document.querySelector('script[data-neogb-loader]');if(old)old.remove();
    const s=document.createElement('script');s.dataset.neogbLoader='1';s.src=selected.path+'loader.js';
    s.onerror=()=>showError(`Falha ao carregar o runtime GB (${selected.label}).`);
    document.body.appendChild(s);
    setTimeout(()=>{if(!window.__NEOGBState.started&&window.__NEOGBState.phase==='loading')showError(`O runtime GB foi carregado, mas o núcleo Gambatte não iniciou (${selected.label}).`);},15000);
  }
  boot();
})();
