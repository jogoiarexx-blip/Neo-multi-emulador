const DB='neo-nes-library', VERSION=2;
export function openNeoDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('roms'))db.createObjectStore('roms',{keyPath:'hash'});if(!db.objectStoreNames.contains('data'))db.createObjectStore('data',{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function idbPut(store,value){const db=await openNeoDb();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>res(value);tx.onerror=()=>rej(tx.error)})}
export async function idbGet(store,key){const db=await openNeoDb();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
export async function idbDelete(store,key){const db=await openNeoDb();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
export async function idbAll(store){const db=await openNeoDb();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
export const stateStore={
 put:(key,value,meta={})=>idbPut('data',{key,value,meta,updatedAt:Date.now()}),
 get:async key=>(await idbGet('data',key))||null,
 del:key=>idbDelete('data',key),
 all:()=>idbAll('data')
};
