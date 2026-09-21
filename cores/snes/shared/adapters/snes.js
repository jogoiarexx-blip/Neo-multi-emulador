(()=>{
 const $=s=>document.querySelector(s),text=s=>$(s)?.textContent?.trim()||'';
 const click=(...sels)=>{for(const s of sels){const b=$(s);if(b&&!b.disabled){b.click();return true}}return false};
 const emu=()=>window.EJS_emulator;
 const paused=()=>{const e=emu();if(typeof e?.paused==='boolean')return e.paused;if(typeof e?.isPaused==='function')try{return !!e.isPaused()}catch{};const t=text('#qmPause').toLowerCase();return /continuar|resume|play/.test(t)};
 const state=()=>window.SNESNova?.session?.snapshot?.().state||'idle';
 window.NEOCoreBridge?.register({id:'snes',capabilities:()=>{const ready=['running','starting'].includes(state())||!!emu();return{pause:ready,reset:ready,save:ready,load:ready,fullscreen:true,telemetry:true}},commands:{pause:()=>click('#qmPause','[data-action="pause"]'),reset:()=>click('#qmRestart','[data-action="reset"]'),save:()=>click('#qmSave','#quickSave2','[data-action="save"]'),load:()=>click('#qmLoad','#quickLoad2','[data-action="load"]')},telemetry:()=>({engine:text('#playingCore')||window.EJS_core||'Snes9x',fps:text('#fpsCounter')||'',state:state(),renderer:(window.EJS_forceLegacyCores?'Compatibilidade':'WebGL/Auto'),audio:'EmulatorJS',slot:'Quick',paused:paused()})});
})();
