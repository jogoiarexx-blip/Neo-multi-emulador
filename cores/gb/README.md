# NEO GB / GBC v0.2.1

Frontend Game Boy / Game Boy Color do NEO Multi usando EmulatorJS + Gambatte.

## Runtime

A inicialização agora é **local-first**. A ordem é:

1. `./vendor/emulatorjs/stable-4.2.3/data/`
2. runtime local compartilhado do SNES em `../snes/vendor/emulatorjs/stable-4.2.3/data/`
3. CDN oficial do EmulatorJS como fallback

Para uso totalmente offline, instale o runtime local usando os scripts próprios em `cores/gb/scripts/` (`install-runtime.ps1` no Windows ou `install-runtime.sh` em ambientes Unix). O GB/GBC reutiliza o mesmo runtime estável quando disponível.

O adapter do hub tenta as APIs do EmulatorJS primeiro e usa controles visuais apenas como fallback, reduzindo quebras quando textos/labels da interface mudarem.
