const STATUS_ORDER=['Unknown','Boots','Playable','Mostly Compatible','Verified','Perfect','Broken'];
// Local/offline compatibility records. "Playable" here means the bundled build passes
// boot + deterministic frame regression; it does NOT claim full-game completion.
const DB=new Map([
 ['395569ec',{name:'Batman: The Video Game (USA)',region:'NTSC',mapper:4,status:'Playable',video:'golden-frame',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'Boot/frame regression verified; full completion not yet certified.'}],
 ['83d69922',{name:'Contra Force (USA)',region:'NTSC',mapper:4,status:'Playable',video:'smoke-pass',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'Boot/state regression verified; full completion not yet certified.'}],
 ['dcb94341',{name:'DuckTales (USA)',region:'NTSC',mapper:2,status:'Playable',video:'golden-frame',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'120-frame golden hash + state regression pass.'}],
 ['83213ca0',{name:'Teenage Mutant Ninja Turtles (USA)',region:'NTSC',mapper:1,status:'Playable',video:'golden-frame',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'120-frame golden hash + state regression pass.'}],
 ['b34ed396',{name:'Tiny Toon Adventures (USA)',region:'NTSC',mapper:4,status:'Playable',video:'smoke-pass',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'Boot/state regression verified; full completion not yet certified.'}],
 ['15eb0bee',{name:'Mighty Final Fight (USA)',region:'NTSC',mapper:4,status:'Playable',video:'golden-frame',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'Bundled/retested v0.8.10; 120-frame regression + state roundtrip passed; full completion not certified.'}],
 ['e9cf747f',{name:'1942 (Japan, USA)',region:'NTSC',mapper:0,status:'Playable',video:'golden-frame',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'Bundled/retested v0.8.10; 120-frame regression + state roundtrip passed; full completion not certified.'}],
 ['f21b23df',{name:'Spider-Man: Return of the Sinister Six (USA)',region:'NTSC',mapper:4,status:'Playable',video:'golden-frame',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'Bundled/retested v0.8.10; 120-frame regression + state roundtrip passed; full completion not certified.'}],
 ['eb171d77',{name:'Paperboy (USA)',region:'NTSC',mapper:3,status:'Playable',video:'golden-frame',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'Bundled/retested v0.8.10; 120-frame regression + state roundtrip passed; full completion not certified.'}],
 ['4877213a',{name:'Kart Fighter',region:'NTSC',mapper:4,status:'Playable',video:'golden-frame',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'Bundled/retested v0.8.10; unlicensed ROM; 120-frame regression + state roundtrip passed; full completion not certified.'}],
 ['7a6e0454',{name:'Double Dragon III: The Sacred Stones (USA)',region:'NTSC',mapper:4,status:'Playable',video:'golden-frame',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'Bundled/retested v0.8.10; 120-frame regression + state roundtrip passed; full completion not certified.'}],
 ['d3a91b41',{name:'Bubble Bobble (USA)',region:'NTSC',mapper:1,status:'Playable',video:'golden-frame',audio:'smoke-pass',save:'state-pass',testedVersion:'0.8.10',notes:'Bundled/retested v0.8.10; 120-frame regression + state roundtrip passed; full completion not certified.'}]
]);
export function lookupCompatibility(crc){return DB.get(String(crc||'').toLowerCase())||null}
export function compatibilityStatus(crc){return lookupCompatibility(crc)?.status||'Unknown'}
export function compatibilityStatuses(){return [...STATUS_ORDER]}
export function applyHeaderOverride(cart,crc){
  const rec=lookupCompatibility(crc);if(!rec?.override)return null;
  const o=rec.override;
  if(Number.isInteger(o.mapper))cart.mapper=o.mapper;
  if(Number.isInteger(o.submapper))cart.submapper=o.submapper;
  if(o.region)cart.region=o.region;
  if(o.mirroring)cart.mirroring=o.mirroring;
  return {source:'local-db',crc,...o};
}
