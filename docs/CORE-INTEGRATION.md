# NEO Multi — integração de núcleos

Cada emulador continua sendo um produto independente. O Hub só conhece o contrato de integração.

## Contrato do modo embarcado
- O Hub inicia o núcleo com `?embed=1`.
- `shared/core-embed.css` remove navegação e HUD duplicadas quando o núcleo está dentro do Hub.
- `shared/core-bridge.js` recebe comandos por `postMessage` e adapta para os controles nativos de cada núcleo.
- Comandos comuns atuais: `pause`, `reset`, `save`, `load`, `fullscreen`, `focus`.
- O núcleo responde `ready`, `command-result` e `error`.

## Independência
Mudanças em CPU/PPU/APU, mappers, runtime WASM, engines externas ou compatibilidade continuam dentro de `cores/<sistema>/`. A camada `shared/` nunca deve implementar emulação; ela só faz integração de UI e ciclo de sessão.

## Próxima etapa recomendada
Criar um adapter próprio em cada núcleo (`core-adapter.js`) expondo estado real de execução, FPS, áudio, save slots, pause state e erros, sem o Hub conhecer IDs internos de botões.
