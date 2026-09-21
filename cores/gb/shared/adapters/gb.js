(()=>{
 const byText=rx=>[...document.querySelectorAll('button,[role="button"]')].find(x=>rx.test((x.title||x.getAttribute('aria-label')||x.textContent||'').trim()));
 const clickText=rx=>{const b=byText(rx);if(b&&!b.disabled){b.click();return true}return false};
 const emu=()=>window.EJS_emulator;
 const call=(names,...args)=>{const e=emu();for(const n of names)if(e&&typeof e[n]==='function'){try{e[n](...args);return true}catch{}}return false};
 const paused=()=>{const e=emu();if(typeof e?.paused==='boolean')return e.paused;if(typeof e?.isPaused==='function')try{return !!e.isPaused()}catch{};return !!window.__NEOGBState?.paused};
 function togglePause(){const p=paused();let ok=p?call(['play','resume','unpause']):call(['pause']);if(!ok)ok=clickText(/pause|play|pausar|continuar/i);if(ok){window.__NEOGBState=window.__NEOGBState||{};window.__NEOGBState.paused=!p}return ok}
 window.NEOCoreBridge?.register({
   id:'gb',
   capabilities:()=>{const ready=!!document.querySelector('#game canvas')||!!emu();return{pause:ready,reset:ready,save:ready,load:ready,fullscreen:true,telemetry:true}},
   commands:{
     pause:togglePause,
     reset:()=>call(['restart','reset'])||clickText(/restart|reset|reiniciar/i),
     save:()=>call(['saveState','quickSave'])||clickText(/save state|quick save|salvar estado/i),
     load:()=>call(['loadState','quickLoad'])||clickText(/load state|quick load|carregar estado/i)
   },
   telemetry:()=>({engine:'Gambatte / EmulatorJS',state:window.__NEOGBState?.phase||'Inicializando',renderer:document.querySelector('#game canvas')?'Canvas/WebGL':'Inicializando',audio:'EmulatorJS',slot:'Quick',paused:paused(),runtime:window.__NEOGBState?.runtime||''})
 });
})();
