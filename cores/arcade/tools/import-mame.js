
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SETTINGS = JSON.parse(fs.readFileSync(path.join(ROOT,'config','settings.json'),'utf8'));
const mameCfg = SETTINGS.cores && SETTINGS.cores.mame;
if (!mameCfg) {
  console.error('Configuração do MAME não encontrada.');
  process.exit(1);
}
const exe = path.join(ROOT, mameCfg.executable);
if (!fs.existsSync(exe)) {
  console.error('MAME não encontrado em: '+mameCfg.executable);
  console.error('Coloque mame.exe na pasta configurada e execute novamente.');
  process.exit(1);
}

console.log('NEO ARCADE - Importador MAME');
console.log('Executando mame.exe -listxml ...');

const child = spawn(exe, ['-listxml'], { cwd:path.dirname(exe) });
let xml = '';
let err = '';

child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', d => xml += d);
child.stderr.on('data', d => err += d);

function decodeXml(s=''){
  return s
    .replaceAll('&amp;','&')
    .replaceAll('&lt;','<')
    .replaceAll('&gt;','>')
    .replaceAll('&quot;','"')
    .replaceAll('&apos;',"'");
}
function attr(open, name){
  const m = open.match(new RegExp('\\b'+name+'="([^"]*)"'));
  return m ? decodeXml(m[1]) : null;
}
function tag(block, name){
  const m = block.match(new RegExp('<'+name+'>([\\s\\S]*?)<\\/'+name+'>'));
  return m ? decodeXml(m[1].trim()) : null;
}

child.on('close', code => {
  if (code !== 0) {
    console.error('MAME retornou erro '+code);
    if (err) console.error(err);
    process.exit(code || 1);
  }

  const games = {};
  const bios = {};
  const machineRe = /<machine\b([^>]*)>([\s\S]*?)<\/machine>/g;
  let m, count=0, cloneCount=0, biosCount=0;

  while ((m = machineRe.exec(xml)) !== null) {
    const attrs = m[1];
    const block = m[2];
    const name = attr(attrs,'name');
    if (!name) continue;

    const cloneof = attr(attrs,'cloneof');
    const romof = attr(attrs,'romof');
    const isbios = attr(attrs,'isbios') === 'yes';
    const isdevice = attr(attrs,'isdevice') === 'yes';
    const runnable = attr(attrs,'runnable') !== 'no';
    const sourcefile = attr(attrs,'sourcefile');

    const description = tag(block,'description') || name;
    const year = tag(block,'year');
    const manufacturer = tag(block,'manufacturer');

    // Derive rough hardware/family from sourcefile and known names.
    let hardware = sourcefile ? sourcefile.replace(/^.*\//,'').replace(/\.cpp$/,'') : 'MAME';
    if (/neogeo/i.test(sourcefile||'')) hardware='Neo Geo';
    else if (/cps1/i.test(sourcefile||'')) hardware='CPS-1';
    else if (/cps2/i.test(sourcefile||'')) hardware='CPS-2';
    else if (/cps3/i.test(sourcefile||'')) hardware='CPS-3';
    else if (/pgm/i.test(sourcefile||'')) hardware='PGM';

    const item = {
      name, description,
      year: year || null,
      manufacturer: manufacturer || 'Desconhecido',
      cloneof: cloneof || null,
      romof: romof || null,
      isbios, isdevice, runnable,
      sourcefile: sourcefile || null,
      hardware
    };

    games[name.toLowerCase()] = item;
    if (cloneof) cloneCount++;
    if (isbios) {
      bios[name.toLowerCase()] = item;
      biosCount++;
    }
    count++;
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'mame -listxml',
    count,
    cloneCount,
    biosCount,
    games,
    bios
  };

  const outPath = path.join(ROOT, SETTINGS.mameIndexFile || 'database/mame-index.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Importado: ${count} máquinas`);
  console.log(`Clones: ${cloneCount}`);
  console.log(`BIOS: ${biosCount}`);
  console.log(`Arquivo: ${path.relative(ROOT,outPath)}`);
});
