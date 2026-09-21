(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const embedded = params.get('embed') === '1' || window.parent !== window;
  if (embedded) document.documentElement.classList.add('neo-embedded');

  const fallbackSelectors = {
    pause: ['#pauseBtn','[data-action="pause"]'],
    reset: ['#resetBtn','#qmRestart','#reloadBtn','[data-action="reset"]'],
    save: ['#saveBtn','#saveStateBtn','#quickSaveBtn','#qmSave','#quickSave2','[data-action="save"]'],
    load: ['#loadBtn','#loadStateBtn','#quickLoadBtn','#qmLoad','#quickLoad2','[data-action="load"]'],
    fullscreen: ['#fullscreenBtn','#fullscreenHostBtn','#qmFullscreen','[data-action="fullscreen"]']
  };
  let adapter = null;
  let lastTelemetry = '';

  const reply = (type, detail={}) => {
    if (window.parent !== window) window.parent.postMessage({source:'neo-core',type,...detail}, location.origin);
  };
  const fallbackButton = command => (fallbackSelectors[command]||[]).map(s=>document.querySelector(s)).find(Boolean);
  const safe = (fn, fallback=null) => { try { return fn(); } catch { return fallback; } };

  window.NEOCoreBridge = {
    register(next){
      adapter = next || null;
      reply('capabilities',{capabilities:getCapabilities()});
      publishTelemetry(true);
    },
    publish(){ publishTelemetry(true); },
    isEmbedded: embedded,
    params
  };

  function getCapabilities(){
    const defaults={pause:false,reset:false,save:false,load:false,fullscreen:true,telemetry:true};
    if(adapter?.capabilities) return {...defaults,...safe(()=>adapter.capabilities(),adapter.capabilities)};
    for(const k of ['pause','reset','save','load']) defaults[k]=!!fallbackButton(k);
    return defaults;
  }

  async function run(command,payload={}){
    if(command==='focus'){
      document.querySelector('canvas,#game,.player-stage,[tabindex]')?.focus?.();
      reply('command-result',{command,ok:true}); return;
    }
    try{
      if(adapter?.commands?.[command]){
        const result=await adapter.commands[command](payload);
        reply('command-result',{command,ok:result!==false,result}); publishTelemetry(true); return;
      }
      const button=fallbackButton(command);
      if(button && !button.disabled){button.click();reply('command-result',{command,ok:true});publishTelemetry(true);return;}
      if(command==='fullscreen'){await document.documentElement.requestFullscreen?.();reply('command-result',{command,ok:true});return;}
      reply('command-result',{command,ok:false});
    }catch(error){reply('command-result',{command,ok:false,error:String(error?.message||error)});}
  }

  function genericTelemetry(){
    const text=id=>document.querySelector(id)?.textContent?.trim()||'';
    const gp=navigator.getGamepads?.()?.filter(Boolean)?.[0];
    return {
      core: adapter?.id || document.documentElement.dataset.neoCore || 'core',
      engine: text('#playingCore')||text('#coreName')||'',
      fps: text('#fpsText').replace(/[^0-9.]/g,'')||text('#fps').replace(/[^0-9.]/g,'')||'',
      state: text('#emuState')||'Ativo',
      renderer: text('#rendererStatus')||text('#videoBackend')||'',
      audio: text('#audioState')||'',
      gamepad: gp ? gp.id : 'Não conectado',
      slot: document.querySelector('#stateSlot')?.value||'',
      paused: /paus/i.test(text('#emuState')),
      timestamp: Date.now()
    };
  }
  function collectTelemetry(){
    const base=genericTelemetry();
    const extra=adapter?.telemetry ? safe(()=>adapter.telemetry(),{}) : {};
    return {...base,...extra,timestamp:Date.now()};
  }
  function publishTelemetry(force=false){
    const data=collectTelemetry();
    const signature=JSON.stringify({...data,timestamp:0});
    if(force || signature!==lastTelemetry){lastTelemetry=signature;reply('telemetry',{telemetry:data});}
  }

  addEventListener('message',e=>{
    if(e.origin!==location.origin||!e.data||e.data.source!=='neo-hub')return;
    if(e.data.type==='command')run(e.data.command,e.data.payload||{});
    if(e.data.type==='telemetry-request')publishTelemetry(true);
  });
  function announceReady(){
    if(embedded && document.body) document.body.classList.add('neo-embedded');
    reply('ready',{title:document.title,embedded,capabilities:getCapabilities()});
    setTimeout(()=>publishTelemetry(true),120);
  }
  // The bridge can be injected at the end of a core document or restored from cache.
  // In both cases DOMContentLoaded may already have fired, so never depend on that event alone.
  if(document.readyState === 'loading') addEventListener('DOMContentLoaded', announceReady, {once:true});
  else queueMicrotask(announceReady);
  addEventListener('load',()=>{ announceReady(); publishTelemetry(true); },{once:true});
  setInterval(()=>publishTelemetry(false),1000);
  addEventListener('gamepadconnected',()=>publishTelemetry(true));
  addEventListener('gamepaddisconnected',()=>publishTelemetry(true));
  addEventListener('error',e=>reply('error',{message:e.message||'Erro no núcleo'}));
  addEventListener('unhandledrejection',e=>reply('error',{message:String(e.reason?.message||e.reason||'Falha assíncrona')}));
})();
