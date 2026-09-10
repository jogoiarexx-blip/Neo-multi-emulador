const VIEW_KEY='neo-nes-ui-view-v1';
const NEW_SETTINGS='neo-nes-settings-v41', OLD_SETTINGS='neo-nes-settings-v40';
try{if(!localStorage.getItem(NEW_SETTINGS)&&localStorage.getItem(OLD_SETTINGS))localStorage.setItem(NEW_SETTINGS,localStorage.getItem(OLD_SETTINGS));}catch{}

const views={
  home:'Início',play:'Jogar',library:'Biblioteca',settings:'Ajustes',saves:'Saves',tools:'Ferramentas'
};
let currentView='home';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const groupFor=view=>`.ui-group-${view}`;

function setView(view,{persist=true,focus=true}={}){
  if(!views[view])view='home'; currentView=view; if(view==='tools')document.querySelector('#diagPanel')?.classList.remove('hidden');
  const grouped=$$('main > [class*="ui-group-"]');
  for(const el of grouped){
    const belongs=el.classList.contains(`ui-group-${view}`);
    el.classList.toggle('ui-section-hidden',!belongs);
  }
  $$('[data-ui-view]').forEach(b=>{const on=b.dataset.uiView===view;b.classList.toggle('active',on);b.setAttribute('aria-current',on?'page':'false')});
  document.body.dataset.uiView=view;
  if(persist)try{localStorage.setItem(VIEW_KEY,view)}catch{}
  if(focus){const target=$(groupFor(view)); if(target)requestAnimationFrame(()=>target.scrollIntoView({behavior:'smooth',block:'start'}));}
}

function toast(text,kind='info'){
  const el=$('#uiToast'); if(!el||!text)return;
  el.textContent=text;el.dataset.kind=kind;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2300);
}

const commands=[
  ['▶ Jogar / tela do jogo',()=>setView('play')],
  ['⌂ Início',()=>setView('home')],
  ['▦ Biblioteca',()=>setView('library')],
  ['⚙ Ajustes',()=>setView('settings')],
  ['💾 Gerenciar saves',()=>setView('saves')],
  ['⌘ Ferramentas / diagnóstico',()=>setView('tools')],
  ['▶ Continuar emulação',()=>$('#playBtn')?.click()],
  ['⏸ Pausar emulação',()=>$('#pauseBtn')?.click()],
  ['↻ Resetar jogo',()=>$('#resetBtn')?.click()],
  ['⛶ Tela cheia',()=>$('#fullscreenBtn')?.click()],
  ['💾 Salvar estado',()=>$('#saveBtn')?.click()],
  ['📂 Carregar estado',()=>$('#loadBtn')?.click()],
  ['📷 Screenshot',()=>$('#screenshotBtn')?.click()],
  ['🎮 Configurar controles',()=>{setView('settings');$('#controlsBtn')?.click()}],
  ['🧪 Executar auto-teste',()=>{setView('tools');$('#diagBtn')?.click();setTimeout(()=>$('#selfTestBtn')?.click(),30)}],
];
let filtered=commands, selected=0;
function renderCommands(q=''){
  q=q.trim().toLowerCase();filtered=commands.filter(([name])=>name.toLowerCase().includes(q));selected=Math.min(selected,Math.max(0,filtered.length-1));
  const box=$('#commandList');if(!box)return;box.innerHTML='';
  filtered.forEach(([name],i)=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.className=i===selected?'selected':'';b.onclick=()=>{filtered[i][1]();closePalette()};box.appendChild(b)});
}
function openPalette(){const p=$('#commandPalette');if(!p)return;p.classList.remove('hidden');selected=0;renderCommands('');setTimeout(()=>$('#commandSearch')?.focus(),0)}
function closePalette(){$('#commandPalette')?.classList.add('hidden')}

function init(){
  $$('[data-ui-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.uiView)));
  let saved='home';try{saved=localStorage.getItem(VIEW_KEY)||'home'}catch{}setView(saved,{persist:false,focus:false});
  $('#commandPaletteBtn')?.addEventListener('click',openPalette);$('#closeCommandPalette')?.addEventListener('click',closePalette);
  $('#commandPalette')?.addEventListener('click',e=>{if(e.target.id==='commandPalette')closePalette()});
  $('#commandSearch')?.addEventListener('input',e=>{selected=0;renderCommands(e.target.value)});
  $('#commandSearch')?.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();selected=Math.min(filtered.length-1,selected+1);renderCommands(e.currentTarget.value)}else if(e.key==='ArrowUp'){e.preventDefault();selected=Math.max(0,selected-1);renderCommands(e.currentTarget.value)}else if(e.key==='Enter'&&filtered[selected]){e.preventDefault();filtered[selected][1]();closePalette()}});
  addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette()}else if(e.key==='Escape')closePalette()});
  // Loading/playing a game should bring the player into focus.
  $('#romInput')?.addEventListener('change',()=>setTimeout(()=>setView('play'),80));
  document.addEventListener('click',e=>{if(e.target.closest('#bundledGames .bundled-open,#libraryList .game-open,#continueBtn,#playBtn'))setTimeout(()=>setView('play'),40)},true);
  // Keep controls accessible when their old button opens them.
  $('#controlsBtn')?.addEventListener('click',()=>setView('settings',{focus:false}),true);
  $('#diagBtn')?.addEventListener('click',()=>setView('tools',{focus:false}),true);
  // Turn status changes into concise feedback.
  const st=$('#status');if(st){let prev=st.textContent;new MutationObserver(()=>{const now=st.textContent.trim();if(now&&now!==prev){prev=now;if(!/FPS|frame/i.test(now))toast(now)}}).observe(st,{childList:true,subtree:true,characterData:true});}
  // Add visible page title for current group on small screens.
  document.documentElement.classList.add('neo-ui-v0811');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
export{setView,toast};
