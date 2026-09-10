import { NeoGBA } from "./emulator.js";
import { runMemorySelfTest } from "./utils/selftest.js";

const $ = (id) => document.getElementById(id);
const canvas = $("screen");
const logOutput = $("logOutput");
const overlay = $("screenOverlay");
const dropZone = $("dropZone");

function log(message) {
  const stamp = new Date().toLocaleTimeString("pt-BR");
  logOutput.textContent += `\n[${stamp}] ${message}`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

const gba = new NeoGBA(canvas, log);
for (const [name, ok] of runMemorySelfTest(gba.memory)) {
  log(`[SELFTEST] ${name}: ${ok ? "OK" : "FALHOU"}`);
}


function updateLibrary(info, file) {
  const items = gba.store.loadLibrary();
  const key = info.gameCode || info.title || file.name;
  const next = items.filter(x => x.key !== key);
  next.unshift({
    key,
    title: info.title || file.name,
    gameCode: info.gameCode || "",
    size: info.sizeBytes,
    lastPlayed: Date.now()
  });
  gba.store.saveLibrary(next.slice(0,12));
  renderLibrary();
}

function renderLibrary() {
  const el = $("libraryList");
  const q = ($("librarySearch")?.value || "").trim().toLowerCase();
  let items = gba.store.loadLibrary();
  if (q) items = items.filter(item =>
    (item.title || "").toLowerCase().includes(q) ||
    (item.gameCode || "").toLowerCase().includes(q)
  );
  items.sort((a,b)=>Number(!!b.favorite)-Number(!!a.favorite) || b.lastPlayed-a.lastPlayed);
  if (!items.length) { el.textContent = q ? "Nenhum jogo encontrado." : "Nenhuma ROM recente."; return; }

  el.innerHTML = items.map(item => {
    const when = new Date(item.lastPlayed).toLocaleString("pt-BR");
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #263246;padding:8px 0">
      <span><strong style="color:#f8fafc">${item.favorite ? "★ " : ""}${item.title}</strong>${item.gameCode ? ` · ${item.gameCode}` : ""}<br><small>${when}</small></span>
      <button data-favorite="${item.key}">${item.favorite ? "★" : "☆"}</button>
    </div>`;
  }).join("");

  el.querySelectorAll("[data-favorite]").forEach(btn => btn.addEventListener("click", () => {
    gba.store.toggleFavorite(btn.dataset.favorite);
    renderLibrary();
  }));
}
renderLibrary();

function humanSize(bytes) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

function updateInfo(info) {
  $("gameTitle").textContent = info.title || "Sem título";
  $("gameCode").textContent = info.gameCode || "—";
  $("makerCode").textContent = info.makerCode || "—";
  $("romSize").textContent = humanSize(info.sizeBytes);
  $("saveType").textContent = gba.saveMemory.type;
  $("saveStateBtn").disabled = false;
  $("loadStateBtn").disabled = false;
  $("exportSavBtn").disabled = false;
  $("screenshotBtn").disabled = false;
  $("quickSaveBtn").disabled = false;
  $("quickLoadBtn").disabled = false;
  $("checksumStatus").textContent = info.checksumValid
    ? `OK (${info.complement.toString(16).toUpperCase().padStart(2,"0")})`
    : `Inválido / diferente`;
  $("cpuMode").textContent = gba.cpu.thumb ? "THUMB" : "ARM";
  $("emuState").textContent = "ROM carregada";
  $("pcValue").textContent = `0x${gba.cpu.pc.toString(16).toUpperCase().padStart(8,"0")}`;
  $("cycleCount").textContent = gba.cpu.cycles.toLocaleString("pt-BR");
    $("cpuMode").textContent = gba.cpu.thumb ? "THUMB" : "ARM";
    $("vcountValue").textContent = gba.ppu.vcount;
    $("frameCount").textContent = gba.ppu.frame.toLocaleString("pt-BR");
    const vm = gba.memory.read16(0x04000000) & 7;
    $("videoMode").textContent = vm;
    $("affineState").textContent = (vm === 1 || vm === 2) ? "Ativo" : "—";
    const bm=(gba.memory.read16(0x04000050)>>>6)&3;
    $("blendState").textContent=["Off","Alpha","Clarear","Escurecer"][bm];
  $("statusText").textContent = info.title ? `Pronto: ${info.title}` : "ROM carregada";
  overlay.hidden = true;
  $("pauseBtn").disabled = false;
  $("resetBtn").disabled = false;
}

async function openROM(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".gba")) {
    log("Aviso: o arquivo não possui extensão .gba.");
  }
  try {
    $("statusText").textContent = "Carregando ROM...";
    const buffer = await file.arrayBuffer();
    const info = gba.loadROM(buffer);
    updateInfo(info);
    updateLibrary(info, file);
    try { await gba.saveROMToLibrary(file, info); } catch {}
    $("saveGameProfileBtn").disabled = false;
    applyCurrentProfile();
  } catch (err) {
    console.error(err);
    $("statusText").textContent = "Falha ao carregar ROM";
    log(`ERRO: ${err.message}`);
  }
}

$("romInput").addEventListener("change", async e => { await gba.apu.startAudio(); openROM(e.target.files[0]); });

$("pauseBtn").addEventListener("click", () => {
  const paused = gba.togglePause();
  $("pauseBtn").textContent = paused ? "Continuar" : "Pause";
  $("emuState").textContent = paused ? "Pausado" : "ROM carregada";
});

$("resetBtn").addEventListener("click", () => {
  gba.reset();
  $("pauseBtn").textContent = "Pause";
  $("emuState").textContent = "ROM carregada";
});

$("fullscreenBtn").addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await dropZone.requestFullscreen();
    else await document.exitFullscreen();
  } catch (err) {
    log(`Fullscreen indisponível: ${err.message}`);
  }
});

["dragenter","dragover"].forEach(type => dropZone.addEventListener(type, e => {
  e.preventDefault();
  dropZone.classList.add("dragover");
}));
["dragleave","drop"].forEach(type => dropZone.addEventListener(type, e => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
}));
dropZone.addEventListener("drop", e => openROM(e.dataTransfer.files[0]));

let frames = 0;
let last = performance.now();
function tick(now) {
  if (gba.running && !gba.paused) {
    gba.runCycles(6000);
    frames++;
    $("pcValue").textContent = `0x${gba.cpu.pc.toString(16).toUpperCase().padStart(8,"0")}`;
    $("cycleCount").textContent = gba.cpu.cycles.toLocaleString("pt-BR");
    $("cpuMode").textContent = gba.cpu.thumb ? "THUMB" : "ARM";
    $("vcountValue").textContent = gba.ppu.vcount;
    $("frameCount").textContent = gba.ppu.frame.toLocaleString("pt-BR");
    const vm = gba.memory.read16(0x04000000) & 7;
    $("videoMode").textContent = vm;
    $("affineState").textContent = (vm === 1 || vm === 2) ? "Ativo" : "—";
    const bm=(gba.memory.read16(0x04000050)>>>6)&3;
    $("blendState").textContent=["Off","Alpha","Clarear","Escurecer"][bm];
  }
  if (now - last >= 1000) {
    $("fpsText").textContent = `FPS: ${gba.running && !gba.paused ? frames : "--"}`;
    frames = 0;
    last = now;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);


let muted = false;
$("muteBtn").addEventListener("click", async () => {
  await gba.apu.startAudio();
  muted = !muted;
  gba.apu.setMuted(muted);
  $("muteBtn").textContent = muted ? "Ativar som" : "Mute";
});

$("volumeSlider").addEventListener("input", async e => {
  await gba.apu.startAudio();
  gba.apu.setVolume(Number(e.target.value)/100);
});


$("saveStateBtn").addEventListener("click", () => {
  const slot = Number($("stateSlot").value);
  if (gba.saveStateSlot(slot)) log(`Save State salvo no slot ${slot}.`);
});

$("loadStateBtn").addEventListener("click", () => {
  const slot = Number($("stateSlot").value);
  if (gba.loadStateSlot(slot)) log(`Save State ${slot} carregado.`);
  else log(`Nenhum Save State encontrado no slot ${slot}.`);
});

window.addEventListener("beforeunload", () => {
  try { gba.savePersistent(); } catch {}
});
setInterval(() => {
  try { if (gba.running) gba.savePersistent(); } catch {}
}, 10000);


$("exportSavBtn").addEventListener("click", () => {
  const blob = gba.exportSaveBlob();
  if (!blob) return;
  const a = document.createElement("a");
  const title = gba.cartridge?.header?.gameCode || gba.cartridge?.header?.title || "game";
  a.href = URL.createObjectURL(blob);
  a.download = `${title}.sav`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  log("Arquivo .sav exportado.");
});

$("importSavInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file || !gba.cartridge) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  gba.importSaveBytes(bytes);
  log(`Save importado: ${file.name}`);
  e.target.value = "";
});

$("screenshotBtn").addEventListener("click", () => {
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement("a");
    const name = gba.cartridge?.header?.gameCode || "neo-gba";
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-screenshot.png`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    log("Screenshot salvo.");
  }, "image/png");
});


