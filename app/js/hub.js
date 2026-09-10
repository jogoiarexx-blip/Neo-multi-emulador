const state={cores:[],games:[],activeView:'home',activeCore:null,coreCapabilities:{},coreTelemetry:{},favorites:new Set(JSON.parse(localStorage.getItem('neo-multi:favorites')||'[]'))};
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const icons={nes:'8',snes:'16',gb:'GB',gba:'32',arcade:'A'};
const systemNames={nes:'Nintendo Entertainment System',snes:'Super Nintendo',gb:'Game Boy / Game Boy Color',gba:'Game Boy Advance',arcade:'Arcade'};
const statusLabel={stable:'Estável',experimental:'Experimental','local-runtime':'Runtime local'};
function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c))}
async function init(){
  try{const r=await fetch('/config/cores.json',{cache:'no-store'});if(!r.ok)throw new Error('Registro indisponível');const data=await r.json();state.cores=data.cores||[];renderCores();$('#statusLine').textContent=`${state.cores.length} núcleos registrados • seleção automática disponível`;}
  catch(e){$('#statusLine').textContent='Falha ao carregar registro de núcleos';console.error(e)}
  await refreshLibrary(); bind(); diagnostics();
}
async function refreshLibrary(){try{const r=await fetch('/api/hub-library',{cache:'no-store'});const d=await r.json();state.games=d.games||[];renderGames();}catch(e){console.error(e);state.games=[];renderGames()}}
function renderCores(){
  $('#coreCount').textContent=state.cores.length;
  $('#coreGrid').innerHTML=state.cores.map(c=>`<article class="core-card"><div class="system-icon">${icons[c.id]||'•'}</div><h4>${c.name}</h4><p>${c.system}<br>${c.engine}</p><div class="card-footer"><span class="version">v${c.version} • ${statusLabel[c.status]||c.status}</span><button class="launch" data-core="${c.id}">Abrir</button></div></article>`).join('');
  $('#coreTable').innerHTML=state.cores.map(c=>`<div class="core-row"><div><strong>${c.name}</strong><br><small>${c.system}</small></div><div><span class="badge">${c.type}</span></div><div><strong>v${c.version}</strong><br><small>${statusLabel[c.status]||c.status}</small></div><div><small>${c.capabilities.join(' • ')}</small></div><button class="open-btn" data-core="${c.id}">Abrir núcleo</button></div>`).join('');
  $$('[data-core]').forEach(b=>b.onclick=()=>openCore(b.dataset.core));
}
function filteredGames(favoritesOnly=false){const q=($('#librarySearch')?.value||'').trim().toLowerCase(),sys=$('#librarySystem')?.value||'all';return state.games.filter(g=>(!favoritesOnly||state.favorites.has(g.id))&&(sys==='all'||g.system===sys)&&(!q||`${g.title} ${g.system} ${g.file}`.toLowerCase().includes(q)))}
function gameCard(g){const fav=state.favorites.has(g.id);return `<article class="game-card" data-game-card="${esc(g.id)}"><div class="game-cover system-${g.system}">${g.cover?`<img src="${esc(g.cover)}" alt=""/>`:`<div class="cover-system">${icons[g.system]||'•'}</div>`}<span class="system-pill">${g.system.toUpperCase()}</span></div><div class="game-copy"><h4>${esc(g.title)}</h4><p>${esc(systemNames[g.system]||g.system)}</p><div class="game-actions"><button class="play-game" data-play="${esc(g.id)}">▶ Jogar</button><button class="favorite-game ${fav?'active':''}" data-fav="${esc(g.id)}" title="Favorito">${fav?'★':'☆'}</button></div></div></article>`}
function renderGames(){const preferred=[...state.games].sort((a,b)=>Number(state.favorites.has(b.id))-Number(state.favorites.has(a.id))).slice(0,8);const home=$('#homeGameShortcuts');if(home)home.innerHTML=preferred.length?preferred.map(gameCard).join(''):'<div class="empty-library">Adicione jogos à biblioteca para criar atalhos.</div>';const all=filteredGames(false);$('#libraryCount').textContent=`${all.length} jogo${all.length===1?'':'s'}`;$('#gameGrid').innerHTML=all.length?all.map(gameCard).join(''):'<div class="empty-library">Nenhum jogo encontrado.</div>';const fav=filteredGames(true);$('#favoriteGrid').innerHTML=fav.length?fav.map(gameCard).join(''):'<div class="empty-library">Você ainda não adicionou jogos aos favoritos.</div>';bindGameCards()}
function bindGameCards(){$$('[data-play]').forEach(b=>b.onclick=()=>launchGame(b.dataset.play));$$('[data-fav]').forEach(b=>b.onclick=()=>toggleFavorite(b.dataset.fav))}
function toggleFavorite(id){state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);localStorage.setItem('neo-multi:favorites',JSON.stringify([...state.favorites]));renderGames()}
async function launchGame(id){const g=state.games.find(x=>x.id===id);if(!g)return;const core=state.cores.find(x=>x.id===g.system);if(!core)return alert('Núcleo não encontrado para este jogo.');state.activeCore=core;state.coreCapabilities={};state.coreTelemetry={};applyCoreCapabilities({pause:false,reset:false,save:false,load:false});applyTelemetry({engine:core.name,state:'Inicializando'});$('#runnerBadge').textContent=g.system.toUpperCase();$('#runnerName').textContent=g.title;$('#runnerMeta').textContent=`${systemNames[g.system]} • núcleo selecionado automaticamente`;if(g.system==='arcade'&&g.arcadeId){try{const r=await fetch('/api/launch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:g.arcadeId,core:'auto'})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao iniciar Arcade');$('#runnerMeta').textContent=`Arcade • ${d.core||'core automático'} iniciado`;}catch(e){alert(e.message);return;}$('#coreFrame').src=`${core.entry}${core.entry.includes('?')?'&':'?'}embed=1`;}else{const sep=core.entry.includes('?')?'&':'?';$('#coreFrame').src=`${core.entry}${sep}embed=1&autoload=${encodeURIComponent(g.url)}&game=${encodeURIComponent(g.title)}`;}$$('.view').forEach(v=>v.classList.remove('active'));$('#runnerView').classList.add('active');$('#viewTitle').textContent=g.title;$('#viewSubtitle').textContent=`Abrindo automaticamente com ${core.name}`;$('#backHub').hidden=false;$('#fullscreenCore').hidden=false;document.body.classList.add('core-running');setRunnerLoading(true);
  clearTimeout(window.__neoRunnerWatchdog);
  window.__neoRunnerWatchdog=setTimeout(()=>{
    if(!$('#runnerLoading')?.classList.contains('hidden')){
      setRunnerLoading(false);
      $('#runnerHint').textContent='Núcleo iniciado • comunicação limitada';
    }
  },3500);
}
function setRunnerLoading(show=true,text='Preparando jogo'){
  const l=$('#runnerLoading'); if(!l)return; l.classList.toggle('hidden',!show); const strong=l.querySelector('strong'); if(strong&&text)strong.textContent=text;
  $('#runnerView')?.classList.toggle('ready',!show);
}
function sendCoreCommand(command,payload={}){const f=$('#coreFrame');if(!f?.contentWindow)return;f.contentWindow.postMessage({source:'neo-hub',type:'command',command,payload},location.origin)}
function applyCoreCapabilities(caps={}){state.coreCapabilities=caps;$$('[data-core-command]').forEach(b=>{const supported=caps[b.dataset.coreCommand]!==false;b.disabled=!supported;b.classList.toggle('unsupported',!supported);b.title=supported?(b.dataset.coreCommand==='save'?'Quick Save':b.dataset.coreCommand==='load'?'Quick Load':b.dataset.coreCommand==='pause'?'Pausar/Continuar':'Reiniciar jogo'):'Este núcleo ainda não expõe este comando ao Hub';});}
function setTelemetryValue(id,value,fallback='—'){const el=$(id);if(el)el.textContent=(value===0||value)?String(value):fallback}
function applyTelemetry(t={}){state.coreTelemetry=t;setTelemetryValue('#telemetryEngine',t.engine||t.core);setTelemetryValue('#telemetryFps',t.fps);setTelemetryValue('#telemetryRenderer',t.renderer);setTelemetryValue('#telemetryAudio',t.audio);setTelemetryValue('#telemetryGamepad',t.gamepad);setTelemetryValue('#telemetrySlot',t.slot);setTelemetryValue('#telemetryState',t.state|| (t.paused?'Pausado':'Executando'));const st=$('#telemetryState');st?.classList.toggle('is-paused',!!t.paused);st?.classList.toggle('is-live',!t.paused&&!!t.state);if(t.state)$('#runnerHint').textContent=`${t.state} • modo integrado`;}
function flashCommand(command,ok){const b=$(`[data-core-command="${command}"]`);if(!b)return;b.classList.remove('command-ok','command-error');b.classList.add(ok?'command-ok':'command-error');setTimeout(()=>b.classList.remove('command-ok','command-error'),500)}
function exitRunner(){const f=$('#coreFrame');if(f)f.src='about:blank';state.activeCore=null;document.body.classList.remove('core-running');showView('library')}
function setupCoreBridge(){
  $('#coreFrame')?.addEventListener('load',()=>{
    const frame=$('#coreFrame'); if(!frame||frame.src==='about:blank')return;
    // A loaded core can already be emulating even if an older cached page did not load CoreBridge.
    // Do not leave an opaque Hub loader covering a working canvas/audio indefinitely.
    setTimeout(()=>{
      sendCoreCommand('focus');
      if(!$('#runnerLoading')?.classList.contains('hidden')){
        setRunnerLoading(false);
        $('#runnerHint').textContent='Núcleo carregado • aguardando telemetria';
        applyTelemetry({...state.coreTelemetry,state:'Executando'});
      }
    },650);
  });
  addEventListener('message',e=>{if(e.origin!==location.origin||!e.data||e.data.source!=='neo-core')return;if(e.data.type==='ready'){setRunnerLoading(false);$('#runnerHint').textContent='Núcleo ativo • modo integrado';if(e.data.capabilities)applyCoreCapabilities(e.data.capabilities);sendCoreCommand('focus');e.source?.postMessage?.({source:'neo-hub',type:'telemetry-request'},location.origin)}else if(e.data.type==='capabilities'){applyCoreCapabilities(e.data.capabilities||{})}else if(e.data.type==='telemetry'){applyTelemetry(e.data.telemetry||{})}else if(e.data.type==='command-result'){flashCommand(e.data.command,e.data.ok);if(!e.data.ok)$('#runnerHint').textContent=`Comando ${e.data.command} indisponível neste núcleo`}else if(e.data.type==='error'){$('#runnerHint').textContent='Núcleo reportou um erro';console.error('Core:',e.data.message)}});
  $$('[data-core-command]').forEach(b=>b.onclick=()=>sendCoreCommand(b.dataset.coreCommand));
  $('#runnerFullscreen').onclick=()=>{const stage=$('.runner-stage');stage?.requestFullscreen?.()};
  $('#runnerExit').onclick=exitRunner;
}
function bind(){
  setupCoreBridge();
  $$('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  $('#backHub').onclick=exitRunner;
  $('#fullscreenCore').onclick=()=>$('#coreFrame').requestFullscreen?.();
  $('#librarySearch').addEventListener('input',renderGames);$('#librarySystem').addEventListener('change',renderGames);
  $$('[data-view-jump]').forEach(b=>b.onclick=()=>showView(b.dataset.viewJump));
  $('#importGameBtn').onclick=()=>$('#importGameInput').click();$('#importGameInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;await importGame(f);e.target.value=''};
}
async function importGame(file){const ext=(file.name.match(/\.[^.]+$/)||[''])[0].toLowerCase();const system=ext==='.nes'?'nes':['.sfc','.smc','.fig'].includes(ext)?'snes':['.gb','.gbc'].includes(ext)?'gb':ext==='.gba'?'gba':['.zip','.7z','.chd'].includes(ext)?'arcade':null;if(!system)return alert('Formato ainda não reconhecido.');const max=96*1024*1024;if(file.size>max)return alert('Arquivo muito grande para importação pelo Hub.');$('#statusLine').textContent=`Importando ${file.name}...`;const bytes=new Uint8Array(await file.arrayBuffer());let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));const r=await fetch('/api/hub-import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:file.name,system,data:btoa(bin)})});const d=await r.json();if(!r.ok){alert(d.error||'Falha ao importar');return}await refreshLibrary();$('#statusLine').textContent=`${file.name} adicionado à biblioteca`;showView('library')}
function showView(id){state.activeView=id;if(id!=='runner')document.body.classList.remove('core-running');$$('.view').forEach(v=>v.classList.remove('active'));$(`#${id}View`)?.classList.add('active');$$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===id));const titles={home:['Central de Emulação','Quatro sistemas, uma interface, núcleos independentes.'],library:['Biblioteca','Todos os seus jogos em um só lugar. O núcleo é escolhido automaticamente.'],favorites:['Favoritos','Seus atalhos rápidos, independente do sistema.'],cores:['Gerenciador de núcleos','Atualize cada engine separadamente sem acoplamento.'],diagnostics:['Diagnóstico','Capacidades do navegador e arquitetura do hub.']};if(titles[id]){[$('#viewTitle').textContent,$('#viewSubtitle').textContent]=titles[id]}const running=id==='runner';$('#backHub').hidden=!running;$('#fullscreenCore').hidden=!running;if(id==='library'||id==='favorites')renderGames()}
function openCore(id){const c=state.cores.find(x=>x.id===id);if(!c)return;state.activeCore=c;$('#runnerBadge').textContent=c.id.toUpperCase();$('#runnerName').textContent=c.name;$('#runnerMeta').textContent=`v${c.version} • ${c.engine}`;$('#coreFrame').src=`${c.entry}${c.entry.includes('?')?'&':'?'}embed=1`;$$('.view').forEach(v=>v.classList.remove('active'));$('#runnerView').classList.add('active');$('#viewTitle').textContent=c.name;$('#viewSubtitle').textContent=`${c.system} — execução isolada do hub`;$('#backHub').hidden=false;$('#fullscreenCore').hidden=false;document.body.classList.add('core-running');setRunnerLoading(true);
  clearTimeout(window.__neoRunnerWatchdog);
  window.__neoRunnerWatchdog=setTimeout(()=>{
    if(!$('#runnerLoading')?.classList.contains('hidden')){
      setRunnerLoading(false);
      $('#runnerHint').textContent='Núcleo iniciado • comunicação limitada';
    }
  },3500);
}
function diagnostics(){const webgl2=!!document.createElement('canvas').getContext('webgl2');const rows={Navegador:navigator.userAgent,CPU:`${navigator.hardwareConcurrency||'?'} threads`,Memória:navigator.deviceMemory?`${navigator.deviceMemory} GB aprox.`:'Não exposta',WebGL2:webgl2?'Disponível':'Indisponível',Gamepad:'getGamepads' in navigator?'Disponível':'Indisponível',ServiceWorker:'serviceWorker' in navigator?'Disponível':'Indisponível'};$('#environment').innerHTML=Object.entries(rows).map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
init();
