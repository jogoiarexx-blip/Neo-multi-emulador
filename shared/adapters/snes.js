(()=>{
 const $=s=>document.querySelector(s), text=s=>$(s)?.textContent?.trim()||'';
 const click=(...ss)=>{for(const s of ss){const b=$(s);if(b&&!b.disabled){b.click();return true}}return false};
 window.NEOCoreBridge?.register({id:'snes',capabilities:()=>({pause:true,reset:true,save:true,load:true,fullscreen:true,telemetry:true}),commands:{pause:()=>click('#qmPause','[data-action="pause"]'),reset:()=>click('#qmRestart','[data-action="reset"]'),save:()=>click('#qmSave','#quickSave2','[data-action="save"]'),load:()=>click('#qmLoad','#quickLoad2','[data-action="load"]')},telemetry:()=>({engine:text('#playingCore')||window.EJS_core||'Snes9x',fps:text('#fpsCounter')||'',state:window.__SNESNovaBootPhase?'Executando':'Ativo',renderer:(window.EJS_forceLegacyCores?'Compatibilidade':'WebGL/Auto'),audio:'EmulatorJS',slot:'Quick',paused:false})});
})();
