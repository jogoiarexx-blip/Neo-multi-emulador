import fs from 'fs';
import {crc32} from '../js/rom-utils.js';
import {lookupCompatibility,compatibilityStatus} from '../js/compat-db.js';
const expected={
 'batman-the-video-game-usa.nes':'395569ec',
 'contra-force-usa.nes':'83d69922',
 'ducktales-usa.nes':'dcb94341',
 'teenage-mutant-ninja-turtles-usa.nes':'83213ca0',
 'tiny-toon-adventures-usa.nes':'b34ed396'
};
for(const [name,want] of Object.entries(expected)){const data=fs.readFileSync(new URL('../roms/'+name,import.meta.url));const got=crc32(data);if(got!==want)throw new Error(`${name} crc ${got} != ${want}`);const rec=lookupCompatibility(got);if(!rec||rec.status!=='Playable')throw new Error(`${name} compatibility record missing`)}
if(compatibilityStatus('00000000')!=='Unknown')throw new Error('unknown ROM must remain Unknown');
console.log('OK v0.7.8 compatibility DB: CRC32 + explicit Unknown/Playable records');
