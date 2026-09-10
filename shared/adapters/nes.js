(()=>{
 const $=s=>document.querySelector(s), text=s=>$(s)?.textContent?.trim()||'';
 const click=s=>{const b=$(s);if(!b||b.disabled)return false;b.click();return true};
 const api={id:'nes',capabilities:()=>({pause:!!$('#pauseBtn'),reset:!!$('#resetBtn'),save:!!($('#quickSaveBtn')||$('#saveBtn')),load:!!($('#quickLoadBtn')||$('#loadBtn')),fullscreen:true,telemetry:true}),commands:{pause:()=>click('#pauseBtn'),reset:()=>click('#resetBtn'),save:()=>click('#quickSaveBtn')||click('#saveBtn'),load:()=>click('#quickLoadBtn')||click('#loadBtn')},telemetry:()=>({engine:'NEO NES',fps:text('#fps'),state:/continuar/i.test(text('#pauseBtn'))?'Pausado':'Executando',renderer:text('#videoBackend')||'Canvas/WebGL',audio:'APU',slot:$('#stateSlot')?.value||'0',paused:/continuar/i.test(text('#pauseBtn'))})};
 window.NEOCoreBridge?.register(api);
})();
