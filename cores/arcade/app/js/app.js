
let state={games:[],user:{favorites:[],recent:[]},cores:{},stats:{},bios:{},mameIndexInfo:{},controls:{profiles:{},gameOverrides:{}},cabinetMode:{},playStats:{games:{}},sections:{continueGames:[],mostPlayed:[]},compatibility:{games:{},hardwareDefaults:{}},filter:'all',q:'',sort:'title',page:1,pages:1,pageSize:60,facets:null,facetHardware:'',facetManufacturer:'',facetYear:''};
const $=s=>document.querySelector(s);


const CONTROL_LABELS={
  coin:'Coin',start:'Start',up:'Cima',down:'Baixo',left:'Esquerda',right:'Direita',
  b1:'Botão 1',b2:'Botão 2',b3:'Botão 3',b4:'Botão 4',b5:'Botão 5',b6:'Botão 6'
};
let captureTarget=null;

async function loadControls(){
  const r=await fetch('/api/controls');
  const d=await r.json();
  state.controls=d.controls||{profiles:{},gameOverrides:{}};
}
function connectedPads(){
  if(!navigator.getGamepads) return [];
  return [...navigator.getGamepads()].filter(Boolean).map((p,i)=>({index:p.index,id:p.id,buttons:p.buttons.length,axes:p.axes.length}));
}

