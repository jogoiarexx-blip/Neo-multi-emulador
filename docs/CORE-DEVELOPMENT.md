# Desenvolvimento independente dos núcleos

## NES
Trabalhe apenas em `cores/nes/`. Rode as suítes existentes com `node cores/nes/tests/run-all.mjs`.

## SNES
Trabalhe em `cores/snes/`. Os runtimes Snes9x/bsnes permanecem separados da interface. Builds customizados continuam em `cores/snes/scripts/core-build/`.

## GBA
Trabalhe em `cores/gba/js/`. CPU, memória, vídeo, áudio e saves já estão separados por módulo. A prioridade técnica é precisão/compatibilidade antes de compartilhar recursos com o Hub.

## Arcade
Trabalhe em `cores/arcade/`. O backend do NEO Multi reutiliza o roteamento e os arquivos de configuração deste núcleo. Executáveis MAME/FBNeo não são fundidos ao Hub; continuam selecionáveis separadamente.

## Regra de versão
Atualize a versão do núcleo no próprio projeto e também em `config/cores.json`. A versão do NEO Multi muda apenas quando a camada compartilhada/contrato muda.
