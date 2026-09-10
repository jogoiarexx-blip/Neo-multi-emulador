export class IndexedDBStore {
  constructor(name="neo-gba-db", version=1) {
    this.name = name;
    this.version = version;
    this.db = null;
  }
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve,reject)=>{
      const req = indexedDB.open(this.name,this.version);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains("states")) db.createObjectStore("states",{keyPath:"key"});
        if(!db.objectStoreNames.contains("roms")) db.createObjectStore("roms",{keyPath:"key"});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
    return this.db;
  }
  async put(store,value){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,"readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error);
    });
  }
  async all(store){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,"readonly").objectStore(store).getAll();
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=()=>reject(req.error);
    });
  }

  async delete(store,key){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,"readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error);
    });
  }

  async get(store,key){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,"readonly").objectStore(store).get(key);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error);
    });
  }
}