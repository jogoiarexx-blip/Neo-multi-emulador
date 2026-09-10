
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const HUB_ROOT = __dirname;
const ROOT = path.join(HUB_ROOT, 'cores', 'arcade');
const APP = path.join(HUB_ROOT, 'app');
const CORES_ROOT = path.join(HUB_ROOT, 'cores');
const ROM_ROOT = path.join(ROOT, 'roms');
const BIOS_ROOT = path.join(ROOT, 'bios');
const SETTINGS = JSON.parse(fs.readFileSync(path.join(ROOT,'config','settings.json'),'utf8'));
const DB = JSON.parse(fs.readFileSync(path.join(ROOT,'database','games.json'),'utf8'));
const BIOS_RULES = JSON.parse(fs.readFileSync(path.join(ROOT,'database','bios-rules.json'),'utf8'));
const SIGDB = JSON.parse(fs.readFileSync(path.join(ROOT,'database','rom-signatures.json'),'utf8'));
function loadMameIndex(){
  const p=path.join(ROOT,SETTINGS.mameIndexFile||'database/mame-index.json');
  try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){return {count:0,cloneCount:0,biosCount:0,games:{},bios:{}};}
}
const USER_FILE = path.join(ROOT,'config','user.json');
const CONTROL_FILE = path.join(ROOT, (SETTINGS.controls&&SETTINGS.controls.profilesFile)||'config/control-profiles.json');
let activeGameProcess=null;
let activeGameInfo=null;
const DIAG=SETTINGS.diagnostics||{};
const LOG_FILE=path.join(ROOT,DIAG.logFile||'logs/neo-arcade.log');
const AUDIT_FILE=path.join(ROOT,DIAG.auditReportFile||'logs/library-audit.json');
const COMPAT_FILE=path.join(ROOT,(SETTINGS.compatibilityProfiles&&SETTINGS.compatibilityProfiles.file)||'config/compatibility-profiles.json');
const FIRST_RUN_FILE=path.join(ROOT,(SETTINGS.firstRun&&SETTINGS.firstRun.stateFile)||'config/first-run.json');
function firstRunState(){try{return JSON.parse(fs.readFileSync(FIRST_RUN_FILE,'utf8'));}catch(e){return {completed:false,completedAt:null};}}
function saveFirstRunState(data){fs.writeFileSync(FIRST_RUN_FILE,JSON.stringify(data,null,2));}
function readiness(){
  const cores=coreStatus(), bios=scanBios(), romCount=scanRoms().length;
  return {romFolder:fs.existsSync(ROM_ROOT),romCount,cores,bios,ready:Boolean(Object.values(cores).some(c=>c.installed)&&fs.existsSync(ROM_ROOT))};
}

function compatibilityProfiles(){
  try{return JSON.parse(fs.readFileSync(COMPAT_FILE,'utf8'));}catch(e){return {games:{},hardwareDefaults:{}};}
}
function saveCompatibilityProfiles(data){fs.writeFileSync(COMPAT_FILE,JSON.stringify(data,null,2));}
function gameCompat(game){
  const c=compatibilityProfiles();
  const g=(c.games&&c.games[game.id])||{};
  const hw=(c.hardwareDefaults&&c.hardwareDefaults[game.hardware])||{};
  return {game:g,hardware:hw};
}
function rememberWorkingCore(game,coreId){
  if(!(SETTINGS.compatibilityProfiles&&SETTINGS.compatibilityProfiles.rememberWorkingCore))return;
  const c=compatibilityProfiles();c.games=c.games||{};
  const g=c.games[game.id]||{};
  g.workingCore=coreId;g.lastSuccessAt=new Date().toISOString();
  g.failedCores=(g.failedCores||[]).filter(x=>x!==coreId);
  c.games[game.id]=g;saveCompatibilityProfiles(c);
}
function rememberFailedCore(game,coreId,reason='launch_failed'){
  if(!(SETTINGS.compatibilityProfiles&&SETTINGS.compatibilityProfiles.blacklistFailedCore))return;
  const c=compatibilityProfiles();c.games=c.games||{};
  const g=c.games[game.id]||{};
  g.failedCores=[...new Set([...(g.failedCores||[]),coreId])];
  g.lastFailure={core:coreId,reason,time:new Date().toISOString()};
  c.games[game.id]=g;saveCompatibilityProfiles(c);
}

function rotateLog(){
  try{
    if(fs.existsSync(LOG_FILE)&&fs.statSync(LOG_FILE).size>(DIAG.maxLogBytes||1048576)){
      const old=LOG_FILE+'.1';
      if(fs.existsSync(old))fs.unlinkSync(old);
      fs.renameSync(LOG_FILE,old);
    }
  }catch(e){}
}
function logEvent(type,data={}){
  if(DIAG.enabled===false)return;
  try{
    fs.mkdirSync(path.dirname(LOG_FILE),{recursive:true});
    rotateLog();
    fs.appendFileSync(LOG_FILE,JSON.stringify({time:new Date().toISOString(),type,...data})+'\n');
  }catch(e){}
}
function buildAudit(){
  const games=scanRoms();
  const cores=coreStatus();
  const bios=scanBios();
  const summary={
    generatedAt:new Date().toISOString(),
    totals:{
      roms:games.length,
      ok:games.filter(g=>g.health==='ok').length,
      warnings:games.filter(g=>g.health==='warn').length,
      errors:games.filter(g=>g.health==='error').length,
      unidentified:games.filter(g=>!g.identified).length,
      duplicates:games.filter(g=>g.duplicate).length
    },
    cores,
    bios,
    problems:games.filter(g=>g.health!=='ok').map(g=>({
      id:g.id,title:g.title,path:g.relativePath,health:g.health,issues:g.issues
    }))
  };
  fs.mkdirSync(path.dirname(AUDIT_FILE),{recursive:true});
  fs.writeFileSync(AUDIT_FILE,JSON.stringify(summary,null,2));
  return summary;
}


function controls(){
  try{return JSON.parse(fs.readFileSync(CONTROL_FILE,'utf8'));}catch(e){return {profiles:{},gameOverrides:{}};}
}
function saveControls(data){
  fs.writeFileSync(CONTROL_FILE, JSON.stringify(data,null,2));
}

const STATS_FILE=path.join(ROOT,SETTINGS.statsFile||'config/play-stats.json');
function playStats(){
  try{return JSON.parse(fs.readFileSync(STATS_FILE,'utf8'));}catch(e){return {games:{}};}
}
function savePlayStats(data){fs.writeFileSync(STATS_FILE,JSON.stringify(data,null,2));}
function beginPlayStat(game,core){
  const s=playStats();s.games=s.games||{};
  const g=s.games[game.id]||{sessions:0,totalSeconds:0,lastPlayed:null};
  g.sessions=(g.sessions||0)+1;g.lastPlayed=new Date().toISOString();g.lastCore=core;
  s.games[game.id]=g;savePlayStats(s);
}
function endPlayStat(gameId,startedAt){
  if(!gameId||!startedAt)return;
  const seconds=Math.max(0,Math.floor((Date.now()-new Date(startedAt).getTime())/1000));
  const s=playStats();s.games=s.games||{};
  const g=s.games[gameId]||{sessions:0,totalSeconds:0,lastPlayed:null};
  g.totalSeconds=(g.totalSeconds||0)+seconds;s.games[gameId]=g;savePlayStats(s);
}
function findArtwork(gameId){
  const cfg=SETTINGS.artwork||{};const exts=cfg.extensions||['.png','.jpg','.jpeg','.webp'];
  for(const base of [cfg.artworkDir||'artwork',cfg.screenshotsDir||'screenshots']){
    const dir=path.join(ROOT,base);
    for(const ext of exts){
      const file=path.join(dir,gameId+ext);
      if(fs.existsSync(file)) return '/media/'+base+'/'+gameId+ext;
    }
  }
  return null;
}

