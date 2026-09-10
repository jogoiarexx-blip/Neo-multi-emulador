import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../js/ui-shell.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function ok(v,msg){if(!v)throw new Error(msg)}
for(const v of ['home','play','library','settings','saves','tools'])ok(html.includes(`data-ui-view="${v}"`),`missing nav ${v}`);
for(const id of ['screen','romInput','playBtn','pauseBtn','saveBtn','loadBtn','controlsBtn','diagBtn','bundledGames','libraryList'])ok(html.includes(`id="${id}"`),`functional ID lost: ${id}`);
ok(html.includes('js/ui-shell.js'),'UI shell not loaded');
ok(css.includes('.app-nav')&&css.includes('.command-palette')&&css.includes('.ui-section-hidden'),'UI CSS missing');
ok(ui.includes("neo-nes-settings-v40")&&ui.includes("neo-nes-settings-v41"),'settings migration missing');
ok(ui.includes("Ctrl+K")||ui.includes("ctrlKey"),'command palette shortcut missing');
ok(main.includes("APP_VERSION='0.8.11'"),'main app version incorrect');
ok(sw.includes('ui-shell.js'),'service worker does not cache UI shell');
console.log('v0.8.11 UI: navigation, command palette, migration, IDs and offline shell OK');
