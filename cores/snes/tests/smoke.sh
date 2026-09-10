#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
find assets/js -name '*.js' -print0 | xargs -0 -n1 node --check
node --check sw.js
python3 - <<'PY2'
import json, pathlib, re
r=pathlib.Path('.')
for p in [r/'manifest.webmanifest',r/'data/compatibility.json',r/'data/top-games.json',r/'data/achievements.json',r/'vendor/emulatorjs/runtime-lock.json']:
 json.loads(p.read_text(encoding='utf-8'))
assert (r/'games/doom-1995.sfc').stat().st_size==2097152
assert (r/'games/final-fight.sfc').stat().st_size==1048576
assert (r/'games/final-fight-3.sfc').stat().st_size==3145728
assert (r/'assets/js/v102.js').exists()
assert (r/'assets/js/modules/achievements.js').exists()
html=(r/'index.html').read_text(encoding='utf-8')
for src in re.findall(r'<script[^>]+src="([^"]+)"',html):
 if src.startswith(('http://','https://')): continue
 src=src.split('?',1)[0]
 assert (r/src).exists(), f'missing script: {src}'
assert 'SNES Nova 1.5.0' in html
assert 'achievementsBtn' in html
assert 'achievementsDialog' in html
assert (r/'ENGINE.md').exists()
assert (r/'scripts/core-build/build-custom-cores.sh').exists()
print('smoke ok')
PY2