function organizeScreenshots(){
  const cfg=SETTINGS.screenshotOrganizer||{};
  if(cfg.enabled===false) return {processed:0};
  const src=path.join(ROOT,cfg.sourceDir||'screenshots');
  const art=path.join(ROOT,cfg.artworkDir||'artwork');
  fs.mkdirSync(src,{recursive:true});fs.mkdirSync(art,{recursive:true});
  let processed=0;
  for(const entry of fs.readdirSync(src,{withFileTypes:true})){
    if(!entry.isDirectory()) continue;
    const gameId=entry.name.toLowerCase();
    const dir=path.join(src,entry.name);
    const imgs=fs.readdirSync(dir).filter(n=>/\.(png|jpe?g|webp)$/i.test(n))
      .map(n=>({name:n,full:path.join(dir,n),mtime:fs.statSync(path.join(dir,n)).mtimeMs}))
      .sort((a,b)=>b.mtime-a.mtime);
    if(!imgs.length) continue;
    const ext=path.extname(imgs[0].name).toLowerCase();
    const target=path.join(art,gameId+ext);
    if(cfg.copyLatestToArtwork!==false){
      try{fs.copyFileSync(imgs[0].full,target);processed++;}catch(e){}
    }
  }
  return {processed};
}


const SAVE_META_FILE=path.join(ROOT,(SETTINGS.saveStates&&SETTINGS.saveStates.metadataFile)||'config/save-states.json');
function saveMeta(){
  try{return JSON.parse(fs.readFileSync(SAVE_META_FILE,'utf8'));}catch(e){return {games:{}};}
}
function writeSaveMeta(data){fs.writeFileSync(SAVE_META_FILE,JSON.stringify(data,null,2));}
function stateDirFor(gameId){
  const base=path.join(ROOT,(SETTINGS.saveStates&&SETTINGS.saveStates.directory)||'states');
  const d=path.join(base,gameId);fs.mkdirSync(d,{recursive:true});return d;
}
function slotFile(gameId,slot){
  return path.join(stateDirFor(gameId),String(slot)+'.sta');
}
function touchStateMeta(gameId,slot,label=''){
  const m=saveMeta();m.games=m.games||{};m.games[gameId]=m.games[gameId]||{};
  const f=slotFile(gameId,slot);
  const exists=fs.existsSync(f);
  m.games[gameId][String(slot)]={slot:String(slot),label:label||String(slot),exists,updatedAt:exists?fs.statSync(f).mtime.toISOString():new Date().toISOString(),file:path.relative(ROOT,f).replaceAll('\\','/')};
  writeSaveMeta(m);
}
function scanStatesFor(gameId){
  const max=(SETTINGS.saveStates&&SETTINGS.saveStates.slots)||10;
  const slots=[];
  for(let i=0;i<max;i++){
    const f=slotFile(gameId,i);
    slots.push({slot:String(i),exists:fs.existsSync(f),updatedAt:fs.existsSync(f)?fs.statSync(f).mtime.toISOString():null,file:path.relative(ROOT,f).replaceAll('\\','/')});
  }
  const auto=slotFile(gameId,'auto');
  slots.push({slot:'auto',exists:fs.existsSync(auto),updatedAt:fs.existsSync(auto)?fs.statSync(auto).mtime.toISOString():null,file:path.relative(ROOT,auto).replaceAll('\\','/')});
  return slots;
}
function latestStateFor(gameId){
  return scanStatesFor(gameId).filter(x=>x.exists).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt))[0]||null;
}

