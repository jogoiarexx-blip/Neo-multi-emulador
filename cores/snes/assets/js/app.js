(() => {
  'use strict';

  const CDN_STABLE = 'https://cdn.emulatorjs.org/4.2.3/data/';
  const CDN_BSNES = 'https://cdn.emulatorjs.org/4.3.0-pre/data/';
  const LOCAL_STABLE_DATA = './vendor/emulatorjs/stable-4.2.3/data/';
  const LOCAL_BSNES_DATA = './vendor/emulatorjs/bsnes-4.3.0-pre/data/';
  const PREF_KEY = 'snes-nova:prefs:v1';
  const RECENT_KEY = 'snes-nova:recent:v1';
  const BENCH_KEY = 'snes-nova:benchmark:v1';
  const GAME_PROFILE_KEY = 'snes-nova:game-profiles:v1';
  let deferredInstallPrompt = null;
  let activeRomUrl = null;
  let activeRomName = null;
  let lastLibraryScrollY = 0;

  const $ = (s) => document.querySelector(s);
  const launcherView = $('#launcherView');
  const playerView = $('#playerView');
  const romInput = $('#romInput');
  const recentGames = $('#recentGames');
  const bundledGames = $('#bundledGames');
  const coreSelect = $('#coreSelect');
  const graphicsSelect = $('#graphicsSelect');
  const autoStartToggle = $('#autoStartToggle');
  const autoSaveToggle = $('#autoSaveToggle');
  const volumeRange = $('#volumeRange');
  const fpsToggle = $('#fpsToggle');
  const confirmExitToggle = $('#confirmExitToggle');
  const resolutionSelect = $('#resolutionSelect');
  const rendererSelect = $('#rendererSelect');
  const integerScaleToggle = $('#integerScaleToggle');
  const threadsToggle = $('#threadsToggle');
  const sharpToggle = $('#sharpToggle');
  const captureScaleSelect = $('#captureScaleSelect');
  const playerStage = $('#playerStage');
  const settingsDialog = $('#settingsDialog');
  const aspectSelect = $('#aspectSelect');
  const filterSelect = $('#filterSelect');
  const overscanToggle = $('#overscanToggle');
  const gameProfilesToggle = $('#gameProfilesToggle');
  const autoBenchmarkToggle = $('#autoBenchmarkToggle');
  const themeSelect = $('#themeSelect');
  const featuredRail = $('#featuredRail');
  const browsePreview = $('#browsePreview');
  const consoleNav = $('#consoleNav');
  const uiSoundToggle = $('#uiSoundToggle');
  const uiSoundVolumeRange = $('#uiSoundVolumeRange');
  const homeCoverWall = $('#homeCoverWall');
  const categoryGrid = $('#categoryGrid');

  const defaults = {
    core: 'auto',
    graphics: 'auto',
    autoStart: true,
    autoSave: true,
    volume: 0.7,
    fps: false,
    confirmExit: true,
    resolution: 'auto',
    renderer: 'auto',
    integerScale: true,
    threads: true,
    sharp: true,
    captureScale: 2,
    aspect: '4-3',
    filter: 'pixel',
    overscan: false,
    gameProfiles: true,
    autoBenchmark: true,
    theme: 'nova',
    uiSounds: true,
    uiSoundVolume: 0.35
  };

  function loadPrefs() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
    catch { return { ...defaults }; }
  }

  function savePrefs() {
    const prefs = {
      core: coreSelect.value,
      graphics: graphicsSelect.value,
      autoStart: autoStartToggle.checked,
      autoSave: autoSaveToggle.checked,
      volume: Number(volumeRange.value),
      fps: fpsToggle.checked,
      confirmExit: confirmExitToggle.checked,
      resolution: resolutionSelect.value,
      renderer: rendererSelect.value,
      integerScale: integerScaleToggle.checked,
      threads: threadsToggle.checked,
      sharp: sharpToggle.checked,
      captureScale: Number(captureScaleSelect.value),
      aspect: aspectSelect.value,
      filter: filterSelect.value,
      overscan: overscanToggle.checked,
      gameProfiles: gameProfilesToggle.checked,
      autoBenchmark: autoBenchmarkToggle.checked,
      theme: themeSelect?.value || 'nova',
      uiSounds: uiSoundToggle?.checked !== false,
      uiSoundVolume: Number(uiSoundVolumeRange?.value || 0.35)
    };
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    return prefs;
  }

  function applyPrefsToUi() {
    const p = loadPrefs();
    coreSelect.value = p.core;
    graphicsSelect.value = p.graphics;
    autoStartToggle.checked = p.autoStart;
    autoSaveToggle.checked = p.autoSave;
    volumeRange.value = p.volume;
    fpsToggle.checked = p.fps;
    confirmExitToggle.checked = p.confirmExit;
    resolutionSelect.value = p.resolution;
    rendererSelect.value = p.renderer;
    integerScaleToggle.checked = p.integerScale;
    threadsToggle.checked = p.threads;
    sharpToggle.checked = p.sharp;
    captureScaleSelect.value = String(p.captureScale || 2);
    aspectSelect.value = p.aspect || '4-3';
    filterSelect.value = p.filter || 'pixel';
    overscanToggle.checked = Boolean(p.overscan);
    gameProfilesToggle.checked = p.gameProfiles !== false;
    autoBenchmarkToggle.checked = p.autoBenchmark !== false;
    if (themeSelect) themeSelect.value = p.theme || 'nova';
    if (uiSoundToggle) uiSoundToggle.checked = p.uiSounds !== false;
    if (uiSoundVolumeRange) uiSoundVolumeRange.value = String(p.uiSoundVolume ?? 0.35);
    applyTheme(p.theme || 'nova');
  }

  function applyTheme(theme = 'nova') {
    const next = ['nova','aurora','sunset'].includes(theme) ? theme : 'nova';
    document.documentElement.setAttribute('data-theme', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'aurora' ? '#0b1024' : next === 'sunset' ? '#1a0e12' : '#0b1020');
    const btn = $('#themeQuickBtn');
    if (btn) btn.textContent = next === 'aurora' ? 'Tema: Aurora' : next === 'sunset' ? 'Tema: Sunset' : 'Tema: Nova';
  }

  function cycleTheme() {
    const order = ['nova', 'aurora', 'sunset'];
    const current = loadPrefs().theme || 'nova';
    const next = order[(order.indexOf(current) + 1) % order.length];
    if (themeSelect) themeSelect.value = next;
    const prefs = savePrefs();
    applyTheme(prefs.theme);
  }

  function revealShell() { document.body.classList.add('app-ready'); }

  function rememberLibraryScroll() { lastLibraryScrollY = window.scrollY || window.pageYOffset || 0; }

  function focusPlayerView() {
    if (!playerView || playerView.hidden) return;
    document.body.classList.add('session-active');
    requestAnimationFrame(() => playerView.focus?.({preventScroll:true}));
  }

  function restoreLibraryScroll() {
    document.body.classList.remove('session-active');
    requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, lastLibraryScrollY || 0), behavior: 'smooth' }));
  }

  let uiAudioContext = null;
  function ensureUiAudio() {
    if (uiAudioContext) return uiAudioContext;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    uiAudioContext = new Ctx();
    return uiAudioContext;
  }

  function playUiSound(type = 'tap') {
    const prefs = loadPrefs();
    if (prefs.uiSounds === false) return;
    const ctx = ensureUiAudio();
    if (!ctx) return;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch {}
    const now = ctx.currentTime + 0.001;
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    const tones = { hover: [520, 640, 0.012], tap: [640, 520, 0.03], confirm: [420, 760, 0.06] };
    const [start, end, duration] = tones[type] || tones.tap;
    const volume = Math.max(0, Math.min(1, Number(prefs.uiSoundVolume ?? 0.35))) * (type === 'hover' ? 0.35 : type === 'confirm' ? 0.6 : 0.45);
    osc.type = type === 'confirm' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(start, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, end), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function wireUiSounds() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, .primary-btn, .secondary-btn, .ghost-btn, .mini-btn, .play-bundled, .play-featured');
      if (target) playUiSound(target.classList.contains('primary-btn') ? 'confirm' : 'tap');
    }, true);
    document.addEventListener('pointerover', (e) => {
      const target = e.target.closest('.bundled-card, .featured-card, .smart-game-card, .top-game-card, .recent-card, .console-nav-btn');
      if (target) playUiSound('hover');
    }, true);
  }

  function setBrowseAtmosphere(id = 'default') {
    document.body.setAttribute('data-atmosphere', id || 'default');
  }

  function previewGameData(game) {
    if (!game) return null;
    return {
      id: game.atmosphere || game.id || game.hash || 'library',
      title: game.title || game.name || 'Jogo',
      subtitle: game.subtitle || game.region || 'Biblioteca local',
      cover: game.cover || game.image || '',
      badge: game.badge || game.chip || 'SNES',
      preferred: game.preferred || game.core || 'auto',
      size: game.size ? formatSize(game.size) : 'biblioteca local',
      note: game.featured || game.note || game.mapper || 'Pronto para jogar no SNES Nova.'
    };
  }

  function renderBrowsePreview(game) {
    if (!browsePreview) return;
    const g = previewGameData(game);
    if (!g) return;
    browsePreview.innerHTML = `
      <div class="browse-preview-media ${g.cover ? 'has-image' : ''}">${g.cover ? `<img src="${g.cover}" alt="${escapeHtml(g.title)}">` : `<div class="browse-preview-fallback"><span>${escapeHtml(g.badge)}</span><strong>${escapeHtml(g.title)}</strong></div>`}</div>
      <div class="browse-preview-copy">
        <span class="game-badge">${escapeHtml(g.badge)}</span>
        <h3>${escapeHtml(g.title)}</h3>
        <p>${escapeHtml(g.subtitle)}</p>
        <div class="preview-metrics">
          <div><small>Core</small><strong>${escapeHtml(String(g.preferred).toUpperCase())}</strong></div>
          <div><small>Tamanho</small><strong>${escapeHtml(g.size)}</strong></div>
          <div><small>Status</small><strong>Pronto</strong></div>
        </div>
        <p class="preview-note">${escapeHtml(g.note)}</p>
      </div>`;
    setBrowseAtmosphere(g.id);
  }

  function bindPreviewTarget(target, payload) {
    if (!target) return;
    const activate = () => renderBrowsePreview(payload);
    target.addEventListener('mouseenter', activate);
    target.addEventListener('focus', activate);
    target.addEventListener('touchstart', activate, { passive: true });
  }

  function setupConsoleNav() {
    if (!consoleNav) return;
    consoleNav.querySelectorAll('.console-nav-btn').forEach(btn => btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      consoleNav.querySelectorAll('.console-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }));
  }

  function getBenchmark() {
    try { return JSON.parse(localStorage.getItem(BENCH_KEY) || 'null'); } catch { return null; }
  }

  function getGameProfiles() {
    try { return JSON.parse(localStorage.getItem(GAME_PROFILE_KEY) || '{}'); } catch { return {}; }
  }

  function saveGameProfile(key, profile) {
    const all = getGameProfiles();
    all[key] = { ...(all[key] || {}), ...profile, updatedAt: Date.now() };
    localStorage.setItem(GAME_PROFILE_KEY, JSON.stringify(all));
  }

  function makeGameProfileKey(file, romInfo, bundledGame) {
    const header = romInfo?.header;
    return bundledGame?.id || `${(header?.title || safeTitle(file.name)).toLowerCase()}|${file.size}|${header?.checksum || 0}`;
  }

  async function runDeviceBenchmark(force = false) {
    const cached = getBenchmark();
    if (cached && !force && Date.now() - cached.at < 14 * 86400000) return cached;
    const start = performance.now();
    let x = 0x12345678;
    let ops = 0;
    const duration = 130;
    while (performance.now() - start < duration) {
      for (let i = 0; i < 2500; i++) {
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x = x >>> 0; ops++;
      }
    }
    const elapsed = Math.max(1, performance.now() - start);
    const mops = ops / elapsed / 1000;
    const caps = detectGraphicsCapabilities();
    const hw = hardwareProfile();
    let tier = 'medium';
    let score = mops + (caps.webgl2 ? 8 : 0) + (hw.cores >= 8 ? 5 : hw.cores >= 4 ? 2 : 0);
    if (score < 25) tier = 'low';
    else if (score > 55) tier = 'high';
    const result = { at: Date.now(), mops: Number(mops.toFixed(1)), score: Number(score.toFixed(1)), tier };
    localStorage.setItem(BENCH_KEY, JSON.stringify(result));
    updateBenchmarkStatus(result);
    return result;
  }

  function updateBenchmarkStatus(result = getBenchmark()) {
    const el = $('#benchmarkStatus');
    if (!el) return;
    if (!result) { el.textContent = 'Ainda não executado'; return; }
    const label = result.tier === 'high' ? 'Forte' : result.tier === 'low' ? 'Leve' : 'Médio';
    el.textContent = `${label} • ${result.score} pts`;
  }

  async function detectRuntimeSource(core = 'snes9x') {
    const out = $('#runtimeSource');
    const build = window.SNESNova?.engine?.recommendedBuild?.(core) || 'standard';
    const customPath = `./vendor/custom-cores/${core}/${build}/data/`;
    try { const cr = await fetch(`${customPath}loader.js`, { method:'HEAD', cache:'no-store' }); if (cr.ok) { if(out) out.textContent = `Local • ${core} custom ${build}`; return {source:'custom',dataPath:customPath,build}; } } catch {}
    const localPath = core === 'bsnes' ? LOCAL_BSNES_DATA : LOCAL_STABLE_DATA;
    try {
      const r = await fetch(`${localPath}loader.js`, { method: 'HEAD', cache: 'no-store' });
      if (r.ok) {
        if (out) out.textContent = core === 'bsnes' ? 'Local • bsnes' : 'Local • Snes9x 4.2.3';
        return { source: 'local', dataPath: localPath };
      }
    } catch {}
    const cdnPath = core === 'bsnes' ? CDN_BSNES : CDN_STABLE;
    if (out) out.textContent = core === 'bsnes' ? 'CDN bsnes • fallback' : 'CDN Snes9x • fallback';
    return { source: 'cdn', dataPath: cdnPath };
  }

  function detectGraphicsCapabilities() {
    const probe = document.createElement('canvas');
    let gl2 = null, gl = null, renderer = '';
    try { gl2 = probe.getContext('webgl2', { powerPreference: 'high-performance' }); } catch {}
    try { gl = gl2 || probe.getContext('webgl', { powerPreference: 'high-performance' }) || probe.getContext('experimental-webgl'); } catch {}
    if (gl) {
      try {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      } catch { renderer = 'GPU disponível'; }
    }
    const canThreads = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated === true;
    return {
      webgl: !!gl,
      webgl2: !!gl2,
      renderer: renderer || (gl ? 'GPU disponível' : 'Renderização por software/indisponível'),
      canThreads,
      dpr: Math.max(1, Number(window.devicePixelRatio || 1)),
      width: screen.width || innerWidth,
      height: screen.height || innerHeight
    };
  }

  function updateHardwarePanel() {
    const caps = detectGraphicsCapabilities();
    const gpu = $('#gpuName');
    const webgl = $('#webglStatus');
    const threads = $('#threadsStatus');
    const display = $('#displayStatus');
    const advice = $('#hardwareAdvice');
    if (gpu) gpu.textContent = caps.renderer;
    if (webgl) webgl.textContent = caps.webgl2 ? 'WebGL2 • aceleração GPU' : (caps.webgl ? 'WebGL1 • compatibilidade' : 'Sem WebGL');
    if (threads) threads.textContent = caps.canThreads ? 'Disponíveis' : 'Indisponíveis neste host';
    if (display) display.textContent = `${caps.width}×${caps.height} • DPR ${caps.dpr.toFixed(1)}`;
    if (advice) {
      advice.className = 'hardware-advice ' + (caps.webgl2 ? 'good' : 'warn');
      advice.textContent = caps.webgl2
        ? `Aceleração gráfica ativa. ${caps.canThreads ? 'Threads WebAssembly também podem ser usadas.' : 'Para threads do core, o host precisa COOP/COEP e SharedArrayBuffer.'}`
        : 'WebGL2 não foi detectado. O emulador usará o modo compatível quando necessário.';
    }
    return caps;
  }

  function resolveGraphicsProfile(requested, caps) {
    if (requested !== 'auto') return requested;
    const hw = hardwareProfile();
    const bench = getBenchmark();
    if (hw.weak || !caps.webgl2 || bench?.tier === 'low') return 'performance';
    if (caps.dpr >= 1.5 && (hw.strong || bench?.tier === 'high')) return 'quality';
    return 'balanced';
  }

  function applyDisplayScale(value, sharp = true, profile = 'balanced') {
    if (!playerStage) return;
    ['scale-native','scale-2','scale-3','scale-4','scale-fit','pixel-perfect','smooth'].forEach(c => playerStage.classList.remove(c));
    const resolved = value === 'auto' ? 'fit' : value;
    playerStage.classList.add(resolved === 'native' ? 'scale-native' : `scale-${resolved}`);
    const pixel = sharp || profile === 'pixel' || profile === 'performance';
    playerStage.classList.add(pixel ? 'pixel-perfect' : 'smooth');
    document.querySelectorAll('.mini-btn[data-scale]').forEach(btn => btn.classList.toggle('active', btn.dataset.scale === resolved));
    const status = $('#runtimeVideoStatus');
    if (status) status.textContent = `${resolved === 'fit' ? 'Ajustado à tela' : resolved === 'native' ? '1× nativo' : resolved + '×'} • ${pixel ? 'Pixel Perfect' : 'Suavizado'}`;
  }


  function applyVideoPresentation(prefs, profile) {
    if (!playerStage) return;
    ['aspect-4-3','aspect-8-7','aspect-stretch','filter-pixel','filter-crt','filter-smooth','filter-vivid','overscan-crop']
      .forEach(c => playerStage.classList.remove(c));
    playerStage.classList.add(`aspect-${prefs.aspect || '4-3'}`);
    const filter = prefs.filter || (profile === 'crt' ? 'crt' : profile === 'quality' ? 'vivid' : 'pixel');
    playerStage.classList.add(`filter-${filter}`);
    if (prefs.overscan) playerStage.classList.add('overscan-crop');
    const status = $('#runtimeVideoStatus');
    if (status) {
      const aspectLabel = prefs.aspect === '8-7' ? '8:7 pixels' : prefs.aspect === 'stretch' ? 'Esticado' : '4:3 TV';
      status.dataset.presentation = `${aspectLabel} • ${filter.toUpperCase()}${prefs.overscan ? ' • overscan' : ''}`;
    }
  }


  const BUNDLED_GAMES = [
    { id: 'doom-1995', title: 'Doom', subtitle: 'Williams • 1995', file: './games/doom-1995.sfc', size: 2097152, badge: 'Super FX', preferred: 'bsnes', cover: './assets/covers/doom-1995.svg', featured: 'Precisão com chip especial e clima clássico.' },
    { id: 'final-fight', title: 'Final Fight', subtitle: 'Capcom', file: './games/final-fight.sfc', size: 1048576, badge: 'Beat em up', preferred: 'snes9x', cover: './assets/covers/final-fight.svg', featured: 'Beat em up lendário pronto para jogar.' },
    { id: 'final-fight-3', title: 'Final Fight 3', subtitle: 'Capcom • 1995', file: './games/final-fight-3.sfc', size: 3145728, badge: 'Beat em up', preferred: 'snes9x', cover: './assets/covers/final-fight-3.svg', featured: 'Visual renovado e ação perfeita no mobile.' }
  ];

  const ACCURACY_GAME_HINTS = [
    /super\s*mario\s*rpg/i,
    /kirby.*super\s*star/i,
    /kirby.*dream\s*land\s*3/i,
    /star\s*fox/i,
    /starwing/i,
    /yoshi.*island/i,
    /doom/i,
    /mega\s*man\s*x[23]/i,
    /rockman\s*x[23]/i,
    /street\s*fighter\s*alpha\s*2/i,
    /street\s*fighter\s*zero\s*2/i,
    /tengai\s*makyou\s*zero/i,
    /far\s*east\s*of\s*eden\s*zero/i,
    /pilotwings/i
  ];

  function hardwareProfile() {
    const cores = Number(navigator.hardwareConcurrency || 2);
    const memory = Number(navigator.deviceMemory || 0);
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    let score = 0;
    if (cores >= 8) score += 2;
    else if (cores >= 4) score += 1;
    else score -= 1;
    if (memory >= 8) score += 2;
    else if (memory >= 4) score += 1;
    else if (memory > 0 && memory <= 2) score -= 2;
    if (mobile) score -= 1;
    return { cores, memory, mobile, score, strong: score >= 2, weak: score <= -1 };
  }

  function cleanRomTitle(bytes) {
    return new TextDecoder('ascii').decode(bytes)
      .replace(/[\x00-\x1f\x7f-\xff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function readHeader(bytes, base) {
    if (!bytes || bytes.length < base + 0x20) return null;
    const title = cleanRomTitle(bytes.slice(base, base + 21));
    const mapMode = bytes[base + 0x15];
    const romType = bytes[base + 0x16];
    const romSize = bytes[base + 0x17];
    const sramSize = bytes[base + 0x18];
    const region = bytes[base + 0x19];
    const complement = bytes[base + 0x1c] | (bytes[base + 0x1d] << 8);
    const checksum = bytes[base + 0x1e] | (bytes[base + 0x1f] << 8);
    const checksumLooksValid = ((checksum ^ complement) & 0xffff) === 0xffff;
    const printableTitle = title.length >= 3;
    const score = (checksumLooksValid ? 4 : 0) + (printableTitle ? 2 : 0) + ((mapMode & 0x20) ? 1 : 0);
    return { title, mapMode, romType, romSize, sramSize, region, checksumLooksValid, score, base };
  }

  async function inspectRom(file) {
    const info = { filename: safeTitle(file.name), header: null, zipped: /\.zip$/i.test(file.name), size: file.size };
    if (info.zipped) return info;
    try {
      if (window.SNESNova?.romAnalyzer) {
        const a = await window.SNESNova.romAnalyzer.analyzeFile(file);
        info.analysis = a;
        info.header = { title:a.title, mapMode:parseInt(a.mapMode,16)||0, romType:parseInt(a.cartridgeType,16)||0, region:a.region, score:99 };
        info.hasCopierHeader = a.copierHeader;
        info.crc32 = a.crc32; info.sha1 = a.sha1; info.chip = a.chip; info.mapper = a.mapper; info.sramSize = a.sramSize;
        return info;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const copierOffset = (bytes.length % 0x8000 === 512) ? 512 : 0;
      const candidates = [0x7fc0, 0xffc0, 0x40ffc0].map(x => readHeader(bytes, x + copierOffset)).filter(Boolean).sort((a,b) => b.score - a.score);
      info.header = candidates[0] || null; info.hasCopierHeader = copierOffset === 512;
    } catch {}
    return info;
  }

  function chooseSmartCore(file, romInfo, learnedProfile = null) {
    const hw = hardwareProfile();
    const bench = getBenchmark();
    const combinedName = `${romInfo.filename} ${romInfo.header?.title || ''}`;
    const accuracyHint = ACCURACY_GAME_HINTS.some(rx => rx.test(combinedName));
    const reasons = [];

    if (learnedProfile?.core && ['snes9x','bsnes'].includes(learnedProfile.core)) {
      if (learnedProfile.core === 'bsnes' && (hw.weak || bench?.tier === 'low')) {
        reasons.push('perfil salvo pedia bsnes, mas o benchmark atual priorizou desempenho');
      } else {
        reasons.push('perfil aprendido anteriormente para este jogo');
        return { core: learnedProfile.core, reasons, hw, accuracyHint, learned: true };
      }
    }

    if (hw.weak || bench?.tier === 'low') {
      reasons.push('hardware/benchmark mais limitado detectado');
      if (accuracyHint) reasons.push('jogo sensível à precisão, mas desempenho foi priorizado');
      return { core: 'snes9x', reasons, hw, accuracyHint };
    }

    if (accuracyHint && (hw.strong || bench?.tier === 'high')) {
      reasons.push('jogo/chip conhecido por se beneficiar de maior precisão');
      reasons.push('benchmark/hardware suficiente para bsnes');
      return { core: 'bsnes', reasons, hw, accuracyHint };
    }

    reasons.push('jogo não exige precisão extra conhecida');
    reasons.push('Snes9x oferece melhor eficiência para este caso');
    if (romInfo.zipped) reasons.push('ROM compactada: identificação interna limitada antes do carregamento');
    return { core: 'snes9x', reasons, hw, accuracyHint };
  }

  function describeHardware(hw) {
    const ram = hw.memory ? `${hw.memory} GB RAM estimada` : 'RAM não informada pelo navegador';
    return `${hw.cores} threads • ${ram}`;
  }

  function renderCoreDecision(decision, requestedCore, romInfo) {
    const el = $('#coreDecision');
    if (!el) return;
    const chosenName = decision.core === 'bsnes' ? 'bsnes' : 'Snes9x';
    const mode = requestedCore === 'auto' ? 'Seleção automática' : 'Seleção manual';
    const romTitle = romInfo.header?.title ? ` • ROM: ${escapeHtml(romInfo.header.title)}` : '';
    el.hidden = false;
    el.innerHTML = `<strong>${mode}: ${chosenName}</strong><span>${escapeHtml(decision.reasons.join(' • '))}</span><small>${escapeHtml(describeHardware(decision.hw))}${romTitle}</small>`;
  }

  function safeTitle(name) {
    return name.replace(/\.(sfc|smc|fig|zip)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Jogo SNES';
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h >>> 0) || 1;
  }

  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
    catch { return []; }
  }

  function addRecent(file) {
    const list = getRecent().filter(x => x.name !== file.name);
    list.unshift({ name: file.name, title: safeTitle(file.name), size: file.size, lastPlayed: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
    renderRecent();
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function renderHomeShowcase() {
    if (!homeCoverWall) return;
    homeCoverWall.innerHTML = BUNDLED_GAMES.map((g, index) => `
      <article class="home-cover-card" tabindex="0" data-id="${g.id}">
        <img src="${g.cover || ''}" alt="${escapeHtml(g.title)}" loading="lazy">
        <div class="home-cover-overlay">
          <span>${escapeHtml(g.badge)}</span>
          <h3>${escapeHtml(g.title)}</h3>
          <p>${escapeHtml(g.subtitle)}</p>
          <button class="primary-btn home-play-btn" data-id="${g.id}">Jogar agora</button>
        </div>
      </article>`).join('');
    homeCoverWall.querySelectorAll('.home-play-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); bootBundledGame(btn.dataset.id); }));
    homeCoverWall.querySelectorAll('.home-cover-card').forEach(card => {
      const g = BUNDLED_GAMES.find(x => x.id === card.dataset.id);
      bindPreviewTarget(card, g);
      card.addEventListener('dblclick', () => bootBundledGame(card.dataset.id));
    });
  }

  function setupCategories() {
    if (!categoryGrid) return;
    categoryGrid.querySelectorAll('.category-card').forEach(btn => btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      categoryGrid.querySelectorAll('.category-card').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      if (cat === 'installed') document.getElementById('bundledSection')?.scrollIntoView({behavior:'smooth',block:'start'});
      else if (cat === 'favorites') { const sort = document.getElementById('librarySort'); if (sort) { sort.value='favorite'; sort.dispatchEvent(new Event('change')); } document.getElementById('smartLibrarySection')?.scrollIntoView({behavior:'smooth',block:'start'}); }
      else if (cat === 'beat') { document.querySelectorAll('.bundled-card').forEach(c => c.hidden = !['final-fight','final-fight-3'].includes(c.dataset.id)); document.getElementById('bundledSection')?.scrollIntoView({behavior:'smooth',block:'start'}); setTimeout(()=>document.querySelectorAll('.bundled-card').forEach(c=>c.hidden=false),7000); }
      else if (cat === 'special') { document.querySelectorAll('.bundled-card').forEach(c => c.hidden = c.dataset.id !== 'doom-1995'); document.getElementById('bundledSection')?.scrollIntoView({behavior:'smooth',block:'start'}); setTimeout(()=>document.querySelectorAll('.bundled-card').forEach(c=>c.hidden=false),7000); }
      else if (cat === 'top') document.getElementById('topGamesSection')?.scrollIntoView({behavior:'smooth',block:'start'});
      playUiSound('confirm');
    }));
  }

  function renderFeatured() {
    if (!featuredRail) return;
    featuredRail.innerHTML = BUNDLED_GAMES.map((g) => `
      <article class="featured-card" data-id="${g.id}">
        <div class="featured-cover">${g.cover ? `<img src="${g.cover}" alt="${escapeHtml(g.title)}" loading="lazy">` : ''}</div>
        <div class="featured-overlay">
          <span class="featured-tag">${escapeHtml(g.badge)}</span>
          <h3>${escapeHtml(g.title)}</h3>
          <p>${escapeHtml(g.featured || g.subtitle)}</p>
          <div class="featured-actions">
            <button class="primary-btn play-featured" data-id="${g.id}">Jogar</button>
            <button class="ghost-btn go-bundled" data-target="${g.id}">Ver biblioteca</button>
          </div>
        </div>
      </article>`).join('');
    featuredRail.querySelectorAll('.play-featured').forEach(btn => btn.addEventListener('click', () => bootBundledGame(btn.dataset.id)));
    featuredRail.querySelectorAll('.featured-card').forEach(card => {
      const game = BUNDLED_GAMES.find(g => g.id === card.dataset.id);
      bindPreviewTarget(card, game);
    });
    featuredRail.querySelectorAll('.go-bundled').forEach(btn => btn.addEventListener('click', () => {
      const card = bundledGames?.querySelector(`[data-id="${btn.dataset.target}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.classList.add('spotlight');
      setTimeout(() => card?.classList.remove('spotlight'), 1300);
    }));
  }

  function renderBundled() {
    if (!bundledGames) return;
    bundledGames.innerHTML = BUNDLED_GAMES.map((g, i) => `
      <article class="bundled-card" tabindex="0" data-id="${g.id}">
        <div class="bundled-cover cover-${g.id}">${g.cover ? `<img src="${g.cover}" alt="${escapeHtml(g.title)}" loading="lazy">` : `<span>SNES</span><strong>${escapeHtml(g.title)}</strong>`}</div>
        <div class="bundled-meta">
          <span class="game-badge">${escapeHtml(g.badge)}</span>
          <h3>${escapeHtml(g.title)}</h3>
          <p>${escapeHtml(g.subtitle)}</p>
          <small>${formatSize(g.size)} • instalado</small>
          <button class="primary-btn play-bundled" data-id="${g.id}">Jogar agora</button>
        </div>
      </article>`).join('');
    bundledGames.querySelectorAll('.play-bundled').forEach(btn => btn.addEventListener('click', () => bootBundledGame(btn.dataset.id)));
    bundledGames.querySelectorAll('.bundled-card').forEach(card => {
      const game = BUNDLED_GAMES.find(g => g.id === card.dataset.id);
      bindPreviewTarget(card, game);
    });
  }

  function appBaseUrl() {
    // Works at a user root (user.github.io/) and at a project subpath (user.github.io/repo/).
    return new URL('./', document.baseURI || window.location.href);
  }

  async function fetchBundledGame(game) {
    const candidates = [];
    const add = (u) => { if (u && !candidates.includes(u)) candidates.push(u); };
    add(new URL(game.file.replace(/^\.\//,''), appBaseUrl()).href);
    // Fallback for hosts that rewrite index.html but keep the app under the current pathname.
    try { add(new URL(game.file, window.location.href).href); } catch {}
    let lastError = null;
    for (const url of candidates) {
      try {
        const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) { lastError = new Error(`ROM HTTP ${response.status} em ${url}`); continue; }
        const blob = await response.blob();
        if (!blob.size) { lastError = new Error(`ROM vazia em ${url}`); continue; }
        return { blob, url };
      } catch (err) { lastError = err; }
    }
    throw lastError || new Error('A ROM instalada não pôde ser localizada.');
  }

  async function bootBundledGame(id) {
    const game = BUNDLED_GAMES.find(g => g.id === id);
    if (!game) return;
    const btn = bundledGames?.querySelector(`[data-id="${id}"] .play-bundled`);
    if (btn) { btn.disabled = true; btn.textContent = 'Carregando...'; }
    let phase = 'localizar a ROM';
    try {
      const loaded = await fetchBundledGame(game);
      phase = 'preparar a ROM';
      const file = new File([loaded.blob], game.file.split('/').pop(), { type: 'application/octet-stream', lastModified: Date.now() });
      phase = 'inicializar o emulador';
      await bootRom(file, game);
    } catch (err) {
      window.__SNESNovaLastBootError = { game: game.title, phase, message: String(err?.message || err), at: new Date().toISOString() };
      console.error('SNES Nova boot instalado:', window.__SNESNovaLastBootError, err);
      const msg = phase === 'localizar a ROM'
        ? `Não foi possível localizar a ROM de ${game.title} no site.\n\nVerifique se o arquivo ${game.file.replace(/^\.\//,'')} foi enviado ao GitHub.`
        : `A ROM de ${game.title} foi encontrada, mas ocorreu um erro ao ${phase}.\n\nErro: ${String(err?.message || err)}\n\nUse o botão Diagnóstico para ver os detalhes.`;
      alert(msg);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Jogar agora'; }
    }
  }

  function renderRecent() {
    const list = getRecent();
    if (!list.length) {
      recentGames.innerHTML = '<div class="empty-card">Nenhum jogo recente ainda.<br>Escolha uma ROM local para começar.</div>';
      return;
    }
    recentGames.innerHTML = list.slice(0, 5).map((g, i) => `
      <article class="recent-card" data-name="${encodeURIComponent(g.name)}" title="Selecione novamente a ROM ${g.name}">
        <div class="game-icon">${String(i + 1).padStart(2,'0')}</div>
        <strong>${escapeHtml(g.title)}</strong>
        <small>${formatSize(g.size)} • histórico local</small>
      </article>`).join('');
    recentGames.querySelectorAll('.recent-card').forEach((card, index) => {
      const item = list[index];
      bindPreviewTarget(card, { id: 'recent', title: item.title, subtitle: 'Histórico local', badge: 'Recente', preferred: 'auto', size: item.size, note: 'Para jogar novamente, selecione a ROM correspondente.' });
      card.addEventListener('click', () => { romInput.click(); });
    });
  }

  function escapeHtml(v) {
    return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  }

  function validateRom(file) {
    if (!file) return false;
    return /\.(sfc|smc|fig|zip)$/i.test(file.name);
  }

  function graphicOptions(profile, fps, filter) {
    const base = { 'save-state-location': 'browser' };
    if (fps) base.fps = 'enabled';
    if (filter === 'crt' || profile === 'crt') base.shader = 'crt-mattias.glslp';
    return base;
  }

  async function bootRom(file, bundledGame = null) {
    window.__SNESNovaBootPhase = 'validar ROM';
    if (!validateRom(file)) {
      alert('Formato não suportado. Use uma ROM .sfc, .smc, .fig ou .zip.');
      return;
    }

    window.__SNESNovaBootPhase = 'carregar preferências';
    const prefs = savePrefs();
    const caps = updateHardwarePanel();
    if (prefs.autoBenchmark && !getBenchmark()) await runDeviceBenchmark(false);
    let resolvedGraphics = resolveGraphicsProfile(prefs.graphics, caps);
    if (prefs.graphics === 'auto' && window.SNESNova?.mobile?.resolveGraphics) resolvedGraphics = window.SNESNova.mobile.resolveGraphics(resolvedGraphics);
    window.__SNESNovaBootPhase = 'analisar ROM';
    const romInfo = await inspectRom(file);
    const profileKey = makeGameProfileKey(file, romInfo, bundledGame);
    window.__SNESNovaRomRegion = romInfo?.analysis?.region || romInfo?.header?.region || '';
    const learnedProfile = prefs.gameProfiles ? getGameProfiles()[profileKey] : null;
    window.__SNESNovaBootPhase = 'consultar compatibilidade';
    const compatibility = window.SNESNova?.compatibility ? await window.SNESNova.compatibility.lookup(romInfo.analysis || romInfo) : null;
    let smartDecision = prefs.core === 'auto'
      ? chooseSmartCore(file, romInfo, learnedProfile)
      : { core: prefs.core, reasons: ['core escolhido manualmente nas preferências'], hw: hardwareProfile(), accuracyHint: false };
    if (prefs.core === 'auto' && bundledGame?.preferred === 'snes9x') {
      smartDecision = { core: 'snes9x', reasons: ['perfil conhecido deste jogo', 'Snes9x oferece ótima compatibilidade com menor custo de CPU'], hw: hardwareProfile(), accuracyHint: false };
    } else if (prefs.core === 'auto' && bundledGame?.preferred === 'bsnes' && hardwareProfile().strong) {
      smartDecision = { core: 'bsnes', reasons: ['perfil conhecido deste jogo', 'hardware suficiente para priorizar maior precisão'], hw: hardwareProfile(), accuracyHint: true };
    }
    if (prefs.core === 'auto' && compatibility) {
      const hwNow = hardwareProfile();
      const rec = compatibility.recommendedCore;
      if (rec === 'bsnes' && !hwNow.weak && getBenchmark()?.tier !== 'low') smartDecision = { core:'bsnes', reasons:['banco de compatibilidade por CRC32/SHA-1', compatibility.notes || 'perfil de precisão recomendado'], hw:hwNow, accuracyHint:true, database:true };
      else if (rec === 'snes9x' || compatibility.fallbackCore === 'snes9x') smartDecision = { core:'snes9x', reasons:['banco de compatibilidade por CRC32/SHA-1', compatibility.notes || 'perfil de desempenho recomendado'], hw:hwNow, accuracyHint:false, database:true };
    }
    let selectedCore = smartDecision.core;
    if (prefs.core === 'auto' && window.SNESNova?.mobile?.resolveCore) {
      const mobileCore = window.SNESNova.mobile.resolveCore(selectedCore, {romInfo, compatibility, bundledGame});
      if (mobileCore && mobileCore !== selectedCore) {
        selectedCore = mobileCore;
        smartDecision = {...smartDecision, core:selectedCore, reasons:[...(smartDecision.reasons||[]), 'perfil Mobile Auto priorizou estabilidade/consumo']};
      }
    }
    const engineHash = romInfo.sha1 || romInfo.crc32 || profileKey;
    window.__SNESNovaBootPhase = 'preparar engine';
    const enginePrep = await window.SNESNova?.engine?.prepareBoot?.({core:selectedCore,romHash:engineHash});
    if (prefs.core === 'auto' && enginePrep?.profile?.core && enginePrep.profile.core !== selectedCore) {
      selectedCore = enginePrep.profile.core;
      smartDecision = {...smartDecision, core:selectedCore, reasons:[...(smartDecision.reasons||[]), 'perfil adaptativo por jogo + dispositivo']};
    }
    window.SNESNova?.session?.begin({title: bundledGame?.title || safeTitle(file.name), hash: romInfo.sha1 || romInfo.crc32 || profileKey, core:selectedCore});
    addRecent(file);
    if (activeRomUrl) URL.revokeObjectURL(activeRomUrl);
    activeRomUrl = URL.createObjectURL(file);
    activeRomName = file.name;
    const title = bundledGame?.title || safeTitle(file.name);

    rememberLibraryScroll();
    launcherView.hidden = true;
    playerView.hidden = false;
    focusPlayerView('auto');
    $('#playingTitle').textContent = title;
    $('#playingCore').textContent = selectedCore === 'bsnes' ? 'bsnes • automático' : 'Snes9x • automático';
    if (prefs.core !== 'auto') $('#playingCore').textContent = selectedCore === 'bsnes' ? 'bsnes • manual' : 'Snes9x • manual';
    renderCoreDecision(smartDecision, prefs.core, romInfo);
    $('#game').innerHTML = '';
    applyDisplayScale(prefs.resolution, prefs.sharp, resolvedGraphics);
    applyVideoPresentation(prefs, resolvedGraphics);
    window.__SNESNovaBootPhase = 'detectar runtime';
    const runtime = await detectRuntimeSource(selectedCore);
    const runtimeSource = runtime.source;
    const dataPath = runtime.dataPath;

    // Public/documented EmulatorJS configuration only.
    window.EJS_player = '#game';
    window.EJS_core = selectedCore;
    window.EJS_gameUrl = activeRomUrl;
    window.EJS_gameName = title;
    window.EJS_gameID = parseInt((romInfo.crc32 || '00000001').slice(-8), 16) >>> 0;
    window.EJS_onSaveState = function(e){ window.dispatchEvent(new CustomEvent('snesnova:savestate',{detail:{payload:e,hash:romInfo.sha1||romInfo.crc32||profileKey,at:Date.now()}})); };
    window.EJS_onLoadState = function(e){ window.dispatchEvent(new CustomEvent('snesnova:loadstate',{detail:{payload:e,hash:romInfo.sha1||romInfo.crc32||profileKey,at:Date.now()}})); };
    window.EJS_onSaveUpdate = function(e){ window.dispatchEvent(new CustomEvent('snesnova:saveupdate',{detail:{payload:e,hash:romInfo.sha1||romInfo.crc32||profileKey,at:Date.now()}})); };
    window.EJS_onExit = function(){ window.SNESNova?.session?.stop('ejs-exit'); window.dispatchEvent(new CustomEvent('snesnova:ejsexit')); };
    window.EJS_pathtodata = dataPath;
    window.EJS_language = 'pt-BR';
    window.EJS_volume = prefs.volume;
    window.EJS_startOnLoaded = prefs.autoStart;
    window.EJS_color = '#7669ff';
    window.EJS_backgroundColor = '#05060a';
    window.EJS_alignStartButton = 'center';
    window.EJS_controlScheme = 'snes';
    window.EJS_askBeforeExit = prefs.confirmExit;
    window.EJS_threads = Boolean(prefs.threads && caps.canThreads);
    window.EJS_forceLegacyCores = prefs.renderer === 'compatibility' || (!caps.webgl2 && prefs.renderer !== 'webgl2');
    window.EJS_fixedSaveInterval = prefs.autoSave ? 10000 : undefined;
    window.EJS_screenCapture = {
      photo: { source: 'canvas', format: 'png', upscale: prefs.captureScale || 2 },
      video: { format: 'detect', upscale: Math.min(2, prefs.captureScale || 1), fps: 60, videoBitrate: 2621440, audioBitrate: 196608 }
    };
    window.EJS_defaultOptions = Object.assign(graphicOptions(resolvedGraphics, prefs.fps, prefs.filter), window.SNESNova?.enhancements?.coreOptions?.() || {});
    window.EJS_cacheConfig = { cache: true };
    window.EJS_Buttons = {
      playPause: true, restart: true, mute: true, settings: true,
      fullscreen: true, saveState: true, loadState: true, screenRecord: true,
      gamepad: true, cheat: true, volume: true, saveSavFiles: true,
      loadSavFiles: true, quickSave: true, quickLoad: true, screenshot: true,
      cacheManager: true, exitEmulation: true
    };
    window.EJS_onExit = async () => { await window.SNESNova?.session?.stop?.('ejs-exit'); showLibrary(); };
    window.EJS_onGameStart = () => {
      document.title = `${title} • SNES Nova`;
      focusPlayerView('smooth');
      window.SNESNova?.session?.started();
      if (prefs.gameProfiles) saveGameProfile(profileKey, { core: selectedCore, graphics: resolvedGraphics, aspect: prefs.aspect, filter: prefs.filter, overscan: prefs.overscan });
      const status = $('#runtimeVideoStatus');
      if (status) {
        const presentation = status.dataset.presentation ? ` • ${status.dataset.presentation}` : '';
        status.textContent = `${caps.webgl2 && !window.EJS_forceLegacyCores ? 'WebGL2/GPU' : 'WebGL compatível'}${window.EJS_threads ? ' • threads' : ''}${presentation}`;
      }
    };
    window.EJS_ready = () => {
      // Reaplica nitidez no canvas criado pelo EmulatorJS sem depender de API interna.
      const canvas = $('#game canvas');
      if (canvas && (prefs.sharp || resolvedGraphics === 'pixel')) canvas.style.imageRendering = 'pixelated';
    };

    const oldLoader = document.querySelector('script[data-ejs-loader]');
    if (oldLoader) oldLoader.remove();
    const script = document.createElement('script');
    script.src = `${dataPath}loader.js`;
    script.dataset.ejsLoader = '1';
    script.onerror = () => {
      window.SNESNova?.session?.stop('loader-error');
      if (selectedCore === 'bsnes') alert('O runtime bsnes não pôde ser carregado. Execute o instalador de runtime ou deixe o fallback online disponível.');
      else alert('Não foi possível carregar o Snes9x. Execute o instalador de runtime ou verifique a conexão.');
    };
    window.__SNESNovaBootPhase = 'carregar loader do core';
    document.body.appendChild(script);
  }

  function showLibrary() {
    window.SNESNova?.session?.stop('library');
    playerView.hidden = true;
    launcherView.hidden = false;
    document.title = 'SNES Nova 1.5.0';
    $('#game').innerHTML = '';
    restoreLibraryScroll();
    // Full core teardown is owned by EmulatorJS exit button. Reload offers a guaranteed clean boot.
  }

  function updateGamepadStatus() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const el = $('#gamepadStatus');
    if (pads.length) {
      el.classList.add('connected');
      el.innerHTML = `<i></i> ${escapeHtml(pads[0].id.split('(')[0].trim() || 'Gamepad conectado')}`;
    } else {
      el.classList.remove('connected');
      el.innerHTML = '<i></i> Gamepad não detectado';
    }
  }


  function updateCoreAdvice() {
    const el = $('#coreAdvice');
    if (!el) return;
    if (coreSelect.value === 'auto') {
      el.textContent = 'Automático: analisa hardware + ROM e escolhe Snes9x ou bsnes ao iniciar.';
    } else if (coreSelect.value === 'bsnes') {
      el.textContent = 'bsnes forçado: prioriza precisão, mas exige mais processamento.';
    } else {
      el.textContent = 'Snes9x forçado: prioriza desempenho e ótima compatibilidade.';
    }
  }
  coreSelect.addEventListener('change', updateCoreAdvice);

  romInput.addEventListener('change', () => {
    const file = romInput.files && romInput.files[0];
    if (file) bootRom(file);
    romInput.value = '';
  });

  $('#settingsBtn').addEventListener('click', () => settingsDialog.showModal());
  $('#themeQuickBtn')?.addEventListener('click', cycleTheme);
  themeSelect?.addEventListener('change', () => applyTheme(themeSelect.value));
  $('#savePrefsBtn').addEventListener('click', () => { const prefs = savePrefs(); applyTheme(prefs.theme); playUiSound('confirm'); });
  $('#backBtn').addEventListener('click', showLibrary);
  $('#libraryBtn').addEventListener('click', () => document.getElementById('smartLibrarySection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  $('#reloadBtn').addEventListener('click', () => location.reload());
  $('#fullscreenHostBtn').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await $('.player-stage').requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  });
  $('#clearRecentBtn').addEventListener('click', () => {
    localStorage.removeItem(RECENT_KEY);
    renderRecent();
  });

  window.addEventListener('gamepadconnected', updateGamepadStatus);
  window.addEventListener('gamepaddisconnected', updateGamepadStatus);
  setInterval(updateGamepadStatus, 2500);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $('#installBtn').hidden = false;
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('#installBtn').hidden = true;
  });

  resolutionSelect.addEventListener('change', () => {
    const p = savePrefs();
    applyDisplayScale(p.resolution, p.sharp, resolveGraphicsProfile(p.graphics, detectGraphicsCapabilities()));
  });
  sharpToggle.addEventListener('change', () => {
    const p = savePrefs();
    applyDisplayScale(p.resolution, p.sharp, resolveGraphicsProfile(p.graphics, detectGraphicsCapabilities()));
  });
  document.querySelectorAll('.mini-btn[data-scale]').forEach(btn => btn.addEventListener('click', () => {
    applyDisplayScale(btn.dataset.scale, true, 'pixel');
  }));
  $('#fitScaleBtn')?.addEventListener('click', () => applyDisplayScale('fit', sharpToggle.checked, graphicsSelect.value));

  document.addEventListener('keydown', async (e) => {
    if (playerView.hidden) return;
    if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      try { if (!document.fullscreenElement) await $('.player-stage').requestFullscreen(); else await document.exitFullscreen(); } catch {}
    }
  });

  [aspectSelect, filterSelect, overscanToggle].forEach(el => el?.addEventListener('change', () => {
    const p = savePrefs();
    applyVideoPresentation(p, resolveGraphicsProfile(p.graphics, detectGraphicsCapabilities()));
  }));

  $('#benchmarkBtn')?.addEventListener('click', async () => {
    const btn = $('#benchmarkBtn');
    btn.disabled = true; btn.textContent = 'Medindo...';
    try { await runDeviceBenchmark(true); updateHardwarePanel(); }
    finally { btn.disabled = false; btn.textContent = 'Executar benchmark'; }
  });

  $('#resetGameProfilesBtn')?.addEventListener('click', () => {
    localStorage.removeItem(GAME_PROFILE_KEY);
    alert('Perfis aprendidos por jogo foram limpos.');
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  applyPrefsToUi();
  updateCoreAdvice();
  renderHomeShowcase();
  setupCategories();
  renderFeatured();
  renderBundled();
  renderBrowsePreview(BUNDLED_GAMES[0]);
  setupConsoleNav();
  wireUiSounds();
  renderRecent();
  updateGamepadStatus();
  updateHardwarePanel();
  updateBenchmarkStatus();
  detectRuntimeSource();
  applyVideoPresentation(loadPrefs(), resolveGraphicsProfile(loadPrefs().graphics, detectGraphicsCapabilities()));
  applyDisplayScale(loadPrefs().resolution, loadPrefs().sharp, resolveGraphicsProfile(loadPrefs().graphics, detectGraphicsCapabilities()));
  window.addEventListener('snesnova:browsepreview', (e) => { if (e.detail) renderBrowsePreview(e.detail); });

  async function neoMultiAutoLoad(){const p=new URLSearchParams(location.search),u=p.get('autoload');if(!u)return;try{const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error('ROM não encontrada');const blob=await r.blob();let name=p.get('game')||decodeURIComponent(u.split('/').pop()||'game.sfc');if(!/\.(sfc|smc|fig)$/i.test(name))name+='.sfc';await bootRom(new File([blob],name,{type:'application/octet-stream'}));}catch(e){console.error('NEO Multi autoload',e);alert('Não foi possível iniciar o jogo pelo NEO Multi: '+e.message)}}
  setTimeout(neoMultiAutoLoad,220);
  revealShell();
})();
