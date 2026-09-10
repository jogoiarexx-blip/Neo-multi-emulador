export class SaveManager {
  constructor(namespace = "neo-gba") { this.namespace = namespace; }
  saveSettings(data) { localStorage.setItem(`${this.namespace}:settings`, JSON.stringify(data)); }
  loadSettings() {
    try { return JSON.parse(localStorage.getItem(`${this.namespace}:settings`) || "{}"); }
    catch { return {}; }
  }
}
