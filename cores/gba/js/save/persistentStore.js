export class PersistentStore {
  constructor(namespace="neo-gba") {
    this.namespace = namespace;
  }

  _key(gameCode, kind) { return `${this.namespace}:${gameCode || "unknown"}:${kind}`; }

  saveSRAM(gameCode, bytes) {
    const b64 = btoa(String.fromCharCode(...bytes));
    localStorage.setItem(this._key(gameCode,"save"), b64);
  }

  loadSRAM(gameCode) {
    const b64 = localStorage.getItem(this._key(gameCode,"save"));
    if (!b64) return null;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
    return out;
  }

  saveState(gameCode, state, slot=1) {
    localStorage.setItem(this._key(gameCode,`state:${slot}`), JSON.stringify(state));
  }

  saveLibrary(items) {
    localStorage.setItem(`${this.namespace}:library`, JSON.stringify(items));
  }

  toggleFavorite(key) {
    const items = this.loadLibrary();
    const item = items.find(x => x.key === key);
    if (!item) return false;
    item.favorite = !item.favorite;
    this.saveLibrary(items);
    return item.favorite;
  }

  loadLibrary() {
    try { return JSON.parse(localStorage.getItem(`${this.namespace}:library`) || "[]"); }
    catch { return []; }
  }

  loadState(gameCode, slot=1) {
    try {
      const s = localStorage.getItem(this._key(gameCode,`state:${slot}`));
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }
}
