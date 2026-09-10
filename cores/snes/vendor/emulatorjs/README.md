# Runtime local do SNES Nova

O deploy do GitHub Pages executa `scripts/install-runtime.sh` e preenche automaticamente estas pastas:

- `stable-4.2.3/data/` — frontend EmulatorJS 4.2.3 + Snes9x.
- `bsnes-4.3.0-pre/data/` — frontend 4.3.0-pre compatível + bsnes.

O navegador usa estes arquivos locais primeiro. A CDN fica apenas como fallback caso o runtime não tenha sido instalado.

No Windows, antes de publicar manualmente, execute `powershell -ExecutionPolicy Bypass -File scripts/install-runtime.ps1`.
