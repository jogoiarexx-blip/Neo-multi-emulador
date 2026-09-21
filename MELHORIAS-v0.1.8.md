# NEO Multi v0.1.8 — correções e melhorias

## Resultado desta revisão
A v0.1.8 foi produzida após uma segunda auditoria do pacote v0.1.7. O foco foi eliminar falsos positivos de QA, corrigir falhas críticas do core GBA e tornar o estado das dependências externas explícito.

## GBA — NEO GBA v0.19.0

### CPU ARM7TDMI
- Corrigido o PC arquitetural em ARM e THUMB.
- Corrigidos `ARM B`, `ARM BL`, `THUMB B` e o par de instruções `THUMB BL`.
- Corrigido o valor de LR em chamadas com link.
- Leituras de `r15` em data-processing, load/store e operações high-register passam a considerar pipeline.
- Adicionados testes específicos para branch, link e leitura de PC.

### IRQ / BIOS HLE
- Separada a condição de IRQ pendente bruta (`IE & IF`) da condição de serviço mascarada por `IME`.
- HALT/IntrWait podem acordar pela condição de interrupção apropriada sem confundir isso com entrada no handler.
- Adicionado despacho HLE para o handler configurado pelo jogo em `0x03007FFC` quando BIOS real não está carregada.
- Retorno do handler restaura contexto salvo e evita cair em BIOS vazia.
- Adicionadas flags BIOS IRQ em `0x03007FF8`.
- `IntrWait` e `VBlankIntrWait` receberam comportamento HLE funcional.
- BIOS real continua sendo respeitada quando carregada.

### PPU / sprites
- Corrigido crash por `sampleLine` inexistente no renderer OBJ.
- Corrigida leitura dos bits de OBJ mode.
- Implementados/fortalecidos: flip H/V, affine, double-size, mosaic, tile mapping 1D/2D, 4bpp/8bpp, prioridade OBJ/BG e semi-transparência básica.
- Composição de linha agora guarda prioridade/cor/bit de BG e prioridade de OBJ.
- Modos bitmap passam a respeitar enable/prioridade de BG2.
- Corrigido mask padrão de window quando nenhuma window está ativa.

### Memória e estado
- Byte-write em Palette/VRAM replica o byte no barramento de 16 bits.
- Byte-write em OAM é ignorado.
- Escritas diretas de 16 bits em Palette/VRAM/OAM foram preservadas corretamente.
- `read32` desalinhado ganhou rotação compatível com o comportamento esperado do ARM7TDMI.
- Save state passou para schema v3 e preserva mais estado de IRQ/HLE.

### Testes GBA
- `core-regression.mjs` cobre branch ARM/THUMB, LR, PC, memória, IRQ HLE e OBJ smoke.
- `boot-smoke.mjs` executa uma ROM por 120 frames e verifica avanço de PPU, faixa válida de PC e instruções não suportadas.
- Stress adicional desta build: 600 frames, PC em `0x08004E0A`, 0 instruções não suportadas no percurso testado.

> O core próprio continua experimental. Ainda não há promessa de precisão total para todos os jogos, áudio, periféricos, BIOS e timings.

## SNES — SNES Nova v1.5.1
- O modo automático mantém Snes9x estável como padrão.
- bsnes permanece disponível manualmente como opção experimental/alta precisão; o auto não migra para runtime pre-release.
- Versão de UI, cache/service worker, diagnóstico e backup sincronizada em 1.5.1.
- Smoke test Node incluído no `npm test`.
- Runtime continua local-first com fallback CDN quando não instalado.

## GB / GBC — v0.2.1
- Mantido Gambatte via EmulatorJS com estratégia local-first.
- Adicionados instaladores próprios do runtime em `cores/gb/scripts/`.
- Adapter mantém API-first e controles visuais apenas como fallback.
- Smoke test incluído no `npm test`.

## Arcade — v0.3.1
- Removida a heurística que marcava um core como “working” somente por permanecer aberto por 5 segundos.
- Execuções curtas/exit code de erro passam a alimentar falha; execução normal/encerramento solicitado exige tempo mínimo antes de alimentar compatibilidade aprendida.
- Mantidos bloqueio de sessão concorrente e tratamento explícito de erro de `spawn`.
- Hub e servidor Arcade standalone usam portas distintas: 4780 e 4781.
- Smoke test incluído no `npm test`.

## NES — v0.8.12
- Core preservado para não introduzir regressões desnecessárias.
- Resultado atual: 34/34 suítes internas aprovadas.
- A infraestrutura para ROMs externas de conformidade continua pronta, mas o pacote não possui um conjunto externo adicional instalado.

## QA do Hub
`npm test` agora executa:
1. health-check de versões, arquivos, sintaxe e JSON;
2. regressão + boot real do GBA;
3. smoke do SNES;
4. smoke do GB/GBC;
5. smoke do Arcade;
6. todas as 34 suítes do NES.

O health-check diferencia **falha** de **dependência externa ausente**. Nesta build, o esperado é `0 falhas / 3 avisos`: runtime local SNES ausente, runtime local GB ausente e executáveis Arcade externos ausentes.

## Validação de servidor
- Hub: `http://127.0.0.1:4780` — HTTP 200.
- Arcade standalone: `http://127.0.0.1:4781` — HTTP 200.
- Hub envia COOP/COEP/Origin-Agent-Cluster para recursos WebAssembly/isolamento.

## Limitações conhecidas
- O runtime EmulatorJS local não foi incorporado automaticamente nesta build; SNES/GB usam fallback CDN até a instalação pelos scripts fornecidos.
- MAME/FBNeo/MAME2003+ não são redistribuídos no ZIP; o Arcade requer executáveis externos compatíveis.
- NEO GBA ainda é experimental e necessita expansão contínua de precisão de PPU/APU/BIOS/timings e testes de compatibilidade por jogo.
- Os backends Arcade do Hub e standalone ainda compartilham grande quantidade de lógica duplicada. A unificação em módulo único ficou como dívida técnica para evitar uma refatoração de alto risco na mesma build que alterou CPU/PPU do GBA.
