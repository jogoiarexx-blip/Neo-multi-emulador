#!/usr/bin/env bash
set -euo pipefail
# SNES Nova Engine v1 custom-core build entry point.
# Requires: git, python3, cmake/make as requested by the upstream core, and Emscripten (emcc) in PATH.
if ! command -v emcc >/dev/null; then echo 'Emscripten not found. Install/activate emsdk first.' >&2; exit 2; fi
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/vendor/custom-cores"
SRC="$ROOT/.core-src"
mkdir -p "$OUT" "$SRC"
echo 'Build framework ready.'
echo 'This project intentionally does not silently patch upstream emulator sources.'
echo 'Pin the approved upstream Snes9x/bsnes-libretro commits in core-lock.env, then add the upstream-specific build commands here.'
echo 'Expected outputs:'
echo "  $OUT/snes9x/standard/"
echo "  $OUT/snes9x/simd/"
echo "  $OUT/bsnes/standard/"
echo "  $OUT/bsnes/simd/"
