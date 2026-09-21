# NEO Multi v0.1.8

Hub unificado para NEO NES, SNES Nova, NEO GB/GBC, NEO GBA e NEO Arcade com arquitetura modular.

## Executar
1. Tenha Node.js instalado.
2. Execute `npm start` na raiz.
3. Abra o endereço mostrado no terminal (porta padrão do Hub: `4780`).

No Windows também pode executar `INICIAR-NEO-MULTI.bat`.

## Núcleos desta versão
- `cores/nes/`: NEO NES v0.8.12 — core próprio, 34/34 suítes internas aprovadas.
- `cores/snes/`: SNES Nova v1.5.1 — Snes9x estável por padrão; bsnes é opção manual/experimental.
- `cores/gb/`: NEO GB/GBC v0.2.1 — EmulatorJS + Gambatte, runtime local-first com fallback CDN.
- `cores/gba/`: NEO GBA v0.19.0 — core próprio experimental, com pipeline/branch, IRQ HLE, PPU OBJ, memória e testes de boot reforçados.
- `cores/arcade/`: NEO Arcade v0.3.1 — frontend/backend para MAME/FBNeo, executáveis externos necessários.

## v0.1.8 — precisão e QA
- GBA: correção do PC arquitetural ARM/THUMB, `B`, `BL`, IRQ HLE, `IntrWait`, `VBlankIntrWait`, sprites, affine/flip, prioridades, writes de Palette/VRAM/OAM e reads desalinhados.
- GBA: novo smoke test com boot real de ROM por 120 frames, além das regressões unitárias.
- SNES: modo automático permanece no Snes9x estável; bsnes pre-release só é selecionado manualmente.
- GB/GBC: instaladores próprios para runtime local EmulatorJS 4.2.3.
- Arcade: compatibilidade deixa de ser marcada como “funcionando” apenas porque o processo ficou aberto por alguns segundos.
- QA: `npm test` agora executa health-check, GBA (regressão + boot), SNES, GB/GBC, Arcade e NES.
- Health-check diferencia falha do projeto de dependência externa ausente.

## Dependências externas
O ZIP não incorpora binários de terceiros que não estavam disponíveis para download no ambiente de build:
- SNES e GB/GBC tentam runtime EmulatorJS local primeiro e usam o CDN oficial como fallback.
- Scripts de instalação do runtime local ficam em `cores/snes/scripts/` e `cores/gb/scripts/`.
- Arcade requer que MAME/FBNeo compatíveis sejam instalados/configurados nas pastas indicadas pelo próprio frontend.

## Estrutura
- `app/`: interface única.
- `config/cores.json`: registro/versionamento dos núcleos.
- `shared/`: Core Bridge e adapters independentes.
- `scripts/health-check.js`: valida estrutura, versões, sintaxe, JSON e dependências opcionais.
- `docs/`: regras de arquitetura e evolução.

## Importante
O Hub não mistura as engines. Cada núcleo pode ser corrigido, testado, versionado e substituído de forma independente. O NEO GBA continua classificado como **experimental**: os novos testes aumentam muito a segurança contra regressões, mas não equivalem a conformidade completa com o hardware real.
