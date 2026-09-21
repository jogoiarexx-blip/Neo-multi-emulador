#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="https://cdn.emulatorjs.org/4.2.3/data"
DST="$ROOT/vendor/emulatorjs/stable-4.2.3/data"
mkdir -p "$DST/cores" "$DST/localization"
fetch(){ echo "Baixando $1"; curl --fail --location --retry 3 --connect-timeout 20 "$1" -o "$2"; }
fetch "$BASE/loader.js" "$DST/loader.js"
fetch "$BASE/emulator.min.zip" "$DST/emulator.min.zip"
unzip -oq "$DST/emulator.min.zip" -d "$DST" && rm -f "$DST/emulator.min.zip"
fetch "$BASE/version.json" "$DST/version.json" || true
fetch "$BASE/localization/pt-BR.json" "$DST/localization/pt-BR.json" || true
for f in gb-wasm.data gb-legacy-wasm.data gb-thread-wasm.data gb-thread-legacy-wasm.data cores.json; do fetch "$BASE/cores/$f" "$DST/cores/$f" || true; done
echo "Runtime GB/GBC instalado localmente."