function backupState(gameId,slot,reason='manual'){
  const src=slotFile(gameId,slot);
  if(!fs.existsSync(src)) return null;
  const dir=path.join(ROOT,(SETTINGS.saveStates&&SETTINGS.saveStates.backupDir)||'backups/states',gameId);
  fs.mkdirSync(dir,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const out=path.join(dir,`${slot}-${stamp}-${reason}.sta`);
  fs.copyFileSync(src,out);
  return path.relative(ROOT,out).replaceAll('\\','/');
}
function exportStates(gameId){
  const dir=path.join(ROOT,(SETTINGS.saveStates&&SETTINGS.saveStates.exportDir)||'exports');
  fs.mkdirSync(dir,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const out=path.join(dir,`${gameId}-states-${stamp}.json`);
  const slots=scanStatesFor(gameId).filter(x=>x.exists).map(x=>{
    const f=slotFile(gameId,x.slot);
    return {slot:x.slot,updatedAt:x.updatedAt,data:fs.readFileSync(f).toString('base64')};
  });
  fs.writeFileSync(out,JSON.stringify({format:'neo-arcade-state-export-v1',gameId,exportedAt:new Date().toISOString(),slots},null,2));
  return path.relative(ROOT,out).replaceAll('\\','/');
}
function importStates(payload){
  if(!payload||payload.format!=='neo-arcade-state-export-v1'||!payload.gameId||!Array.isArray(payload.slots)) throw new Error('Exportação inválida');
  for(const item of payload.slots){
    const f=slotFile(payload.gameId,item.slot);
    if(fs.existsSync(f) && SETTINGS.saveStates&&SETTINGS.saveStates.backupBeforeOverwrite) backupState(payload.gameId,item.slot,'pre-import');
    fs.writeFileSync(f,Buffer.from(item.data,'base64'));
    touchStateMeta(payload.gameId,item.slot,'Importado');
  }
  return payload.slots.length;
}
function stateIntegrity(gameId,slot){
  const f=slotFile(gameId,slot);
  if(!fs.existsSync(f)) return {exists:false,valid:false,size:0,reason:'missing'};
  const st=fs.statSync(f), min=(SETTINGS.saveStates&&SETTINGS.saveStates.minValidStateBytes)||128;
  return {exists:true,valid:st.size>=min,size:st.size,reason:st.size>=min?null:'too_small'};
}
function listBackups(gameId){
  const dir=path.join(ROOT,(SETTINGS.saveStates&&SETTINGS.saveStates.backupDir)||'backups/states',gameId);
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n=>n.endsWith('.sta')).map(n=>{
    const full=path.join(dir,n), st=fs.statSync(full);
    const slot=n.split('-')[0];
    return {name:n,slot,size:st.size,updatedAt:st.mtime.toISOString(),file:path.relative(ROOT,full).replaceAll('\\','/')};
  }).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
}
function pruneBackups(gameId){
  const keep=(SETTINGS.saveStates&&SETTINGS.saveStates.backupRetentionPerSlot)||5;
  const groups={}; for(const b of listBackups(gameId))(groups[b.slot]??=[]).push(b);
  let deleted=0;
  for(const arr of Object.values(groups)){
    arr.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
    for(const old of arr.slice(keep)){try{fs.unlinkSync(path.join(ROOT,old.file));deleted++;}catch(e){}}
  }
  return deleted;
}
function restoreBackup(gameId,backupFile){
  const full=path.normalize(path.join(ROOT,backupFile));
  const allowed=path.join(ROOT,(SETTINGS.saveStates&&SETTINGS.saveStates.backupDir)||'backups/states');
  if(!full.startsWith(allowed)||!fs.existsSync(full)) throw new Error('Backup inválido');
  const slot=path.basename(full).split('-')[0];
  const dest=slotFile(gameId,slot);
  if(fs.existsSync(dest)) backupState(gameId,slot,'pre-restore');
  fs.copyFileSync(full,dest); touchStateMeta(gameId,slot,'Restaurado'); pruneBackups(gameId);
  return {slot};
}


function keyCodeToMame(code){
  if(/^JOYCODE_/.test(code||'')) return code;
  const map={
    ArrowUp:'KEYCODE_UP',ArrowDown:'KEYCODE_DOWN',ArrowLeft:'KEYCODE_LEFT',ArrowRight:'KEYCODE_RIGHT',
    Escape:'KEYCODE_ESC',Enter:'KEYCODE_ENTER',Space:'KEYCODE_SPACE',
    Digit1:'KEYCODE_1',Digit2:'KEYCODE_2',Digit3:'KEYCODE_3',Digit4:'KEYCODE_4',Digit5:'KEYCODE_5',
    Digit6:'KEYCODE_6',Digit7:'KEYCODE_7',Digit8:'KEYCODE_8',Digit9:'KEYCODE_9',Digit0:'KEYCODE_0',
    F1:'KEYCODE_F1',F2:'KEYCODE_F2',F3:'KEYCODE_F3',F4:'KEYCODE_F4',F5:'KEYCODE_F5',F6:'KEYCODE_F6',
    F7:'KEYCODE_F7',F8:'KEYCODE_F8',F9:'KEYCODE_F9',F10:'KEYCODE_F10',F11:'KEYCODE_F11',F12:'KEYCODE_F12',
    ShiftLeft:'KEYCODE_LSHIFT',ShiftRight:'KEYCODE_RSHIFT',ControlLeft:'KEYCODE_LCONTROL',
    ControlRight:'KEYCODE_RCONTROL',AltLeft:'KEYCODE_LALT',AltRight:'KEYCODE_RALT',
    Backspace:'KEYCODE_BACKSPACE',Tab:'KEYCODE_TAB'
  };
  if(map[code]) return map[code];
  if(/^Key[A-Z]$/.test(code)) return 'KEYCODE_'+code.slice(3);
  return null;
}


function browserGamepadCodeToMame(deviceIndex, code){
  const joy=Math.max(1,Number(deviceIndex)+1);
  if(/^BUTTON_(\d+)$/.test(code||'')){
    const n=Number(code.match(/^BUTTON_(\d+)$/)[1])+1;
    return `JOYCODE_${joy}_BUTTON${n}`;
  }
  const am=(code||'').match(/^AXIS_(\d+)_(NEG|POS)$/);
  if(am){
    const axis=Number(am[1])+1;
    const dir=am[2]==='NEG'?'NEG':'POS';
    return `JOYCODE_${joy}_AXIS${axis}_${dir}_SWITCH`;
  }
  return null;
}

function mamePortType(player, action){
  const p=String(player);
  const map={
    coin:`COIN${p}`,start:`START${p}`,
    up:`P${p}_JOYSTICK_UP`,down:`P${p}_JOYSTICK_DOWN`,
    left:`P${p}_JOYSTICK_LEFT`,right:`P${p}_JOYSTICK_RIGHT`,
    b1:`P${p}_BUTTON1`,b2:`P${p}_BUTTON2`,b3:`P${p}_BUTTON3`,
    b4:`P${p}_BUTTON4`,b5:`P${p}_BUTTON5`,b6:`P${p}_BUTTON6`
  };
  return map[action]||null;
}

function xmlEsc(s){
  return String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}


function activeMappingForGame(gameId){
  const c=controls();
  const base=JSON.parse(JSON.stringify((c.profiles&&c.profiles['arcade-default']&&c.profiles['arcade-default'].players)||{}));
  const over=(c.gameOverrides&&c.gameOverrides[gameId])||{};
  for(const [p,m] of Object.entries(over)) base[p]={...(base[p]||{}),...m};
  return {
    players:base,
    hotkeys:c.hotkeys||SETTINGS.hotkeys||{},
    assignments:c.gamepadAssignments||{}
  };
}

function generateMameCfg(game){
  const mapping=activeMappingForGame(game.id);
  const ports=[];
  for(const [player,m] of Object.entries(mapping.players||{})){
    for(const [action,code] of Object.entries(m||{})){
      const type=mamePortType(player,action);
      let seq=keyCodeToMame(code);
      if(!seq){
        const assign=mapping.assignments&&mapping.assignments[player];
        if(assign && assign.deviceIndex!==undefined){
          seq=browserGamepadCodeToMame(assign.deviceIndex,code);
        }
      }
      if(!type||!seq) continue;
      ports.push(`      <port type="${xmlEsc(type)}"><newseq type="standard">${xmlEsc(seq)}</newseq></port>`);
    }
  }

  const hk=mapping.hotkeys||{};
  const hotPorts=[];
  const hotMap={
    pause:['UI_PAUSE',hk.pause],
    exit:['UI_CANCEL',hk.exit],
    saveState:['UI_SAVE_STATE',hk.saveState],
    loadState:['UI_LOAD_STATE',hk.loadState]
  };
  for(const [_,pair] of Object.entries(hotMap)){
    const [type,code]=pair;
    const seq=keyCodeToMame(code);
    if(seq) hotPorts.push(`      <port type="${xmlEsc(type)}"><newseq type="standard">${xmlEsc(seq)}</newseq></port>`);
  }

  const cfg=`<?xml version="1.0"?>
<mameconfig version="10">
  <system name="${xmlEsc(game.gameId)}">
    <input>
${[...ports,...hotPorts].join('\n')}
    </input>
  </system>
</mameconfig>
`;
  const dir=path.join(ROOT,(SETTINGS.mameConfig&&SETTINGS.mameConfig.cfgDir)||'config/mame-cfg');
  fs.mkdirSync(dir,{recursive:true});
  const out=path.join(dir,game.gameId+'.cfg');
  fs.writeFileSync(out,cfg);
  return out;
}


if (!fs.existsSync(USER_FILE)) {
  fs.writeFileSync(USER_FILE, JSON.stringify({favorites:[],recent:[],overrides:{},videoProfile:SETTINGS.defaultVideoProfile||'medium'}, null, 2));
}
function user(){ return JSON.parse(fs.readFileSync(USER_FILE,'utf8')); }
function saveUser(data){ fs.writeFileSync(USER_FILE, JSON.stringify(data,null,2)); }

const mime = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.bin':'application/octet-stream','.sfc':'application/octet-stream','.smc':'application/octet-stream','.nes':'application/octet-stream','.gba':'application/octet-stream','.zip':'application/zip'};

function send(res,code,data,type='application/json'){
  res.writeHead(code, {'Content-Type': type+'; charset=utf-8','Cache-Control':'no-store'});
  if (Buffer.isBuffer(data)) return res.end(data);
  res.end(type==='application/json' ? JSON.stringify(data) : data);
}

function walk(dir, out=[]){
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir,entry.name);
    if (entry.isDirectory()) walk(full,out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function sha1File(file){
  try{
    const data=fs.readFileSync(file);
    return crypto.createHash('sha1').update(data).digest('hex');
  }catch(e){ return null; }
}

// Minimal ZIP central-directory reader: no decompression required.
// Reads filename, CRC32, compressed/uncompressed size for each ZIP entry.
function inspectZip(file){
  const out={ok:false,entries:[],error:null,totalUncompressed:0};
  try{
    const b=fs.readFileSync(file);
    const min=Math.max(0,b.length-65557);
    let eocd=-1;
    for(let i=b.length-22;i>=min;i--){
      if(b[i]===0x50&&b[i+1]===0x4b&&b[i+2]===0x05&&b[i+3]===0x06){eocd=i;break;}
    }
    if(eocd<0) throw new Error('Diretório central ZIP não encontrado');
    const count=b.readUInt16LE(eocd+10);
    let off=b.readUInt32LE(eocd+16);
    for(let n=0;n<count && off+46<=b.length;n++){
      if(b.readUInt32LE(off)!==0x02014b50) break;
      const crc=b.readUInt32LE(off+16)>>>0;
      const comp=b.readUInt32LE(off+20);
      const uncomp=b.readUInt32LE(off+24);
      const nameLen=b.readUInt16LE(off+28);
      const extraLen=b.readUInt16LE(off+30);
      const commentLen=b.readUInt16LE(off+32);
      const name=b.subarray(off+46,off+46+nameLen).toString('utf8');
      if(name && !name.endsWith('/')){
        out.entries.push({
          name,
          crc32:crc.toString(16).padStart(8,'0'),
          compressedSize:comp,
          uncompressedSize:uncomp
        });
        out.totalUncompressed+=uncomp;
      }
      off += 46+nameLen+extraLen+commentLen;
    }
    out.ok=true;
  }catch(e){out.error=e.message;}
  return out;
}

function scanBios(){
  const files=walk(BIOS_ROOT);
  const names=new Set(files.map(f=>path.basename(f).toLowerCase()));
  const rules={};
  for(const [id,r] of Object.entries(BIOS_RULES)){
    const found=(r.acceptedFiles||[]).find(x=>names.has(x.toLowerCase()))||null;
    rules[id]={label:r.label,installed:Boolean(found),found};
  }
  return {
    files:files.map(f=>path.relative(BIOS_ROOT,f).replaceAll('\\','/')),
    rules
  };
}

function biosRequirementFor(game){
  for(const [id,r] of Object.entries(BIOS_RULES)){
    if((r.hardwareContains||[]).some(x=>(game.hardware||'').toLowerCase().includes(x.toLowerCase()))) return id;
  }
  return null;
}

function normalizedGameId(file){
  const ext = path.extname(file);
  return path.basename(file,ext).toLowerCase().trim();
}


function chooseCoreFromMeta(meta){
  const hw=(meta.hardware||'').toLowerCase();
  const prefs=((SETTINGS.coreRouting&&SETTINGS.coreRouting.preferFbneoHardware)||[]).map(x=>x.toLowerCase());
  if(prefs.some(x=>hw.includes(x))) return 'fbneo';
  return (SETTINGS.coreRouting&&SETTINGS.coreRouting.fallbackCore)||'mame';
}


const LIBCACHE_FILE=path.join(ROOT,(SETTINGS.libraryCache&&SETTINGS.libraryCache.file)||'database/library-cache.json');
function libraryCache(){try{return JSON.parse(fs.readFileSync(LIBCACHE_FILE,'utf8'));}catch(e){return {version:1,files:{}};}}
function saveLibraryCache(c){fs.mkdirSync(path.dirname(LIBCACHE_FILE),{recursive:true});fs.writeFileSync(LIBCACHE_FILE,JSON.stringify(c,null,2));}
function fileCacheKey(full){return path.relative(ROM_ROOT,full).replaceAll('\\','/').toLowerCase();}
function cachedAnalysis(cache,full,st){const key=fileCacheKey(full),item=cache.files&&cache.files[key];if(!item)return null;if(item.size!==st.size||item.mtimeMs!==st.mtimeMs)return null;return item;}
function updateCachedAnalysis(cache,full,st,data){cache.files=cache.files||{};cache.files[fileCacheKey(full)]={size:st.size,mtimeMs:st.mtimeMs,...data};}
function scanRoms(){
  const allowed = (SETTINGS.romExtensions || ['.zip','.7z','.chd']).map(x=>x.toLowerCase());
  const files = (SETTINGS.recursiveRomScan === false
    ? fs.readdirSync(ROM_ROOT,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>path.join(ROM_ROOT,x.name))
    : walk(ROM_ROOT))
    .filter(full=>allowed.includes(path.extname(full).toLowerCase()));

  const bios=scanBios();
  const mameIndex=loadMameIndex();
  const cache=libraryCache(); const seenCacheKeys=new Set(); let cacheHits=0,cacheMisses=0;
  const shaSeen=new Map();
  const idSeen=new Map();
  const out=[];

  for(const full of files){
    const st=fs.statSync(full);
    const ext=path.extname(full).toLowerCase();
    const short=normalizedGameId(full);
    const local=DB[short]||{};
    const mame=(mameIndex.games&&mameIndex.games[short])||null;

    const merged={
      title: local.title || (mame&&mame.description) || path.basename(full,ext),
      year: local.year || (mame&&mame.year) || null,
      manufacturer: local.manufacturer || (mame&&mame.manufacturer) || 'Desconhecido',
      hardware: local.hardware || (mame&&mame.hardware) || 'Desconhecido',
      genre: local.genre || 'Arcade',
      players: local.players || null,
      recommendedCore: local.recommendedCore || chooseCoreFromMeta(mame||local)
    };

    const rel=path.relative(ROM_ROOT,full).replaceAll('\\','/');
    const cached=(SETTINGS.libraryCache&&SETTINGS.libraryCache.enabled)?cachedAnalysis(cache,full,st):null;
    seenCacheKeys.add(fileCacheKey(full));
    let hash=null,zip=null;
    if(cached){cacheHits++;hash=cached.sha1||null;zip=cached.zip||null;}
    else{cacheMisses++;hash=SETTINGS.calculateSha1?sha1File(full):null;if(ext==='.zip'&&SETTINGS.deepZipInspection)zip=inspectZip(full);updateCachedAnalysis(cache,full,st,{sha1:hash,zip});}

    let duplicateOf=null;
    if(hash && shaSeen.has(hash)) duplicateOf=shaSeen.get(hash);
    else if(hash) shaSeen.set(hash,rel);

    const sibling=idSeen.get(short)||null;
    if(!sibling) idSeen.set(short,rel);

    const biosRule=biosRequirementFor({hardware:merged.hardware});
    const biosStatus=biosRule ? bios.rules[biosRule] : null;

    const issues=[];
    if(!local && !mame) issues.push({level:'info',code:'UNKNOWN_GAME',message:'Jogo não encontrado no banco local nem no índice MAME importado.'});
    if(mame && mame.isdevice) issues.push({level:'warn',code:'MAME_DEVICE',message:'Este arquivo corresponde a um dispositivo interno do MAME, não a um jogo comum.'});
    if(mame && mame.isbios) issues.push({level:'info',code:'MAME_BIOS',message:'Este romset é identificado pelo MAME como BIOS.'});
    if(mame && mame.runnable===false) issues.push({level:'warn',code:'NOT_RUNNABLE',message:'O MAME marca esta máquina como não executável diretamente.'});
    if(mame && mame.cloneof) issues.push({level:'info',code:'CLONE',message:`Clone de ${mame.cloneof}.`});
    if(mame && mame.romof && mame.romof!==mame.cloneof) issues.push({level:'info',code:'ROM_PARENT',message:`Depende do romset pai/BIOS: ${mame.romof}.`});
    if(ext==='.zip' && zip && !zip.ok) issues.push({level:'error',code:'BAD_ZIP',message:'ZIP não pôde ser inspecionado: '+zip.error});
    if(ext==='.zip' && zip && zip.ok && zip.entries.length===0) issues.push({level:'error',code:'EMPTY_ZIP',message:'ZIP não contém arquivos de ROM detectáveis.'});
    if(duplicateOf) issues.push({level:'warn',code:'DUPLICATE_SHA1',message:'Arquivo idêntico já existe em '+duplicateOf});
    if(!duplicateOf && sibling && sibling!==rel) issues.push({level:'warn',code:'SAME_SET_NAME',message:'Existe outro arquivo com o mesmo nome de romset em '+sibling});
    if(biosRule && biosStatus && !biosStatus.installed) issues.push({level:'warn',code:'BIOS_MISSING',message:`${biosStatus.label} não encontrada na pasta bios.`});

    const signature = SIGDB.games && SIGDB.games[short] ? SIGDB.games[short] : null;
    if(signature && zip && zip.ok && Array.isArray(signature.requiredCrcs)){
      const have=new Set(zip.entries.map(e=>e.crc32.toLowerCase()));
      const missing=signature.requiredCrcs.filter(c=>!have.has(String(c).toLowerCase()));
      if(missing.length) issues.push({level:'error',code:'CRC_MISSING',message:`Faltam ${missing.length} CRC(s) esperados para este romset.`});
    }

    // Check whether required MAME parent/BIOS set is present somewhere under roms or bios.
    if(mame && mame.romof){
      const parent=mame.romof.toLowerCase();
      const haveParent=files.some(f=>normalizedGameId(f)===parent) ||
        walk(BIOS_ROOT).some(f=>normalizedGameId(f)===parent);
      if(!haveParent) issues.push({level:'warn',code:'PARENT_MISSING',message:`Romset pai/BIOS "${mame.romof}" não encontrado em roms/ ou bios/.`});
    }

    out.push({
      id:rel.toLowerCase(),
      gameId:short,
      file:path.basename(full),
      relativePath:rel,
      folder:path.dirname(rel)==='.'?'':path.dirname(rel).replaceAll('\\','/'),
      title:merged.title,
      identified:Boolean(local||mame),
      identifiedBy:local?'local':mame?'mame':null,
      year:merged.year,
      manufacturer:merged.manufacturer,
      hardware:merged.hardware,
      genre:merged.genre,
      players:merged.players,
      recommendedCore:merged.recommendedCore,
      size:st.size,
      sha1:hash,
      zip,
      duplicate:Boolean(duplicateOf),
      duplicateOf,
      biosRule,
      biosStatus,
      mameMeta:mame,
      issues,
      health: issues.some(x=>x.level==='error')?'error':issues.some(x=>x.level==='warn')?'warn':'ok',
      artwork:findArtwork(short),
      latestState:latestStateFor(short)
    });
  }
  if(SETTINGS.libraryCache&&SETTINGS.libraryCache.enabled){
    for(const key of Object.keys(cache.files||{})) if(!seenCacheKeys.has(key)) delete cache.files[key];
    cache.lastScan={time:new Date().toISOString(),hits:cacheHits,misses:cacheMisses,total:out.length};
    saveLibraryCache(cache);
  }
  out.cacheStats={hits:cacheHits,misses:cacheMisses};
  return out.sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));
}

