// Minimal ZIP reader for browser use. Supports Stored (0) and Deflate (8).
// No external libraries: relies on the browser's DecompressionStream for DEFLATE.
function u16(v,o){return v.getUint16(o,true)}
function u32(v,o){return v.getUint32(o,true)}
function decodeName(bytes, utf8=true){
  try{return new TextDecoder(utf8?'utf-8':'windows-1252').decode(bytes)}catch{return new TextDecoder().decode(bytes)}
}
function findEOCD(v){
  const min=Math.max(0,v.byteLength-0x10000-22);
  for(let o=v.byteLength-22;o>=min;o--) if(u32(v,o)===0x06054b50) return o;
  throw new Error('ZIP inválido: diretório central não encontrado.');
}
async function inflateRaw(bytes){
  if(typeof DecompressionStream==='undefined') throw new Error('Seu navegador não oferece descompactação ZIP nativa. Atualize o navegador.');
  let ds;
  try{ds=new DecompressionStream('deflate-raw')}catch{throw new Error('Seu navegador não suporta ZIP/Deflate neste dispositivo.');}
  const stream=new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function extractFirstNesFromZip(file){
  const buffer=await file.arrayBuffer();
  const v=new DataView(buffer), all=new Uint8Array(buffer);
  const eocd=findEOCD(v);
  const total=u16(v,eocd+10), cdOffset=u32(v,eocd+16);
  let p=cdOffset, target=null;
  for(let i=0;i<total;i++){
    if(u32(v,p)!==0x02014b50) throw new Error('ZIP inválido: entrada do diretório central corrompida.');
    const flags=u16(v,p+8), method=u16(v,p+10), crc=u32(v,p+16), compSize=u32(v,p+20), size=u32(v,p+24);
    const nameLen=u16(v,p+28), extraLen=u16(v,p+30), commentLen=u16(v,p+32), localOffset=u32(v,p+42);
    const nameBytes=all.subarray(p+46,p+46+nameLen);
    const name=decodeName(nameBytes,!!(flags&0x0800));
    if(!target && /\.nes$/i.test(name) && !name.endsWith('/')) target={name,method,crc,compSize,size,localOffset};
    p+=46+nameLen+extraLen+commentLen;
  }
  if(!target) throw new Error('Nenhuma ROM .nes foi encontrada dentro do ZIP.');
  const lo=target.localOffset;
  if(u32(v,lo)!==0x04034b50) throw new Error('ZIP inválido: cabeçalho local não encontrado.');
  const nameLen=u16(v,lo+26), extraLen=u16(v,lo+28), dataStart=lo+30+nameLen+extraLen;
  const compressed=all.subarray(dataStart,dataStart+target.compSize);
  let out;
  if(target.method===0) out=new Uint8Array(compressed);
  else if(target.method===8) out=await inflateRaw(compressed);
  else throw new Error(`Método de compressão ZIP não suportado (${target.method}). Use ZIP normal/Deflate.`);
  if(target.size!==0xffffffff && out.byteLength!==target.size) throw new Error('Falha ao extrair a ROM: tamanho inesperado.');
  // Basic NES header validation to avoid trying unrelated files renamed to .nes.
  if(out.length<16 || out[0]!==0x4e || out[1]!==0x45 || out[2]!==0x53 || out[3]!==0x1a) throw new Error('O arquivo .nes dentro do ZIP não possui um cabeçalho iNES válido.');
  return {name:target.name.split('/').pop(), buffer:out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength), size:out.byteLength};
}
