const fs=require('fs');const path=require('path');const root=path.join(__dirname,'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'config','cores.json'),'utf8'));
let failed=0;
for(const core of registry.cores){const p=path.join(root,core.entry.replace(/^\/cores\//,'cores/'));const ok=fs.existsSync(p);console.log(`${ok?'PASS':'FAIL'} ${core.id.padEnd(7)} ${core.version.padEnd(8)} ${core.entry}`);if(!ok)failed++;}
const arcadeFiles=['config/settings.json','database/games.json','server.js'];for(const f of arcadeFiles){const p=f==='server.js'?path.join(root,f):path.join(root,'cores','arcade',f);const ok=fs.existsSync(p);console.log(`${ok?'PASS':'FAIL'} backend ${f}`);if(!ok)failed++;}
process.exitCode=failed?1:0;