function resolveCore(game, requested='auto'){
  const u=user();
  if(requested&&requested!=='auto') return requested;
  if(u.overrides&&u.overrides[game.id]) return u.overrides[game.id];
  return game.recommendedCore||'mame';
}

function coreStatus(){
  const result={};
  for(const [id,c] of Object.entries(SETTINGS.cores)){
    const exe=path.join(ROOT,c.executable);
    result[id]={label:c.label,installed:fs.existsSync(exe),executable:c.executable};
  }
  return result;
}


function preflightGame(game,coreId){
  const issues=[];
  const c=SETTINGS.cores&&SETTINGS.cores[coreId];
  if(!c) issues.push({level:'error',code:'CORE_UNKNOWN',message:'Core desconhecido: '+coreId});
  else{
    const exe=path.join(ROOT,c.executable);
    if(!fs.existsSync(exe)) issues.push({level:'error',code:'CORE_MISSING',message:`Executável do core ${c.label} não encontrado.`});
  }
  const romPath=path.join(ROM_ROOT,game.relativePath);
  if(!fs.existsSync(romPath)) issues.push({level:'error',code:'ROM_MISSING',message:'Arquivo da ROM não existe mais.'});
  if(game.health==='error') issues.push({level:'error',code:'ROM_DIAGNOSTIC_ERROR',message:'A ROM possui erro crítico no diagnóstico.'});
  const fatal=issues.some(i=>i.level==='error');
  return {ok:!fatal,issues};
}
function coreCandidates(game,requestedCore){
  if(requestedCore&&requestedCore!=='auto') return [requestedCore];
  const order=[];
  const compat=gameCompat(game);
  const failed=new Set((compat.game&&compat.game.failedCores)||[]);
  if(compat.game&&compat.game.workingCore&&!failed.has(compat.game.workingCore)) order.push(compat.game.workingCore);
  if(compat.hardware&&compat.hardware.preferredCore&&!order.includes(compat.hardware.preferredCore)&&!failed.has(compat.hardware.preferredCore)) order.push(compat.hardware.preferredCore);
  const preferred=resolveCore(game,'auto');
  if(preferred&&!order.includes(preferred)&&!failed.has(preferred)) order.push(preferred);
  const fallback=(SETTINGS.launchRecovery&&SETTINGS.launchRecovery.fallbackOrder)||['fbneo','mame','mame2003plus'];
  for(const c of fallback) if(!order.includes(c)&&!failed.has(c)) order.push(c);
  for(const c of fallback) if(!order.includes(c)) order.push(c);
  return order;
}
function chooseLaunchCore(game,requestedCore){
  const attempts=[];
  for(const coreId of coreCandidates(game,requestedCore)){
    const pf=preflightGame(game,coreId);
    attempts.push({core:coreId,...pf});
    if(pf.ok) return {coreId,attempts};
  }
  return {coreId:null,attempts};
}

