import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const f of ['server.js','config/settings.json','database/games.json','app/index.html']) assert.ok(fs.existsSync(path.join(root,f)),`arquivo Arcade ausente: ${f}`);
JSON.parse(fs.readFileSync(path.join(root,'config/settings.json'),'utf8'));JSON.parse(fs.readFileSync(path.join(root,'database/games.json'),'utf8'));
const r=spawnSync(process.execPath,['--check',path.join(root,'server.js')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||'syntax arcade server');
const code=fs.readFileSync(path.join(root,'server.js'),'utf8');assert.ok(code.includes('stopRequested=true'),'runtime stop precisa marcar encerramento do usuário');assert.ok(!code.includes('successTimer=setTimeout'),'Arcade não deve aprender compatibilidade só por ficar aberto 5s');
const exes=[];for(const d of ['cores/mame','cores/fbneo','cores/mame2003plus']){const dir=path.join(root,d);if(fs.existsSync(dir))for(const f of fs.readdirSync(dir))if(/\.exe$/i.test(f))exes.push(path.join(d,f));}
console.log(`Arcade smoke: OK • executáveis locais=${exes.length}${exes.length?'':' (runtime externo ainda necessário)'}`);
