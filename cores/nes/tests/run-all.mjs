import fs from 'fs';import path from 'path';import {spawnSync} from 'child_process';import {fileURLToPath} from 'url';
const dir=path.dirname(fileURLToPath(import.meta.url));const files=fs.readdirSync(dir).filter(f=>f.endsWith('.mjs')&&f!=='run-all.mjs').sort();let passed=0,failed=0;
for(const f of files){const r=spawnSync(process.execPath,[path.join(dir,f)],{cwd:path.dirname(dir),encoding:'utf8'});if(r.status===0){passed++;process.stdout.write(`PASS ${f}\n${r.stdout||''}`)}else{failed++;process.stderr.write(`FAIL ${f}\n${r.stdout||''}${r.stderr||''}`)}}
console.log(`\nNEO NES test summary: ${passed} passed / ${failed} failed / ${files.length} suites`);if(failed)process.exit(1);