function launch(game,requestedCore,resumeSlot=null){
  logEvent('launch_requested',{gameId:game.id,title:game.title,requestedCore,resumeSlot});
  const recovery=SETTINGS.launchRecovery&&SETTINGS.launchRecovery.enabled!==false;
  const selected=recovery?chooseLaunchCore(game,requestedCore):{coreId:resolveCore(game,requestedCore),attempts:[]};
  const coreId=selected.coreId;
  if(!coreId){
    logEvent('launch_preflight_failed',{gameId:game.id,title:game.title,attempts:selected.attempts});
    const msg=selected.attempts.map(a=>`${a.core}: ${(a.issues||[]).map(i=>i.message).join(' ')}`).join(' | ');
    throw new Error('Nenhum core disponível passou na pré-checagem. '+msg);
  }
  const c=SETTINGS.cores[coreId];
  if(!c) throw new Error('Core desconhecido: '+coreId);
  if(requestedCore==='auto' && selected.attempts.length>1){
    logEvent('core_fallback',{gameId:game.id,title:game.title,selected:coreId,attempts:selected.attempts});
  }
  const exe=path.join(ROOT,c.executable);
  if(!fs.existsSync(exe)) throw new Error(`Core ${c.label} não instalado. Coloque o executável em ${c.executable}`);
  if(game.health==='error') throw new Error('Esta ROM possui erro crítico no diagnóstico. Abra os detalhes antes de iniciar.');

  const romPath=path.join(ROM_ROOT,game.relativePath);
  const ext=path.extname(game.file);
  const romName=path.basename(game.file,ext);
  const romDir=path.dirname(romPath);

  let generatedCfg=null;
  if(coreId==='mame' && SETTINGS.mameConfig && SETTINGS.mameConfig.autoGenerateBeforeLaunch){
    generatedCfg=generateMameCfg(game);
  }

  let args=(c.argsTemplate||[]).map(x=>x
    .replaceAll('{rom}',romPath)
    .replaceAll('{romName}',romName)
    .replaceAll('{romDir}',romDir)
  );

  if(coreId==='mame'){
    const cfgDir=path.join(ROOT,(SETTINGS.mameConfig&&SETTINGS.mameConfig.cfgDir)||'config/mame-cfg');
    args=[...args,'-cfg_directory',cfgDir];
  }

  if(coreId==='mame'){
    const ucfg=user();
    const vp=(SETTINGS.videoProfiles&&SETTINGS.videoProfiles[ucfg.videoProfile]) ||
      (SETTINGS.videoProfiles&&SETTINGS.videoProfiles[SETTINGS.defaultVideoProfile]) || null;
    if(vp&&Array.isArray(vp.mameArgs)) args=[...args,...vp.mameArgs];

    const rt=SETTINGS.mameRuntime||{};
    const stateDir=path.join(ROOT,rt.stateDirectory||'states');
    const snapDir=path.join(ROOT,rt.snapshotDirectory||'screenshots');
    fs.mkdirSync(stateDir,{recursive:true});
    fs.mkdirSync(snapDir,{recursive:true});
    args=[...args,'-state_directory',stateDir,'-snapshot_directory',snapDir];
    if(rt.skipGameInfo) args.push('-skip_gameinfo');
    if(rt.confirmQuit===false) args.push('-confirm_quit','0');
    if(SETTINGS.saveStates&&SETTINGS.saveStates.autoSaveOnExit) args.push('-autosave');
    if(SETTINGS.cabinetMode&&SETTINGS.cabinetMode.fullscreenMame) args.push('-window','0');
    if(resumeSlot!==null && resumeSlot!==undefined && resumeSlot!==''){
      args.push('-state',String(resumeSlot));
    }else if(SETTINGS.saveStates&&SETTINGS.saveStates.autoResume){
      const latest=latestStateFor(game.gameId);
      if(latest) args.push('-state',String(latest.slot));
    }
  }

  const child=spawn(exe,args,{cwd:path.dirname(exe),detached:false,stdio:'ignore'});
  activeGameProcess=child;
  activeGameInfo={id:game.id,title:game.title,core:coreId,startedAt:new Date().toISOString()};
  beginPlayStat(game,coreId);
  child.on('exit',()=>{
    if(activeGameInfo){
      endPlayStat(activeGameInfo.id,activeGameInfo.startedAt);
      try{touchStateMeta(game.gameId,'auto','Autosave');}catch(e){}
    }
    logEvent('launch_exited',{gameId:game.id,title:game.title,core:coreId});
    activeGameProcess=null;activeGameInfo=null;
  });

  const u=user();
  u.recent=[game.id,...(u.recent||[]).filter(x=>x!==game.id)].slice(0,30);
  saveUser(u);
  logEvent('launch_started',{gameId:game.id,title:game.title,core:coreId});
  return {ok:true,core:coreId,generatedCfg:generatedCfg?path.relative(ROOT,generatedCfg).replaceAll('\\','/'):null};
}


