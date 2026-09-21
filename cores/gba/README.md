# NEO GBA v0.19.0

Core Game Boy Advance próprio e experimental do NEO Multi.

## Melhorias da v0.19.0
- PC arquitetural ARM/THUMB corrigido em branches e operações que leem `r15`;
- `ARM B/BL`, `THUMB B/BL` e LR corrigidos;
- HLE de IRQ com retorno seguro e suporte ao handler do jogo em `0x03007FFC`;
- `IntrWait` e `VBlankIntrWait` integrados às flags de IRQ HLE;
- renderer OBJ refeito para evitar crash e suportar flip, affine, double-size, mosaic, mapeamento 1D/2D e prioridades básicas;
- correções de byte-write em Palette/VRAM/OAM;
- leitura `read32` desalinhada com rotação compatível com ARM7TDMI;
- save state ampliado para preservar estado de IRQ/HLE;
- smoke test que inicializa uma ROM real por 120 frames, além das regressões de CPU/PPU/memória.

## Recursos já existentes
- biblioteca IndexedDB e abertura direta de ROM;
- perfis por jogo;
- Pixel Perfect / Suave;
- integer scaling Auto/1x/2x/3x/4x;
- scheduler baseado no timing de frames do GBA;
- gamepad/teclado e quick save/load;
- SRAM, FLASH e EEPROM em evolução.

## Estado
Este núcleo continua **experimental**. Ainda há diferenças de precisão em PPU, áudio, BIOS/HLE, timings de Game Pak/WAITCNT, DMA e periféricos quando comparado ao hardware real. O objetivo da v0.19.0 é eliminar falhas críticas de fluxo de CPU/IRQ/render e aumentar a cobertura de testes, não declarar compatibilidade total.

Nenhuma BIOS oficial ou ROM comercial é distribuída como parte do emulador.
