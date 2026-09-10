#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STABLE_BASE="https://cdn.emulatorjs.org/4.2.3/data"
BSNES_BASE="https://cdn.emulatorjs.org/4.3.0-pre/data"
STABLE="$ROOT/vendor/emulatorjs/stable-4.2.3/data"
BSNES="$ROOT/vendor/emulatorjs/bsnes-4.3.0-pre/data"
mkdir -p "$STABLE/cores" "$STABLE/localization" "$BSNES/cores" "$BSNES/localization"
fetch(){ local url="$1" out="$2"; echo "Baixando $url"; curl --fail --location --retry 3 --connect-timeout 20 "$url" -o "$out"; }
install_ui(){ local base="$1" dst="$2"; fetch "$base/loader.js" "$dst/loader.js"; fetch "$base/emulator.min.zip" "$dst/emulator.min.zip"; unzip -oq "$dst/emulator.min.zip" -d "$dst"; rm -f "$dst/emulator.min.zip"; fetch "$base/version.json" "$dst/version.json" || true; fetch "$base/localization/pt-BR.json" "$dst/localization/pt-BR.json" || true; }
install_ui "$STABLE_BASE" "$STABLE"
for f in snes9x-wasm.data snes9x-legacy-wasm.data snes9x-thread-wasm.data snes9x-thread-legacy-wasm.data cores.json; do fetch "$STABLE_BASE/cores/$f" "$STABLE/cores/$f"; done
install_ui "$BSNES_BASE" "$BSNES"
for f in bsnes-wasm.data bsnes-legacy-wasm.data bsnes-thread-wasm.data bsnes-thread-legacy-wasm.data cores.json; do fetch "$BSNES_BASE/cores/$f" "$BSNES/cores/$f"; done
python3 - "$ROOT" <<'PY'
import hashlib,json,sys,datetime
from pathlib import Path
root=Path(sys.argv[1]); files=[]
for p in sorted((root/'vendor/emulatorjs').rglob('*')):
    if p.is_file() and p.name!='runtime-manifest.json':
        h=hashlib.sha256(p.read_bytes()).hexdigest(); files.append({'path':str(p.relative_to(root)).replace('\\','/'),'size':p.stat().st_size,'sha256':h})
out={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'snes9xRuntime':'EmulatorJS 4.2.3','bsnesRuntime':'EmulatorJS 4.3.0-pre pinned','files':files}
(root/'vendor/emulatorjs/runtime-manifest.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
PY
echo "Runtime instalado localmente."