function normalizeText(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function buildLibraryFacets(games){
  const manufacturers={},hardware={},years={};
  for(const g of games){
    manufacturers[g.manufacturer]=(manufacturers[g.manufacturer]||0)+1;
    hardware[g.hardware]=(hardware[g.hardware]||0)+1;
    const y=String(g.year||'Desconhecido'); years[y]=(years[y]||0)+1;
  }
  const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,100).map(([value,count])=>({value,count}));
  return {manufacturers:top(manufacturers),hardware:top(hardware),years:top(years)};
}
function searchGames(games,q,filters={}){
  let out=games;
  const nq=normalizeText(q);
  if(nq) out=out.filter(g=>normalizeText([g.title,g.manufacturer,g.hardware,g.genre,g.relativePath,g.gameId].join(' ')).includes(nq));
  if(filters.hardware) out=out.filter(g=>g.hardware===filters.hardware);
  if(filters.manufacturer) out=out.filter(g=>g.manufacturer===filters.manufacturer);
  if(filters.year) out=out.filter(g=>String(g.year||'Desconhecido')===String(filters.year));
  return out;
}

function hubSafeTitle(file){return path.basename(file,path.extname(file)).replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().replace(/\b\w/g,c=>c.toUpperCase());}
function hubScanDir(system,dir,exts,urlPrefix){
  if(!fs.existsSync(dir))return[];const out=[];
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(!ent.isFile())continue;const ext=path.extname(ent.name).toLowerCase();if(!exts.includes(ext))continue;
    const full=path.join(dir,ent.name),st=fs.statSync(full),rel=encodeURIComponent(ent.name).replace(/%2F/gi,'/');
    out.push({id:`${system}:${ent.name.toLowerCase()}`,system,title:hubSafeTitle(ent.name),file:ent.name,url:`${urlPrefix}/${rel}`,size:st.size,modified:st.mtimeMs,cover:null});
  }return out;
}
function hubLibrary(){
  const games=[
    ...hubScanDir('nes',path.join(CORES_ROOT,'nes','roms'),['.nes','.fds','.nsf','.nsfe'],'/cores/nes/roms'),
    ...hubScanDir('snes',path.join(CORES_ROOT,'snes','games'),['.sfc','.smc','.fig'],'/cores/snes/games'),
    ...hubScanDir('gb',path.join(CORES_ROOT,'gb','roms'),['.gb','.gbc'],'/cores/gb/roms'),
    ...hubScanDir('gba',path.join(CORES_ROOT,'gba','roms'),['.gba'],'/cores/gba/roms'),
  ];
  try{for(const a of scanRoms())games.push({id:`arcade:${a.id}`,arcadeId:a.id,system:'arcade',title:a.title||hubSafeTitle(a.file),file:a.file,url:'/cores/arcade/app/index.html',size:a.size||0,modified:0,cover:a.artwork||findArtwork(a.id)||null});}catch{}
  const snesCover={"doom-1995.sfc":"/cores/snes/assets/covers/doom-1995.svg","final-fight.sfc":"/cores/snes/assets/covers/final-fight.svg","final-fight-3.sfc":"/cores/snes/assets/covers/final-fight-3.svg"};
  games.forEach(g=>{if(g.system==='snes'&&snesCover[g.file])g.cover=snesCover[g.file]});
  return games.sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));
}
function hubImportTarget(system,name){const clean=path.basename(String(name||'game')).replace(/[^a-zA-Z0-9._() \-]/g,'_');const map={nes:path.join(CORES_ROOT,'nes','roms'),snes:path.join(CORES_ROOT,'snes','games'),gb:path.join(CORES_ROOT,'gb','roms'),gba:path.join(CORES_ROOT,'gba','roms'),arcade:path.join(CORES_ROOT,'arcade','roms')};if(!map[system])throw new Error('Sistema inválido');fs.mkdirSync(map[system],{recursive:true});return path.join(map[system],clean)}

