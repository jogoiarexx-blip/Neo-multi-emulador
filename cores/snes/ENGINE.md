# SNES Nova Engine v1

A camada Engine v1 fica acima do EmulatorJS/Snes9x/bsnes e controla decisões que pertencem ao frontend/runtime: detecção de capacidades, perfis por dispositivo+jogo, prefetch/warm-up, escala inteira, monitoramento de frame pacing, polling de gamepad, workers e preparação para builds WebAssembly próprios.

## O que é real nesta versão
- detecção WebAssembly SIMD, threads, WebGL2, Worker, OffscreenCanvas e AudioWorklet;
- device profile não identificável;
- perfil aprendido por ROM + classe de hardware;
- prefetch/warm-up do loader local;
- worker para hash CRC32/SHA-256 sem bloquear a UI;
- gerenciamento de input por `requestAnimationFrame` durante a sessão;
- escala inteira calculada pela viewport;
- monitor adaptativo para sugerir core mais leve;
- infraestrutura versionada para cores customizados.

## Cores customizados
Os binários Snes9x/bsnes continuam sendo os runtimes aprovados do projeto até que um build customizado seja produzido. Recompilar o core exige o código-fonte upstream e Emscripten; `scripts/core-build/` fornece o ponto de entrada e força pins explícitos de commits, evitando baixar/compilar código mutável silenciosamente.
