export function crc32(bytes){
  let c=0xffffffff;
  for(let i=0;i<bytes.length;i++){
    c^=bytes[i];
    for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return ((c^0xffffffff)>>>0).toString(16).padStart(8,'0');
}
export function fnv1a32(bytes){let h=0x811c9dc5;for(let i=0;i<bytes.length;i++){h^=bytes[i];h=Math.imul(h,0x01000193)}return (h>>>0).toString(16).padStart(8,'0')}
