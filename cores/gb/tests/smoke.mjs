import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const f of ['index.html','js/app.js','shared/core-bridge.js','shared/adapters/gb.js']) assert.ok(fs.existsSync(path.join(root,f)),`arquivo GB ausente: ${f}`);
for(const f of ['js/app.js','shared/core-bridge.js','shared/adapters/gb.js']){const r=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||`syntax fail ${f}`)}
const roms=fs.readdirSync(path.join(root,'roms')).filter(x=>/\.(gb|gbc)$/i.test(x));assert.ok(roms.some(x=>/\.gb$/i.test(x)),'ROM GB de smoke ausente');assert.ok(roms.some(x=>/\.gbc$/i.test(x)),'ROM GBC de smoke ausente');
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');assert.ok(app.includes("window.EJS_core='gb'"),'Gambatte/GB core não configurado');assert.ok(app.includes('CDN EmulatorJS 4.2.3'),'fallback CDN GB ausente');
const local=fs.existsSync(path.join(root,'vendor/emulatorjs/stable-4.2.3/data/loader.js')) || fs.existsSync(path.join(root,'..','snes','vendor/emulatorjs/stable-4.2.3/data/loader.js'));
console.log(`GB/GBC smoke: OK • ROMs=${roms.length} • runtime-local=${local?'SIM':'NÃO (fallback CDN disponível)'}`);
