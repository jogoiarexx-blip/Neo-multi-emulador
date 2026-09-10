import assert from 'node:assert/strict';
import {createSaveEnvelope,validateSaveEnvelope,safeSaveFileName} from '../js/save-format.js';
const state={format:'NEO-NES-STATE',version:36,integrity:'abc123',ram:new Uint8Array([1,2,3])};
const env=createSaveEnvelope({state,emulatorVersion:'0.8.5',romHash:'rom1',romCrc:'deadbeef',mapper:4,submapper:0,region:'NTSC',slot:3,checksum:'abc123',thumbnail:'data:image/jpeg;base64,x'});
assert.equal(env.format,'NEO-NES-SAVE');assert.equal(env.header.mapper,4);assert.equal(env.header.checksum,'abc123');assert.equal(validateSaveEnvelope(env,{romHash:'rom1',mapper:4,submapper:0,region:'NTSC'}),true);
assert.throws(()=>validateSaveEnvelope(env,{romHash:'other',mapper:4,submapper:0,region:'NTSC'}));
assert.equal(safeSaveFileName('Teenage Mutant Ninja Turtles (USA).nes'),'Teenage-Mutant-Ninja-Turtles-USA');
console.log('v0.8.5 save envelope: PASS');
