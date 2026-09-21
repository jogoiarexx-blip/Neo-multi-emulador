import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=['index.html','manifest.webmanifest','data/compatibility.json','data/top-games.json','data/achievements.json','vendor/emulatorjs/runtime-lock.json','assets/js/app.js','assets/js/modules/session-manager.js','shared/core-bridge.js','shared/adapters/snes.js'];
for(const f of required) assert.ok(fs.existsSync(path.join(root,f)),`arquivo SNES ausente: ${f}`);
for(const f of ['manifest.webmanifest','data/compatibility.json','data/top-games.json','data/achievements.json','vendor/emulatorjs/runtime-lock.json']) JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
for(const f of ['assets/js/app.js','assets/js/modules/session-manager.js','shared/core-bridge.js','shared/adapters/snes.js']){
  const r=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||`syntax fail ${f}`);
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(html.includes('SNES Nova 1.5.1'),'versão SNES inesperada');
assert.ok(html.includes('bsnes — experimental / maior precisão'),'bsnes deve estar marcado experimental');
const localStable=fs.existsSync(path.join(root,'vendor/emulatorjs/stable-4.2.3/data/loader.js'));
console.log(`SNES smoke: OK • runtime-local=${localStable?'SIM':'NÃO (fallback CDN disponível)'}`);
