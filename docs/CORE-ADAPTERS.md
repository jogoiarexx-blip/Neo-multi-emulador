# NEO Multi — Core Adapters

## Objetivo
Separar a integração do Hub da implementação de cada emulador. Cada arquivo em `shared/adapters/<core>.js` conhece somente o seu próprio núcleo.

## Contrato
Um adapter registra `id`, `capabilities()`, `commands` e `telemetry()` em `window.NEOCoreBridge.register()`.

### Commands padronizados
- `pause`
- `reset`
- `save`
- `load`
- `fullscreen`
- `focus`

### Telemetria padronizada
- `engine`
- `fps`
- `renderer`
- `audio`
- `gamepad`
- `slot`
- `state`
- `paused`

## Regra de evolução
Melhorias específicas do NES ficam em `adapters/nes.js`; SNES em `adapters/snes.js`; GB em `adapters/gb.js`; GBA em `adapters/gba.js`; Arcade em `adapters/arcade.js`. O Hub nunca deve importar CPU/PPU/APU diretamente.
