# NEO Multi — Arquitetura

## Objetivo
Unificar a experiência de NES, SNES, GBA e Arcade sem transformar quatro engines diferentes em um monólito frágil.

## Camadas

### 1. `app/` — Shell compartilhado
Responsável por navegação, seleção de sistema, tela do núcleo e diagnóstico do ambiente. Não contém lógica de emulação.

### 2. `config/cores.json` — Registro/contrato
É a fonte de verdade para o Hub. Cada núcleo declara id, versão, entrypoint, extensões, engine e capacidades.

### 3. `cores/<id>/` — Implementação isolada
Cada emulador mantém seus arquivos originais. Não é permitido importar diretamente código de outro núcleo.

- `cores/nes/`: core JS próprio 6502/PPU/APU, FDS/NSF/mappers.
- `cores/snes/`: frontend/engine SNES Nova, EmulatorJS, Snes9x e bsnes.
- `cores/gba/`: ARM7TDMI/PPU/APU/memória próprios em JS.
- `cores/arcade/`: frontend local + banco/config/ROMs e roteamento MAME/FBNeo.

## Regras para evolução
1. Mudança de precisão de CPU/PPU/APU fica dentro do núcleo correspondente.
2. Mudança visual comum fica em `app/`.
3. Versões dos núcleos não dependem da versão do Hub.
4. Testes de um núcleo devem rodar sem carregar os demais.
5. Um núcleo novo deve ser adicionado por pasta + entrada em `config/cores.json`.
6. APIs de processo/desktop ficam no backend; engines web não devem depender delas.

## Por que iframe?
O isolamento por iframe evita colisão de CSS, variáveis globais, IndexedDB/frontends e Service Workers. Também permite preservar os quatro projetos atuais enquanto se cria, no futuro, um protocolo de mensagens (`postMessage`) sem reescrever os cores agora.

## Próxima camada recomendada
Criar `CoreBridge v1` com eventos padronizados: `ready`, `rom-loaded`, `running`, `paused`, `fps`, `save-state`, `error`. O Hub poderá exibir uma biblioteca unificada sem absorver a lógica interna dos emuladores.