const server=http.createServer((req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host}`);

  if(url.pathname==='/api/hub-library') return send(res,200,{games:hubLibrary()});
  if(url.pathname==='/api/hub-import'&&req.method==='POST'){
    let body='';let total=0;req.on('data',d=>{total+=d.length;if(total<=140*1024*1024)body+=d});req.on('end',()=>{try{if(total>140*1024*1024)throw new Error('Arquivo excede o limite de importação');const payload=JSON.parse(body||'{}');const allowed={nes:['.nes','.fds','.nsf','.nsfe'],snes:['.sfc','.smc','.fig'],gb:['.gb','.gbc'],gba:['.gba'],arcade:['.zip','.7z','.chd','.rom']};const ext=path.extname(payload.name||'').toLowerCase();if(!allowed[payload.system]?.includes(ext))throw new Error('Extensão incompatível com o núcleo detectado');const target=hubImportTarget(payload.system,payload.name);fs.writeFileSync(target,Buffer.from(payload.data||'','base64'));return send(res,200,{ok:true,file:path.basename(target),system:payload.system});}catch(e){return send(res,400,{error:e.message})}});return;
  }


  if(url.pathname==='/api/library-page'){
    try{
      const games=scanRoms();
      const page=Math.max(1,Number(url.searchParams.get('page')||1));
      const pageSize=Math.min(Math.max(1,Number(url.searchParams.get('pageSize')||60)),200);
      const filtered=searchGames(games,url.searchParams.get('q')||'',{
        hardware:url.searchParams.get('hardware')||'',
        manufacturer:url.searchParams.get('manufacturer')||'',
        year:url.searchParams.get('year')||''
      });
      const start=(page-1)*pageSize;
      return send(res,200,{
        games:filtered.slice(start,start+pageSize),
        total:filtered.length,page,pageSize,pages:Math.max(1,Math.ceil(filtered.length/pageSize)),
        facets:buildLibraryFacets(games)
      });
    }catch(e){return send(res,500,{error:e.message});}
  }

  if(url.pathname==='/api/library'){
    organizeScreenshots();
    const games=scanRoms();
    const bios=scanBios();
    const mameIndex=loadMameIndex();
    const stats={
      total:games.length,
      identified:games.filter(x=>x.identified).length,
      unknown:games.filter(x=>!x.identified).length,
      duplicates:games.filter(x=>x.duplicate).length,
      folders:new Set(games.map(x=>x.folder).filter(Boolean)).size,
      healthy:games.filter(x=>x.health==='ok').length,
      warnings:games.filter(x=>x.health==='warn').length,
      errors:games.filter(x=>x.health==='error').length,
      mameIndexed:mameIndex.count||0,
      mameClones:mameIndex.cloneCount||0,
      mameBios:mameIndex.biosCount||0,
      cacheHits:(games.cacheStats&&games.cacheStats.hits)||0,
      cacheMisses:(games.cacheStats&&games.cacheStats.misses)||0
    };
    const ps=playStats();
    const withStats=games.map(g=>({game:g,stat:(ps.games&&ps.games[g.id])||{}}));
    const continueGames=withStats.filter(x=>x.stat.lastPlayed)
      .sort((a,b)=>new Date(b.stat.lastPlayed)-new Date(a.stat.lastPlayed))
      .slice(0,(SETTINGS.librarySections&&SETTINGS.librarySections.continueLimit)||8)
      .map(x=>x.game.id);
    const mostPlayed=withStats.filter(x=>(x.stat.totalSeconds||0)>0)
      .sort((a,b)=>(b.stat.totalSeconds||0)-(a.stat.totalSeconds||0))
      .slice(0,(SETTINGS.librarySections&&SETTINGS.librarySections.mostPlayedLimit)||10)
      .map(x=>x.game.id);
    const compat=compatibilityProfiles();
    return send(res,200,{games,stats,bios,playStats:ps,sections:{continueGames,mostPlayed},compatibility:compat,mameIndexInfo:{generatedAt:mameIndex.generatedAt,count:mameIndex.count||0,cloneCount:mameIndex.cloneCount||0,biosCount:mameIndex.biosCount||0},user:user(),cores:coreStatus(),settings:SETTINGS});
  }







  if(url.pathname==='/api/save-states'){
    const gameId=url.searchParams.get('gameId');
    if(!gameId)return send(res,400,{error:'gameId obrigatório'});
    const slots=scanStatesFor(gameId).map(s=>({...s,integrity:stateIntegrity(gameId,s.slot)})); return send(res,200,{gameId,slots,latest:latestStateFor(gameId),backups:listBackups(gameId)});
  }


  if(url.pathname==='/api/save-state/export'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      try{const {gameId}=JSON.parse(body||'{}');send(res,200,{ok:true,file:exportStates(gameId)});}
      catch(e){send(res,400,{error:e.message});}
    });return;
  }

  if(url.pathname==='/api/save-state/import'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      try{const payload=JSON.parse(body||'{}');send(res,200,{ok:true,imported:importStates(payload),gameId:payload.gameId});}
      catch(e){send(res,400,{error:e.message});}
    });return;
  }


  if(url.pathname==='/api/save-state/restore-backup'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{try{const {gameId,backupFile}=JSON.parse(body||'{}');send(res,200,{ok:true,...restoreBackup(gameId,backupFile)});}catch(e){send(res,400,{error:e.message});}});return;
  }
  if(url.pathname==='/api/save-state/delete'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      try{
        const {gameId,slot}=JSON.parse(body||'{}');
        if(!gameId||slot===undefined)throw new Error('Dados inválidos');
        const f=slotFile(gameId,slot);
        if(fs.existsSync(f) && SETTINGS.saveStates&&SETTINGS.saveStates.backupBeforeDelete) backupState(gameId,slot,'pre-delete');
        if(fs.existsSync(f))fs.unlinkSync(f); pruneBackups(gameId);
        touchStateMeta(gameId,slot);
        send(res,200,{ok:true,slots:scanStatesFor(gameId)});
      }catch(e){send(res,400,{error:e.message});}
    });return;
  }

  if(url.pathname==='/api/organize-screenshots'&&req.method==='POST'){
    try{
      const result=organizeScreenshots();
      return send(res,200,{ok:true,...result});
    }catch(e){return send(res,500,{error:e.message});}
  }

  if(url.pathname==='/api/video-profile'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      try{
        const {profile}=JSON.parse(body||'{}');
        if(!SETTINGS.videoProfiles||!SETTINGS.videoProfiles[profile]) throw new Error('Perfil gráfico inválido');
        const u=user();u.videoProfile=profile;saveUser(u);
        send(res,200,{ok:true,profile,videoProfiles:SETTINGS.videoProfiles});
      }catch(e){send(res,400,{error:e.message});}
    });return;
  }




  if(url.pathname==='/api/compatibility'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      try{
        const payload=JSON.parse(body||'{}');
        const c=compatibilityProfiles();c.games=c.games||{};
        const g=c.games[payload.gameId]||{};
        if(payload.action==='setWorkingCore') g.workingCore=payload.core;
        else if(payload.action==='clearFailedCore') g.failedCores=(g.failedCores||[]).filter(x=>x!==payload.core);
        else if(payload.action==='reset') delete c.games[payload.gameId];
        else throw new Error('Ação inválida');
        if(payload.action!=='reset') c.games[payload.gameId]=g;
        saveCompatibilityProfiles(c);
        send(res,200,{ok:true,compatibility:c.games[payload.gameId]||null});
      }catch(e){send(res,400,{error:e.message});}
    });return;
  }


  if(url.pathname==='/api/first-run'){
    return send(res,200,{state:firstRunState(),readiness:readiness()});
  }
  if(url.pathname==='/api/first-run/complete'&&req.method==='POST'){
    const st={completed:true,completedAt:new Date().toISOString()};
    saveFirstRunState(st);return send(res,200,{ok:true,state:st});
  }

  if(url.pathname==='/api/cache/clear'&&req.method==='POST'){
    try{saveLibraryCache({version:1,files:{}});return send(res,200,{ok:true});}catch(e){return send(res,500,{error:e.message});}
  }

  if(url.pathname==='/api/preflight'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      try{
        const {id,core='auto'}=JSON.parse(body||'{}');
        const g=scanRoms().find(x=>x.id===id);
        if(!g)return send(res,404,{error:'ROM não encontrada'});
        const result=chooseLaunchCore(g,core);
        send(res,200,{ok:Boolean(result.coreId),selectedCore:result.coreId,attempts:result.attempts});
      }catch(e){send(res,400,{error:e.message});}
    });return;
  }

  if(url.pathname==='/api/audit'){
    try{return send(res,200,buildAudit());}
    catch(e){return send(res,500,{error:e.message});}
  }

  if(url.pathname==='/api/log-tail'){
    try{
      if(!fs.existsSync(LOG_FILE))return send(res,200,{lines:[]});
      const lines=fs.readFileSync(LOG_FILE,'utf8').trim().split(/\r?\n/).filter(Boolean).slice(-100);
      return send(res,200,{lines});
    }catch(e){return send(res,500,{error:e.message});}
  }

  if(url.pathname==='/api/runtime'){
    return send(res,200,{
      running:Boolean(activeGameProcess),
      game:activeGameInfo,
      cabinetMode:SETTINGS.cabinetMode||{}
    });
  }

  if(url.pathname==='/api/cabinet'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      try{
        const {enabled}=JSON.parse(body||'{}');
        const cfgPath=path.join(ROOT,'config','settings.json');
        const current=JSON.parse(fs.readFileSync(cfgPath,'utf8'));
        current.cabinetMode=current.cabinetMode||{};
        current.cabinetMode.enabled=Boolean(enabled);
        fs.writeFileSync(cfgPath,JSON.stringify(current,null,2));
        SETTINGS.cabinetMode=current.cabinetMode;
        send(res,200,{ok:true,cabinetMode:current.cabinetMode});
      }catch(e){send(res,400,{error:e.message});}
    });return;
  }

  if(url.pathname==='/api/mame-config'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      try{
        const {gameId}=JSON.parse(body||'{}');
        const g=scanRoms().find(x=>x.id===gameId);
        if(!g) return send(res,404,{error:'Jogo não encontrado'});
        const out=generateMameCfg(g);
        send(res,200,{ok:true,file:path.relative(ROOT,out).replaceAll('\\','/')});
      }catch(e){send(res,400,{error:e.message});}
    });return;
  }

  if(url.pathname==='/api/controls'){
    return send(res,200,{controls:controls(),settings:SETTINGS.controls||{}});
  }

  if(url.pathname==='/api/controls/save'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      try{
        const payload=JSON.parse(body||'{}');
        const c=controls();
        if(payload.type==='profile'){
          if(!payload.id||!payload.profile) throw new Error('Perfil inválido');
          c.profiles[payload.id]=payload.profile;
        }else if(payload.type==='override'){
          if(!payload.gameId) throw new Error('Jogo inválido');
          c.gameOverrides[payload.gameId]=payload.mapping||{};
        }else if(payload.type==='deleteOverride'){
          delete c.gameOverrides[payload.gameId];
        }else if(payload.type==='gamepadAssignment'){
          c.gamepadAssignments=c.gamepadAssignments||{};
          c.gamepadAssignments[String(payload.player)]={deviceIndex:Number(payload.deviceIndex),deviceId:payload.deviceId||'',preset:payload.preset||null};
        }else if(payload.type==='hotkeys'){
          c.hotkeys={...(c.hotkeys||{}),...(payload.hotkeys||{})};
        }else{
          throw new Error('Tipo de operação desconhecido');
        }
        saveControls(c);
        send(res,200,{ok:true,controls:c});
      }catch(e){send(res,400,{error:e.message});}
    });return;
  }

  if(url.pathname==='/api/favorite'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      try{
        const {id}=JSON.parse(body||'{}');
        const u=user();const set=new Set(u.favorites||[]);
        set.has(id)?set.delete(id):set.add(id);u.favorites=[...set];saveUser(u);
        send(res,200,{ok:true,favorites:u.favorites});
      }catch(e){send(res,400,{error:e.message});}
    });return;
  }

  if(url.pathname==='/api/launch'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      try{
        const {id,core='auto',resumeSlot=null}=JSON.parse(body||'{}');
        const g=scanRoms().find(x=>x.id===id);
        if(!g)return send(res,404,{error:'ROM não encontrada'});
        send(res,200,launch(g,core,resumeSlot));
      }catch(e){send(res,400,{error:e.message});}
    });return;
  }


  if(url.pathname.startsWith('/cores/')){
    const rel=url.pathname.slice('/cores/'.length);
    const full=path.normalize(path.join(CORES_ROOT,rel));
    if(!full.startsWith(CORES_ROOT)) return send(res,403,'Forbidden','text/plain');
    if(!fs.existsSync(full)||fs.statSync(full).isDirectory()) return send(res,404,'Not found','text/plain');
    return send(res,200,fs.readFileSync(full),mime[path.extname(full)]||'application/octet-stream');
  }

  if(url.pathname==='/config/cores.json'){
    const full=path.join(HUB_ROOT,'config','cores.json');
    return send(res,200,fs.readFileSync(full),'application/json');
  }

  if(url.pathname.startsWith('/media/')){
    const rel=url.pathname.slice('/media/'.length);
    const full=path.normalize(path.join(ROOT,rel));
    if(!full.startsWith(ROOT)) return send(res,403,'Forbidden','text/plain');
    if(!fs.existsSync(full)||fs.statSync(full).isDirectory()) return send(res,404,'Not found','text/plain');
    return send(res,200,fs.readFileSync(full),mime[path.extname(full)]||'application/octet-stream');
  }

  let file=url.pathname==='/'?'/index.html':url.pathname;
  const full=path.normalize(path.join(APP,file));
  if(!full.startsWith(APP))return send(res,403,'Forbidden','text/plain');
  if(!fs.existsSync(full)||fs.statSync(full).isDirectory())return send(res,404,'Not found','text/plain');
  send(res,200,fs.readFileSync(full),mime[path.extname(full)]||'application/octet-stream');
});

server.listen(SETTINGS.port,'127.0.0.1',()=>{
  console.log('NEO MULTI v0.1.4');
  console.log(`Arcade backend: NEO ARCADE v${SETTINGS.version}`);
  console.log(`Biblioteca: ${ROM_ROOT}`);
  console.log(`Abra: http://127.0.0.1:${SETTINGS.port}`);
});
