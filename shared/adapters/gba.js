(()=>{
 const $=s=>document.querySelector(s), text=s=>$(s)?.textContent?.trim()||'';
 const click=s=>{const b=$(s);if(!b||b.disabled)return false;b.click();return true};
 window.NEOCoreBridge?.register({id:'gba',capabilities:()=>({pause:!!$('#pauseBtn'),reset:!!$('#resetBtn'),save:!!$('#quickSaveBtn'),load:!!$('#quickLoadBtn'),fullscreen:true,telemetry:true}),commands:{pause:()=>click('#pauseBtn'),reset:()=>click('#resetBtn'),save:()=>click('#quickSaveBtn'),load:()=>click('#quickLoadBtn')},telemetry:()=>({engine:'NEO GBA ARM7TDMI',fps:text('#fpsText').replace(/[^0-9.]/g,''),state:text('#emuState')||'Ativo',renderer:`PPU • modo ${text('#videoMode')||'?'}`,audio:text('#audioState')||'APU',slot:$('#stateSlot')?.value||'0',paused:/paus/i.test(text('#emuState'))})});
})();
