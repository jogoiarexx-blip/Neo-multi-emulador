# NEO Multi v0.1.6

Hub unificado para NEO NES, SNES Nova, NEO GBA e NEO Arcade com arquitetura modular.

## Executar
1. Tenha Node.js instalado.
2. Execute `npm start` na raiz.
3. Abra o endereço mostrado no terminal (usa a porta configurada pelo núcleo Arcade).

No Windows também pode executar `INICIAR-NEO-MULTI.bat`.

## Estrutura
- `app/`: interface única.
- `config/cores.json`: registro dos núcleos.
- `cores/nes/`: NEO NES v0.8.12.
- `cores/snes/`: SNES Nova v1.5.0.
- `cores/gba/`: NEO GBA v0.17.0.
- `cores/arcade/`: NEO Arcade v0.2.9 + backend/API.
- `docs/`: regras de arquitetura e evolução.

## Importante
O Hub não mistura as engines. Cada núcleo pode ser corrigido, testado, versionado e substituído de forma independente.


## v0.1.6 — Biblioteca unificada
- Biblioteca global NES/SNES/GBA/Arcade.
- Detecção automática de núcleo por sistema/formato.
- Favoritos globais.
- Importação de ROM pelo Hub.
- Abertura direta do jogo sem navegar manualmente pelo núcleo.


## v0.1.6 — Core Embedded Mode
- Núcleos continuam independentes, mas em jogos iniciados pelo Hub entram em modo embarcado.
- HUD duplicada removida: o Hub controla sair, pause, reset, quick save/load e fullscreen via Core Bridge.
- Iframe sem rolagem e estágio ocupa toda a área útil.
- Core Bridge compartilhado isola a integração da implementação de cada emulador.


## v0.1.6 — Core Adapters e HUD técnica

Cada núcleo agora possui um adapter independente em `shared/adapters/`. O Hub usa `core-bridge.js` somente como protocolo comum e não acessa internals de outro emulador. A tela de jogo exibe telemetria compacta de engine, FPS, vídeo, áudio, gamepad, slot e estado. Recursos não expostos por um núcleo ficam desabilitados no Hub em vez de simular suporte.


## v0.1.6 — correção de vídeo em modo integrado
- Corrige caso em que o áudio do SNES iniciava, mas o overlay `Preparando jogo` permanecia sobre o vídeo.
- CoreBridge agora anuncia `ready` mesmo se for carregado após `DOMContentLoaded`.
- Hub possui fallback seguro no evento `iframe.load` e watchdog de inicialização.
- Modo embarcado força canvas/iframe do runtime a permanecer visível e remove telas internas de boot sobrepostas.
- URLs dos assets compartilhados receberam cache-busting para evitar CSS/bridge antigos no navegador.
