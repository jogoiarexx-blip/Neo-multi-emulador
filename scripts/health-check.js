const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'config','cores.json'),'utf8'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
let failed=0,warnings=0;
const pass=m=>console.log(`PASS ${m}`);
const fail=m=>{failed++;console.log(`FAIL ${m}`)};
const warn=m=>{warnings++;console.log(`WARN ${m}`)};
const exists=(p,label,required=true)=>{const ok=fs.existsSync(p);if(ok)pass(label);else(required?fail:warn)(label);return ok};

if(pkg.version===registry.hubVersion)pass(`versão Hub consistente ${pkg.version}`);else fail(`versão divergente package=${pkg.version} registry=${registry.hubVersion}`);
for(const core of registry.cores){
  const p=path.join(root,core.entry.replace(/^\/cores\//,'cores/'));
  exists(p,`${core.id.padEnd(7)} ${core.version.padEnd(8)} ${core.entry}`);
}

for(const rel of ['server.js','shared/core-bridge.js','cores/gba/js/cpu/arm7tdmi.js','cores/gba/js/video/ppu.js','cores/snes/assets/js/app.js','cores/gb/js/app.js','cores/arcade/server.js']){
  const p=path.join(root,rel);if(!exists(p,`arquivo ${rel}`))continue;
  const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  if(r.status===0)pass(`syntax ${rel}`);else fail(`syntax ${rel}: ${(r.stderr||'').trim()}`);
}

for(const rel of ['cores/arcade/config/settings.json','cores/arcade/database/games.json','cores/snes/data/compatibility.json']){
  try{JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));pass(`JSON ${rel}`)}catch(e){fail(`JSON ${rel}: ${e.message}`)}
}

const snesLocal=fs.existsSync(path.join(root,'cores/snes/vendor/emulatorjs/stable-4.2.3/data/loader.js'));
(snesLocal?pass:warn)(`SNES runtime local ${snesLocal?'disponível':'ausente; fallback CDN será usado'}`);
const gbLocal=fs.existsSync(path.join(root,'cores/gb/vendor/emulatorjs/stable-4.2.3/data/loader.js'))||snesLocal;
(gbLocal?pass:warn)(`GB/GBC runtime local ${gbLocal?'disponível':'ausente; fallback CDN será usado'}`);

let arcadeExe=0;
for(const rel of ['cores/arcade/cores/mame','cores/arcade/cores/fbneo','cores/arcade/cores/mame2003plus']){
  const d=path.join(root,rel);if(fs.existsSync(d)) arcadeExe+=fs.readdirSync(d).filter(f=>/\.exe$/i.test(f)).length;
}
(arcadeExe?pass:warn)(`Arcade executáveis locais: ${arcadeExe}${arcadeExe?'':' (MAME/FBNeo externo necessário)'}`);

console.log(`Health-check concluído: ${failed} falha(s), ${warnings} aviso(s).`);
process.exitCode=failed?1:0;