$("librarySearch").addEventListener("input", renderLibrary);
$("clearLibrarySearch").addEventListener("click", () => {
  $("librarySearch").value = "";
  renderLibrary();
});

$("quickSaveBtn").addEventListener("click", async () => {
  if (await gba.quickSave()) log("Quick Save concluído.");
});

$("quickLoadBtn").addEventListener("click", async () => {
  if (await gba.quickLoad()) log("Quick Load concluído.");
  else log("Nenhum Quick Save encontrado.");
});

document.addEventListener("keydown", async e => {
  if (e.code === "F5") {
    e.preventDefault();
    if (await gba.quickSave()) log("Quick Save (F5).");
  } else if (e.code === "F8") {
    e.preventDefault();
    if (await gba.quickLoad()) log("Quick Load (F8).");
  } else if (e.code === "F11") {
    e.preventDefault();
    try {
      if (!document.fullscreenElement) await dropZone.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  } else if (e.code === "KeyM") {
    muted = !muted;
    gba.apu.setMuted(muted);
    $("muteBtn").textContent = muted ? "Ativar som" : "Mute";
  }
});

setInterval(async () => {
  try { if (gba.running) await gba.autosaveState(); } catch {}
}, 30000);


async function renderStoredROMs() {
  const el = $("libraryList");
  const items = await gba.getLibraryROMs().catch(()=>[]);
  if (!items.length) return;
  const current = gba.store.loadLibrary();
  const fav = new Map(current.map(x=>[x.key,!!x.favorite]));
  el.innerHTML = items.map(item => `
    <div style="display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #263246;padding:8px 0">
      <span><strong>${fav.get(item.key) ? "★ " : ""}${item.title}</strong>${item.gameCode ? ` · ${item.gameCode}` : ""}</span>
      <span>
        <button data-open="${item.key}">Abrir</button>
        <button data-remove="${item.key}">Remover</button>
      </span>
    </div>`).join("");
  el.querySelectorAll("[data-open]").forEach(b=>b.onclick=async()=>{const f=await gba.openLibraryROM(b.dataset.open); if(f) await openROM(f);});
  el.querySelectorAll("[data-remove]").forEach(b=>b.onclick=async()=>{await gba.removeLibraryROM(b.dataset.remove); await renderStoredROMs();});
}

function applyVideoSettings(filter, scale) {
  canvas.style.imageRendering = filter === "smooth" ? "auto" : "pixelated";
  if (scale === "auto") {
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  } else {
    const n = Number(scale);
    canvas.style.width = `${240*n}px`;
    canvas.style.height = `${160*n}px`;
    canvas.style.maxWidth = "100%";
    canvas.style.maxHeight = "100%";
  }
}

function applyCurrentProfile() {
  const p = gba.loadGameProfile();
  if (!p) return;
  if (p.videoFilter) $("videoFilter").value = p.videoFilter;
  if (p.integerScale) $("integerScale").value = p.integerScale;
  applyVideoSettings($("videoFilter").value,$("integerScale").value);
}

$("videoFilter").addEventListener("change",()=>applyVideoSettings($("videoFilter").value,$("integerScale").value));
$("integerScale").addEventListener("change",()=>applyVideoSettings($("videoFilter").value,$("integerScale").value));
$("saveGameProfileBtn").addEventListener("click",()=>{
  if (gba.saveGameProfile({videoFilter:$("videoFilter").value,integerScale:$("integerScale").value})) log("Perfil do jogo salvo.");
});

renderStoredROMs();
\nasync function neoMultiAutoLoad(){const p=new URLSearchParams(location.search),u=p.get('autoload');if(!u)return;try{const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error('ROM não encontrada');const blob=await r.blob();const name=p.get('game')||decodeURIComponent(u.split('/').pop()||'game.gba');const f=new File([blob],name.toLowerCase().endsWith('.gba')?name:name+'.gba',{type:'application/octet-stream'});await gba.apu.startAudio().catch(()=>{});await openROM(f)}catch(e){log(`AUTOLOAD ERRO: ${e.message}`)}}\nsetTimeout(neoMultiAutoLoad,180);\n