function renderGamepads(){
  const pads=connectedPads();
  return `<div class="gamepads"><b>Gamepads detectados</b>${pads.length?
    pads.map(p=>`<div class="pad">🎮 <b>#${p.index}</b> ${esc(p.id)} • ${p.buttons} botões • ${p.axes} eixos</div>`).join(''):
    '<div class="pad">Nenhum gamepad detectado. Pressione um botão no controle e abra novamente.</div>'}
    <div id="padAssignments">${[1,2,3,4].map(player=>{
      const a=state.controls.gamepadAssignments?.[String(player)]||{};
      return `<div class="padassign"><span>Jogador ${player}</span>
        <select id="padSel_${player}"><option value="">Sem gamepad</option>${pads.map(p=>`<option value="${p.index}" ${String(a.deviceIndex)===String(p.index)?'selected':''}>#${p.index} ${esc(p.id)}</option>`).join('')}</select>
        <select id="presetSel_${player}">
          <option value="xbox" ${a.preset==='xbox'?'selected':''}>Xbox / XInput</option>
          <option value="playstation" ${a.preset==='playstation'?'selected':''}>PlayStation</option>
          <option value="arcade-stick" ${a.preset==='arcade-stick'?'selected':''}>Arcade Stick</option>
        </select>
      </div>`;
    }).join('')}</div>
  </div>`;
}
function getDefaultProfile(){
  return state.controls.profiles?.['arcade-default'] || {label:'Arcade Padrão',players:{}};
}

let padCaptureTarget=null;
let padCaptureRaf=null;

function pollPadCapture(){
  if(!padCaptureTarget)return;
  const pads=navigator.getGamepads?navigator.getGamepads():[];
  const pad=pads[Number(padCaptureTarget.deviceIndex)];
  if(pad){
    for(let i=0;i<pad.buttons.length;i++){
      if(pad.buttons[i]?.pressed || (pad.buttons[i]?.value||0)>0.6){
        const inp=$(`#map_${padCaptureTarget.p}_${padCaptureTarget.k}`);
        if(inp) inp.value=`BUTTON_${i}`;
        padCaptureTarget=null;return;
      }
    }
    for(let i=0;i<pad.axes.length;i++){
      const v=pad.axes[i]||0;
      if(Math.abs(v)>0.55){
        const inp=$(`#map_${padCaptureTarget.p}_${padCaptureTarget.k}`);
        if(inp) inp.value=`AXIS_${i}_${v<0?'NEG':'POS'}`;
        padCaptureTarget=null;return;
      }
    }
  }
  padCaptureRaf=requestAnimationFrame(pollPadCapture);
}

function controlsEditor(gameId=null){
  const base=JSON.parse(JSON.stringify(getDefaultProfile().players||{}));
  const override=gameId?(state.controls.gameOverrides?.[gameId]||{}):{};
  for(const [p,map] of Object.entries(override)){
    base[p]={...(base[p]||{}),...map};
  }
  const players=[1,2,3,4];
  return `<h2>${gameId?'Controles deste jogo':'Configuração de controles'}</h2>
    <p style="color:var(--muted)">Clique em “Capturar” e pressione uma tecla. Gamepads são detectados pela API do navegador; o mapeamento é salvo por jogo no NEO ARCADE.</p>
    ${renderGamepads()}
    <div class="hotkeys"><b>Hotkeys globais</b>
      ${[
        ['pause','Pause',state.controls.hotkeys?.pause||'KeyP'],
        ['exit','Sair',state.controls.hotkeys?.exit||'Escape'],
        ['saveState','Salvar estado',state.controls.hotkeys?.saveState||'F5'],
        ['loadState','Carregar estado',state.controls.hotkeys?.loadState||'F8']
      ].map(([k,l,v])=>`<div class="hotkeyedit"><span>${l}</span><input id="hot_${k}" value="${esc(v)}" readonly><button class="capture hotcap" data-hot="${k}">Capturar</button></div>`).join('')}
    </div>
    <div class="controls-grid">${players.map(p=>{
      const m=base[String(p)]||{};
      return `<div class="playerbox"><h3>Jogador ${p}</h3>${Object.entries(CONTROL_LABELS).map(([k,label])=>
        `<div class="maprow"><span>${label}</span><input id="map_${p}_${k}" value="${esc(m[k]||'')}" readonly><button class="capture" data-p="${p}" data-k="${k}">Tecla</button><button class="capture-pad" data-p="${p}" data-k="${k}">Gamepad</button></div>`
      ).join('')}</div>`;
    }).join('')}</div>
    <div class="controls-actions">
      <button class="play" id="saveControls">${gameId?'Salvar para este jogo':'Salvar perfil'}</button>
      ${gameId?'<button class="secondary" id="clearOverride">Usar padrão</button>':''}
    </div>`;
}
function bindCaptureButtons(){
  document.querySelectorAll('.capture').forEach(btn=>btn.onclick=()=>{
    if(btn.dataset.hot){
      captureTarget={hot:btn.dataset.hot};
    }else{
      captureTarget={p:btn.dataset.p,k:btn.dataset.k};
    }
    btn.textContent='Pressione...';
  });
  document.querySelectorAll('.capture-pad').forEach(btn=>btn.onclick=()=>{
    const p=btn.dataset.p,k=btn.dataset.k;
    const sel=$(`#padSel_${p}`);
    if(!sel || sel.value==='') return toast('Escolha um gamepad para o jogador '+p);
    padCaptureTarget={p,k,deviceIndex:Number(sel.value)};
    btn.textContent='Pressione no controle...';
    if(padCaptureRaf) cancelAnimationFrame(padCaptureRaf);
    pollPadCapture();
  });
}
document.addEventListener('keydown',e=>{
  if(!captureTarget)return;
  e.preventDefault();
  if(captureTarget.hot){
    const inp=$(`#hot_${captureTarget.hot}`);
    if(inp) inp.value=e.code;
  }else{
    const inp=$(`#map_${captureTarget.p}_${captureTarget.k}`);
    if(inp) inp.value=e.code;
  }
  document.querySelectorAll('.capture').forEach(b=>b.textContent=b.classList.contains('hotcap')?'Capturar':'Tecla');
  captureTarget=null;
});
function collectMappings(){
  const out={};
  for(let p=1;p<=4;p++){
    const m={}; let any=false;
    for(const k of Object.keys(CONTROL_LABELS)){
      const el=$(`#map_${p}_${k}`); if(el && el.value){m[k]=el.value;any=true;}
    }
    if(any) out[String(p)]=m;
  }
  return out;
}
async function openControls(gameId=null){
  await loadControls();
  $('#controlsContent').innerHTML=controlsEditor(gameId);
  $('#controlsModal').classList.remove('hidden');
  bindCaptureButtons();
  $('#saveControls').onclick=async()=>{
    const mapping=collectMappings();
    let payload;
    if(gameId){
      payload={type:'override',gameId,mapping};
    }else{
      payload={type:'profile',id:'arcade-default',profile:{label:'Arcade Padrão',players:mapping}};
    }
    let r=await fetch('/api/controls/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    let d=await r.json();
    if(!r.ok)return toast(d.error||'Erro ao salvar controles');

    for(let p=1;p<=4;p++){
      const sel=$(`#padSel_${p}`);
      if(sel && sel.value!==''){
        const pads=connectedPads(); const dev=pads.find(x=>String(x.index)===String(sel.value));
        const preset=$(`#presetSel_${p}`)?.value||null;
        r=await fetch('/api/controls/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'gamepadAssignment',player:p,deviceIndex:Number(sel.value),deviceId:dev?.id||'',preset})});
        d=await r.json();
      }
    }

    const hotkeys={
      pause:$('#hot_pause')?.value||'KeyP',
      exit:$('#hot_exit')?.value||'Escape',
      saveState:$('#hot_saveState')?.value||'F5',
      loadState:$('#hot_loadState')?.value||'F8'
    };
    r=await fetch('/api/controls/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'hotkeys',hotkeys})});
    d=await r.json();
    state.controls=d.controls;toast('Controles, gamepads e hotkeys salvos.');
    $('#controlsModal').classList.add('hidden');
  };
  const clear=$('#clearOverride');
  if(clear) clear.onclick=async()=>{
    const r=await fetch('/api/controls/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'deleteOverride',gameId})});
    const d=await r.json();
    if(!r.ok)return toast(d.error||'Erro');
    state.controls=d.controls;toast('Override removido. Usando perfil padrão.');
    $('#controlsModal').classList.add('hidden');
  };
}
window.addEventListener('gamepadconnected',()=>{if(!$('#controlsModal').classList.contains('hidden'))openControls();});

async function syncRuntime(){
  try{
    const r=await fetch('/api/runtime');
    const d=await r.json();
    state.cabinetMode=d.cabinetMode||{};
    document.body.classList.toggle('cabinet',Boolean(state.cabinetMode.enabled));
    if(state.cabinetMode.enabled && state.cabinetMode.fullscreenFrontend && document.fullscreenElement==null){
      // Browser may require a user gesture, so this is best-effort only.
    }
    let bar=$('#runtimebar');
    if(d.running){
      if(!bar){
        bar=document.createElement('div');bar.id='runtimebar';bar.className='runtimebar';document.body.appendChild(bar);
      }
      bar.innerHTML=`Executando: <b>${esc(d.game?.title||'Jogo')}</b> • ${esc(d.game?.core||'core')}`;
    }else if(bar){bar.remove();}
  }catch(e){}
}
async function toggleCabinet(){
  const enabled=!Boolean(state.cabinetMode?.enabled);
  const r=await fetch('/api/cabinet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})});
  const d=await r.json();
  if(!r.ok)return toast(d.error||'Erro ao alterar modo gabinete');
  state.cabinetMode=d.cabinetMode||{};
  document.body.classList.toggle('cabinet',enabled);
  if(enabled){
    try{await document.documentElement.requestFullscreen();}catch(e){}
    toast('Modo Gabinete ativado.');
  }else{
    try{if(document.fullscreenElement)await document.exitFullscreen();}catch(e){}
    toast('Modo Gabinete desativado.');
  }
}
setInterval(syncRuntime,1500);


function videoDescriptions(id){
  return {
    low:'Menor uso de GPU/CPU. Sem filtros e sem VSync.',
    medium:'Equilíbrio entre qualidade, fluidez e desempenho.',
    high:'Mais qualidade, VSync e sincronização mais agressiva.',
    pixel:'Sem suavização, proporção mais fiel e pixels nítidos.',
    crt:'Preset voltado para aparência de monitor arcade.'
  }[id]||'';
}
function openVideoSettings(){
  const profiles=state.settings?.videoProfiles||{};
  const active=state.user?.videoProfile||state.settings?.defaultVideoProfile||'medium';
  $('#videoContent').innerHTML=`<h2>Configurações gráficas</h2><p style="color:var(--muted)">O perfil é aplicado ao MAME na próxima vez que um jogo for aberto.</p>
    <div class="video-grid">${Object.entries(profiles).map(([id,p])=>`<div class="video-card ${id===active?'active':''}" data-video="${id}">
      <h3>${esc(p.label)}</h3><p>${esc(videoDescriptions(id))}</p>
    </div>`).join('')}</div>`;
  $('#videoModal').classList.remove('hidden');
  document.querySelectorAll('.video-card').forEach(c=>c.onclick=async()=>{
    const profile=c.dataset.video;
    const r=await fetch('/api/video-profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile})});
    const d=await r.json();
    if(!r.ok)return toast(d.error||'Erro ao salvar perfil gráfico');
    state.user.videoProfile=profile;
    document.querySelectorAll('.video-card').forEach(x=>x.classList.toggle('active',x.dataset.video===profile));
    toast('Perfil gráfico: '+profiles[profile].label);
  });
}
async function showLoading(gameTitle){
  $('#loadingGame').textContent=gameTitle||'Preparando jogo...';
  $('#loadingOverlay').classList.remove('hidden');
  const steps=[['Validando ROM...',18],['Selecionando core...',38],['Aplicando controles...',58],['Aplicando vídeo...',76],['Iniciando arcade...',100]];
  for(const [text,pct] of steps){
    $('#loadingStep').textContent=text;
    $('#loadingBar').style.width=pct+'%';
    await new Promise(r=>setTimeout(r,150));
  }
}
function hideLoading(){
  $('#loadingOverlay').classList.add('hidden');
  $('#loadingBar').style.width='0%';
}

async function openAudit(){
  const [ar,lr]=await Promise.all([fetch('/api/audit'),fetch('/api/log-tail')]);
  const a=await ar.json(), l=await lr.json();
  if(!ar.ok)return toast(a.error||'Erro ao gerar auditoria');
  const t=a.totals||{};
  $('#auditContent').innerHTML=`<h2>Diagnóstico do NEO ARCADE</h2>
    <p style="color:var(--muted)">Resumo da biblioteca, cores, BIOS e últimos eventos.</p>
    <div class="audit-grid">
      <div class="audit-box"><span>ROMs</span><b>${t.roms||0}</b></div>
      <div class="audit-box"><span>OK</span><b>${t.ok||0}</b></div>
      <div class="audit-box"><span>Avisos</span><b>${t.warnings||0}</b></div>
      <div class="audit-box"><span>Erros</span><b>${t.errors||0}</b></div>
    </div>
    <h3>Problemas encontrados</h3>
    ${(a.problems||[]).length?(a.problems||[]).slice(0,100).map(p=>`<div class="audit-problem ${esc(p.health)}"><b>${esc(p.title)}</b><div class="path">${esc(p.path)}</div>${(p.issues||[]).map(i=>`<div>${esc(i.level.toUpperCase())}: ${esc(i.message)}</div>`).join('')}</div>`).join(''):'<div class="audit-problem">Nenhum problema encontrado.</div>'}
    <h3>Últimos eventos</h3>
    <div class="logbox">${esc((l.lines||[]).join('\\n')||'Nenhum evento registrado.')}</div>`;
  $('#auditModal').classList.remove('hidden');
}

async function loadPagedLibrary(){
  const p=new URLSearchParams({q:state.q||'',page:String(state.page||1),pageSize:String(state.pageSize||60)});
  if(state.facetHardware)p.set('hardware',state.facetHardware);
  if(state.facetManufacturer)p.set('manufacturer',state.facetManufacturer);
  if(state.facetYear)p.set('year',state.facetYear);
  const r=await fetch('/api/library-page?'+p.toString()), d=await r.json();
  if(!r.ok)return toast(d.error||'Erro ao carregar biblioteca');
  state.games=d.games||[];state.page=d.page||1;state.pages=d.pages||1;state.facets=d.facets||null;
  $('#pageInfo').textContent=`${state.page} / ${state.pages}`;
  const fill=(id,items,label,current)=>{const el=$(id);el.innerHTML=`<option value="">${label}</option>`+(items||[]).map(x=>`<option value="${esc(x.value)}" ${x.value===current?'selected':''}>${esc(x.value)} (${x.count})</option>`).join('');};
  if(state.facets){fill('#filterHardware',state.facets.hardware,'Todos hardwares',state.facetHardware);fill('#filterManufacturer',state.facets.manufacturers,'Todos fabricantes',state.facetManufacturer);fill('#filterYear',state.facets.years,'Todos anos',state.facetYear);}
}

async function maybeFirstRun(){
  try{
    const r=await fetch('/api/first-run'),d=await r.json();
    if(!r.ok||d.state?.completed)return;
    const rd=d.readiness||{},cores=rd.cores||{},bios=rd.bios?.rules||{};
    $('#setupContent').innerHTML=`<h2>Configuração inicial</h2><p style="color:var(--muted)">Verificando se o NEO ARCADE está pronto para jogar.</p>
      <div class="setup-steps">
        <div class="setup-card"><h3>Pasta ROMs</h3><p class="${rd.romFolder?'setup-ok':'setup-bad'}">${rd.romFolder?'✓ Encontrada':'✕ Não encontrada'}</p><p>${rd.romCount||0} ROM(s) detectada(s).</p></div>
        <div class="setup-card"><h3>Cores</h3>${Object.values(cores).map(c=>`<p class="${c.installed?'setup-ok':'setup-bad'}">${c.installed?'✓':'✕'} ${esc(c.label)}</p>`).join('')}</div>
        <div class="setup-card"><h3>BIOS</h3>${Object.values(bios).length?Object.values(bios).map(b=>`<p class="${b.installed?'setup-ok':'setup-bad'}">${b.installed?'✓':'•'} ${esc(b.label)}</p>`).join(''):'<p>Nenhuma BIOS obrigatória detectada agora.</p>'}</div>
        <div class="setup-card"><h3>Status</h3><p class="${rd.ready?'setup-ok':'setup-bad'}">${rd.ready?'Pronto para jogar':'Instale pelo menos um core para iniciar jogos.'}</p></div>
      </div>
      <div class="controls-actions"><button class="play" id="finishSetup">${rd.ready?'Concluir configuração':'Continuar mesmo assim'}</button></div>`;
    $('#setupModal').classList.remove('hidden');
    $('#finishSetup').onclick=async()=>{await fetch('/api/first-run/complete',{method:'POST'});$('#setupModal').classList.add('hidden');toast('Configuração inicial concluída.');};
  }catch(e){}
}
async function load(){
  await loadControls();await syncRuntime();
  const r=await fetch('/api/library');state={...state,...await r.json()};
  await loadPagedLibrary();
  renderCoreStatus();renderStats();renderMameImport();render();await maybeFirstRun();
}

function renderMameImport(){
  const m=state.mameIndexInfo||{};
  const el=$('#mameImportStatus'); if(!el)return;
  if(m.count){
    const when=m.generatedAt?new Date(m.generatedAt).toLocaleString('pt-BR'):'';
    el.innerHTML=`Índice MAME: <b>${m.count.toLocaleString('pt-BR')}</b> máquinas • ${m.cloneCount||0} clones • ${m.biosCount||0} BIOS${when?' • '+when:''}`;
  }else{
    el.innerHTML='Índice MAME ainda não importado. Instale o MAME e execute <b>IMPORTAR-MAME.bat</b> para reconhecer milhares de máquinas.';
  }
}
function renderCoreStatus(){
  const biosRules=state.bios?.rules||{};
  const biosHtml=Object.values(biosRules).map(b=>`<div><span class="dot ${b.installed?'ok':'bad'}"></span>${esc(b.label)}</div>`).join('');
  $('#coreStatus').innerHTML='<b>CORES</b><br><br>'+Object.entries(state.cores).map(([id,c])=>
    `<div><span class="dot ${c.installed?'ok':'bad'}"></span>${c.label}</div>`).join('')+
    (biosHtml?'<br><b>BIOS</b><br><br>'+biosHtml:'');
}
function renderStats(){
  const s=state.stats||{};
  $('#scanStats').innerHTML=[
    `${s.total||0} ROMs`,
    `${s.identified||0} identificadas`,
    `${s.healthy||0} OK`,
    `${s.warnings||0} avisos`,
    `${s.errors||0} erros`,
    `${s.duplicates||0} duplicadas`,
    `${s.mameIndexed||0} no índice MAME`,
    `${s.cacheHits||0} cache hits`
  ].map((x,i)=>`<span class="statpill ${i>=3?'warn':''}">${x}</span>`).join('');
}
function filtered(){
  let g=[...state.games];const f=state.filter;
  if(f==='favorites')g=g.filter(x=>state.user.favorites.includes(x.id));
  else if(f==='recent')g=g.filter(x=>state.user.recent.includes(x.id)).sort((a,b)=>state.user.recent.indexOf(a.id)-state.user.recent.indexOf(b.id));
  else if(f==='continue')g=g.filter(x=>(state.sections?.continueGames||[]).includes(x.id)).sort((a,b)=>(state.sections?.continueGames||[]).indexOf(a.id)-(state.sections?.continueGames||[]).indexOf(b.id));
  else if(f==='mostplayed')g=g.filter(x=>(state.sections?.mostPlayed||[]).includes(x.id)).sort((a,b)=>(state.sections?.mostPlayed||[]).indexOf(a.id)-(state.sections?.mostPlayed||[]).indexOf(b.id));
  else if(f==='unknown')g=g.filter(x=>!x.identified);
  else if(f==='duplicates')g=g.filter(x=>x.duplicate);
  else if(f==='problems')g=g.filter(x=>x.health!=='ok');
  else if(f!=='all')g=g.filter(x=>x.genre===f);
  if(state.q)g=g.filter(x=>(x.title+' '+x.manufacturer+' '+x.hardware+' '+x.relativePath).toLowerCase().includes(state.q));
  if(f!=='recent')g.sort((a,b)=>{
    if(state.sort==='year')return(a.year||9999)-(b.year||9999);
    if(state.sort==='played')return ((state.playStats?.games?.[b.id]?.totalSeconds)||0)-((state.playStats?.games?.[a.id]?.totalSeconds)||0);
    return String(a[state.sort]||'').localeCompare(String(b[state.sort]||''),'pt-BR');
  });
  return g;
}
function healthLabel(h){return h==='error'?'ERRO':h==='warn'?'AVISO':'OK'}
function healthClass(h){return h==='error'?'errtxt':h==='warn'?'warntxt':'oktxt'}
function render(){
  const g=filtered();$('#count').textContent=`${g.length} jogo${g.length===1?'':'s'}`;
  $('#empty').classList.toggle('hidden',g.length>0);
  $('#grid').innerHTML=g.map(x=>`<div class="card ${x.identified?'':'unknown'}" data-id="${enc(x.id)}">
    <div class="cover">${x.artwork?`<img src="${esc(x.artwork)}" alt="${esc(x.title)}">`:'<div class="cab">🕹️</div>'}${x.duplicate?'<div class="dupmark">DUPLICADO</div>':''}${state.user.favorites.includes(x.id)?'<div class="fav">★</div>':''}${state.filter==='mostplayed'?`<div class="rankbadge">#${(state.sections?.mostPlayed||[]).indexOf(x.id)+1}</div>`:''}${state.filter==='continue'?'<div class="resume">CONTINUAR</div>':''}<div class="health ${healthClass(x.health)}">${healthLabel(x.health)}</div></div>
    <div class="meta"><div class="title">${esc(x.title)}</div><div class="sub">${x.identified?(x.year||'—')+' • '+esc(x.manufacturer):'ROM não identificada'}</div>
    <div class="path">${esc(x.relativePath)}</div><div class="tag">${esc(x.identified?x.hardware:'MAME automático')}</div></div>
  </div>`).join('');
  document.querySelectorAll('.card').forEach(c=>c.onclick=()=>details(dec(c.dataset.id)));
}
function enc(s){return encodeURIComponent(s)}function dec(s){return decodeURIComponent(s)}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}



async function openStates(game){
  const r=await fetch('/api/save-states?gameId='+encodeURIComponent(game.gameId)); const d=await r.json();
  if(!r.ok)return toast(d.error||'Erro ao ler save states');
  $('#statesContent').innerHTML=`<h2>Save States — ${esc(game.title)}</h2>
  <p style="color:var(--muted)">Integridade, backups e restauração.</p>
  <div class="states-grid">${d.slots.map(s=>`<div class="state-card ${s.exists?'':'empty'}"><h4>Slot ${esc(s.slot)}</h4><p>${s.exists?'Atualizado: '+new Date(s.updatedAt).toLocaleString('pt-BR'):'Vazio'}</p>${s.exists?`<p>Integridade: <b style="color:${s.integrity?.valid?'var(--accent)':'#ff6b6b'}">${s.integrity?.valid?'OK':'PROBLEMA'}</b></p>`:''}<div class="state-actions">${s.exists&&s.integrity?.valid?`<button data-loadslot="${esc(s.slot)}">▶ Carregar</button>`:''}${s.exists?`<button data-delslot="${esc(s.slot)}">Excluir</button>`:''}</div></div>`).join('')}</div>
  <h3 style="margin-top:20px">Backups</h3>
  <div class="states-grid">${(d.backups||[]).length?(d.backups||[]).map(b=>`<div class="state-card"><h4>Slot ${esc(b.slot)}</h4><p>${new Date(b.updatedAt).toLocaleString('pt-BR')}</p><div class="state-actions"><button data-restore="${esc(b.file)}">Restaurar</button></div></div>`).join(''):'<div class="state-card empty"><p>Nenhum backup.</p></div>'}</div>`;
  $('#statesModal').classList.remove('hidden');
  document.querySelectorAll('[data-loadslot]').forEach(b=>b.onclick=async()=>{$('#statesModal').classList.add('hidden');await launch(game.id,b.dataset.loadslot);});
  document.querySelectorAll('[data-delslot]').forEach(b=>b.onclick=async()=>{const rr=await fetch('/api/save-state/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:game.gameId,slot:b.dataset.delslot})});const dd=await rr.json();if(!rr.ok)return toast(dd.error||'Erro');toast('State excluído e backup preservado.');await openStates(game);});
  document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{const rr=await fetch('/api/save-state/restore-backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:game.gameId,backupFile:b.dataset.restore})});const dd=await rr.json();if(!rr.ok)return toast(dd.error||'Erro ao restaurar');toast('Backup restaurado.');await openStates(game);});
}
function details(id){
  const g=state.games.find(x=>x.id===id);if(!g)return;
  const installed=state.cores[g.recommendedCore]?.installed;
  const issues=(g.issues||[]);
  const zipRows=g.zip?.ok?(g.zip.entries||[]).slice(0,60).map(e=>`<div class="ziprow"><span>${esc(e.name)}</span><span>CRC ${esc(e.crc32)}</span><span>${Math.round(e.uncompressedSize/1024)} KB</span></div>`).join(''):'';
  $('#details').innerHTML=`<div class="detail-top"><div class="bigicon">🕹️</div><div class="info">
    <h2>${esc(g.title)}</h2>
    <p>${g.identified?`${g.year||'Ano desconhecido'} • ${esc(g.manufacturer)}`:'<b>ROM ainda não identificada no banco interno.</b>'}</p>
    <p>Arquivo: <b>${esc(g.relativePath)}</b></p>
    <p>Hardware: <b>${esc(g.hardware)}</b></p><p>Gênero: <b>${esc(g.genre)}</b>${g.players?` • ${g.players} jogador(es)`:''}</p>
    <p>Core recomendado: <b>${esc(state.cores[g.recommendedCore]?.label||g.recommendedCore)}</b> ${installed?'✓':'⚠ não instalado'} <span class="origin">${esc(g.identifiedBy||'desconhecido')}</span></p>
    ${(()=>{const cp=state.compatibility?.games?.[g.id]||{};return `<div class="parentbox"><b>Compatibilidade aprendida</b><br>${cp.workingCore?`Core que já funcionou: <b>${esc(state.cores[cp.workingCore]?.label||cp.workingCore)}</b><br>`:'Nenhum core confirmado ainda.<br>'}${(cp.failedCores||[]).length?`Falhas registradas: <b>${esc(cp.failedCores.join(', '))}</b>`:''}</div>`})()}
    ${(()=>{const ps=state.playStats?.games?.[g.id]||{};const mins=Math.floor((ps.totalSeconds||0)/60);return `<div class="playstats"><div class="playstat">Sessões: <b>${ps.sessions||0}</b></div><div class="playstat">Tempo: <b>${mins} min</b></div>${ps.lastPlayed?`<div class="playstat">Última vez: <b>${new Date(ps.lastPlayed).toLocaleDateString('pt-BR')}</b></div>`:''}</div>`})()}
    ${g.mameMeta?`<div class="parentbox"><b>MAME</b><br>${g.mameMeta.cloneof?`Clone de: <b>${esc(g.mameMeta.cloneof)}</b><br>`:''}${g.mameMeta.romof?`ROM pai/BIOS: <b>${esc(g.mameMeta.romof)}</b><br>`:''}${g.mameMeta.sourcefile?`Driver: <b>${esc(g.mameMeta.sourcefile)}</b>`:''}</div>`:''}
    <p class="hash">SHA-1: ${esc(g.sha1||'não calculado')}</p>
    <select class="selectcore" id="coreSel"><option value="auto">Automático</option>${Object.entries(state.cores).map(([k,c])=>`<option value="${k}">${esc(c.label)}${c.installed?'':' (não instalado)'}</option>`).join('')}</select><br>
    <button class="play" id="play">JOGAR</button><button class="favbtn" id="favBtn">${state.user.favorites.includes(id)?'★ Remover favorito':'☆ Favoritar'}</button><button class="favbtn" id="gameControlsBtn">🎮 Controles</button><button class="favbtn" id="genMameCfg">⚙ Gerar CFG MAME</button><button class="favbtn" id="compatBtn">🧠 Compatibilidade</button><button class="favbtn" id="statesBtn">💾 Save States</button>${g.latestState?'<button class="favbtn" id="continueStateBtn">▶ Continuar state</button>':''}
  </div></div>
  <div class="diag"><h3>Diagnóstico</h3>
    ${issues.length?issues.map(i=>`<div class="issue ${esc(i.level)}">${esc(i.message)}</div>`).join(''):'<div class="issue">✓ Nenhum problema detectado pelo diagnóstico atual.</div>'}
    ${g.biosRule?`<div class="issue ${g.biosStatus?.installed?'':'warn'}">BIOS: ${esc(g.biosStatus?.label||g.biosRule)} — ${g.biosStatus?.installed?'encontrada ✓':'não encontrada ⚠'}</div>`:''}
    ${g.zip?.ok?`<p><b>Conteúdo do ZIP:</b> ${g.zip.entries.length} arquivo(s), ${Math.round((g.zip.totalUncompressed||0)/1024/1024)} MB descompactados</p><div class="ziplist">${zipRows}</div>`:''}
  </div>`;
  $('#modal').classList.remove('hidden');
  $('#favBtn').onclick=()=>favorite(id);$('#play').onclick=()=>launch(id);$('#gameControlsBtn').onclick=()=>openControls(id);
  $('#compatBtn').onclick=async()=>{
    const core=$('#coreSel').value==='auto'?g.recommendedCore:$('#coreSel').value;
    const r=await fetch('/api/compatibility',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:g.id,action:'setWorkingCore',core})});
    const d=await r.json();if(!r.ok)return toast(d.error||'Erro ao salvar compatibilidade');
    state.compatibility.games[g.id]=d.compatibility;toast('Core marcado como compatível para este jogo.');details(g.id);
  };
  $('#statesBtn').onclick=()=>openStates(g);
  const cs=$('#continueStateBtn');if(cs)cs.onclick=()=>launch(id,g.latestState?.slot||null);
  $('#genMameCfg').onclick=async()=>{
    const r=await fetch('/api/mame-config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:id})});
    const d=await r.json();
    if(!r.ok)return toast(d.error||'Erro ao gerar configuração');
    toast('Configuração MAME gerada: '+d.file);
  };
}
async function favorite(id){
  const r=await fetch('/api/favorite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
  const d=await r.json();state.user.favorites=d.favorites;render();details(id);
}
async function launch(id,resumeSlot=null){
  const core=$('#coreSel').value;
  const game=state.games.find(x=>x.id===id);
  const pr=await fetch('/api/preflight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,core})});
  const pd=await pr.json();
  if(!pr.ok||!pd.ok){
    const detail=(pd.attempts||[]).map(a=>`${a.core}: ${(a.issues||[]).map(i=>i.message).join(' ')}`).join(' | ');
    return toast(pd.error||detail||'Nenhum core disponível para iniciar.');
  }
  await showLoading(game?.title||'Preparando jogo...');
  $('#loadingStep').textContent=`Core selecionado: ${state.cores[pd.selectedCore]?.label||pd.selectedCore}`;
  const r=await fetch('/api/launch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,core,resumeSlot})});
  const d=await r.json();if(!r.ok){hideLoading();return toast(d.error||'Falha ao iniciar');}
  const fallback=(d.recoveryAttempts||[]).length>1?' • fallback automático':'';
  toast('Jogo iniciado com '+(state.cores[d.core]?.label||d.core)+(d.generatedCfg?' • CFG aplicado':'')+fallback);$('#modal').classList.add('hidden');setTimeout(hideLoading,350);await load();
}
function toast(t){$('#toast').textContent=t;$('#toast').classList.remove('hidden');setTimeout(()=>$('#toast').classList.add('hidden'),4200)}
$('#search').oninput=async e=>{state.q=e.target.value.toLowerCase();state.page=1;await loadPagedLibrary();render()};
$('#sort').onchange=e=>{state.sort=e.target.value;render()};
$('#refresh').onclick=async()=>{toast('Analisando ROMs, ZIPs, hashes e BIOS...');await load();};
$('#close').onclick=()=>$('#modal').classList.add('hidden');
$('#modal').onclick=e=>{if(e.target.id==='modal')$('#modal').classList.add('hidden')};
document.querySelectorAll('.nav').forEach(n=>n.onclick=()=>{document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));n.classList.add('active');state.filter=n.dataset.filter;render()});
load();

$('#controlsBtn').onclick=e=>{e.preventDefault();openControls()};
$('#controlsClose').onclick=()=>$('#controlsModal').classList.add('hidden');
$('#controlsModal').onclick=e=>{if(e.target.id==='controlsModal')$('#controlsModal').classList.add('hidden')};

$('#cabinetBtn').onclick=e=>{e.preventDefault();toggleCabinet()};

$('#videoBtn').onclick=e=>{e.preventDefault();openVideoSettings()};
$('#videoClose').onclick=()=>$('#videoModal').classList.add('hidden');
$('#videoModal').onclick=e=>{if(e.target.id==='videoModal')$('#videoModal').classList.add('hidden')};

$('#organizeShots').onclick=async()=>{
  const r=await fetch('/api/organize-screenshots',{method:'POST'});
  const d=await r.json();
  if(!r.ok)return toast(d.error||'Erro ao organizar screenshots');
  toast(`${d.processed||0} screenshot(s) atualizada(s) na biblioteca.`);
  await load();
};

$('#statesClose').onclick=()=>$('#statesModal').classList.add('hidden');
$('#statesModal').onclick=e=>{if(e.target.id==='statesModal')$('#statesModal').classList.add('hidden')};

$('#auditBtn').onclick=e=>{e.preventDefault();openAudit()};
$('#auditClose').onclick=()=>$('#auditModal').classList.add('hidden');
$('#auditModal').onclick=e=>{if(e.target.id==='auditModal')$('#auditModal').classList.add('hidden')};

$('#clearCache').onclick=async()=>{
  const r=await fetch('/api/cache/clear',{method:'POST'});const d=await r.json();
  if(!r.ok)return toast(d.error||'Erro ao limpar cache');
  toast('Cache limpo. O próximo scan será completo.');await load();
};

$('#prevPage').onclick=async()=>{if(state.page>1){state.page--;await loadPagedLibrary();render();}};
$('#nextPage').onclick=async()=>{if(state.page<state.pages){state.page++;await loadPagedLibrary();render();}};
$('#filterHardware').onchange=async e=>{state.facetHardware=e.target.value;state.page=1;await loadPagedLibrary();render();};
$('#filterManufacturer').onchange=async e=>{state.facetManufacturer=e.target.value;state.page=1;await loadPagedLibrary();render();};
$('#filterYear').onchange=async e=>{state.facetYear=e.target.value;state.page=1;await loadPagedLibrary();render();};

$('#setupClose').onclick=()=>$('#setupModal').classList.add('hidden');
$('#setupModal').onclick=e=>{if(e.target.id==='setupModal')$('#setupModal').classList.add('hidden')};
