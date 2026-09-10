# v0.8.12 — UI audit

- Nenhum ID funcional foi removido.
- A nova navegação usa apenas classes adicionais e um shell independente.
- O core não foi modificado para fins visuais.
- Configurações v40 são migradas para v41 antes do main.js iniciar.
- WebGL2/Canvas, PPU/APU/CPU e mappers permanecem desacoplados da UI.

# NEO NES v0.8.12 — Technical Audit

## Escopo desta revisão

A v0.8.12 preserva o core NES da v0.8.6 e adiciona formatos de mídia sem misturar lógica de cartucho com interface. Foram adicionados módulos isolados `nsf-player.js` e `fds-support.js`.

### Decisões de arquitetura

- NSF/NSFe usa a CPU 2A03/APU existente e um cartucho virtual próprio; não duplica o core de áudio.
- O player chama INIT/PLAY com watchdog e mantém CPU/APU rodando entre chamadas.
- Banking NSF de 4 KB fica isolado no cartucho virtual.
- FDS nesta etapa é parser/BIOS/side-management. Drive, IRQ, escrita e áudio FDS não são anunciados como completos.
- O fluxo de ROM `.nes` continua intacto.
- PWA recebeu cache explícito dos novos módulos.

### Riscos conhecidos

- Expansion audio declarado por NSF/NSFe ainda não é roteado pelo cartucho virtual; o player informa isso na UI em vez de produzir áudio incorreto silenciosamente.
- NSFe implementa os chunks centrais (INFO/DATA/BANK/auth/tlbl/time/fade); chunks opcionais desconhecidos são ignorados com segurança.
- FDS exige BIOS de 8192 bytes e ainda não executa jogos nesta revisão.

### Regressão

A suíte completa inclui os 12 jogos, golden frames, CPU/PPU/APU, mappers, debugger, saves, Four Score/Zapper e os novos testes NSF/NSFe/FDS.

Base: v0.7.10.

## Mudanças estruturais
1. PPU ganhou `ppuPeek()` e Cartridge `ppuPeek()` para inspeção sem clockar A12/IRQ.
2. Debugger ganhou breakpoints de eventos NMI/IRQ/Sprite0.
3. Save manager passou de 5 para 10 slots, mantendo IndexedDB e compatibilidade de slots antigos.
4. Metadata de novos saves inclui thumbnail e playTimeMs.
5. PPU viewer foi isolado em módulo próprio e só executa sob demanda no Dev Mode.

## Performance
Os viewers não atualizam automaticamente no loop principal. Nenhuma leitura gráfica adicional é feita durante gameplay normal.


## v0.8.4 — Video & Latency Pass
- Renderização continua desacoplada do framebuffer 256×240.
- Overscan é apresentação, nunca mutação de VRAM/PPU.
- WebGL2 ganhou crop por UV para evitar canvas intermediário adicional.
- Integer scaling Auto calcula escala inteira 1×–6× conforme viewport.
- Run-ahead 2 frames permanece experimental e pode ser desativado pelo perfil seguro/compatibilidade.
- Profiler mede custo do polling de input para diagnóstico de latência.


## v0.8.4
Performance profiles are presentation-only. Adaptive audio uses worklet queue statistics and does not alter APU timing.


## v0.8.6 audit
- Corrigido write amplification: SRAM não é mais escrita a cada segundo quando inalterada.
- `beforeunload` não é tratado como garantia de persistência; `visibilitychange` e `pagehide` agora fazem flush adicional.
- Service Worker deixa a atualização em waiting até ação do usuário, preservando o IndexedDB.
- Crash report é estritamente local e opt-in para cópia.

## v0.8.12 — FDS Core

- FDS deixou de ser somente parser/BIOS e passou a ser um dispositivo de barramento executável.
- O roteamento do Bus foi ampliado especificamente para registradores FDS abaixo de `$6000`, sem mudar o comportamento dos cartuchos comuns.
- Persistência de disco usa detecção de escrita (`diskDirty`) para evitar hashing/gravação da imagem inteira a cada segundo.
- O áudio FDS entra pela interface já existente `expansionAudioSample()`, preservando a arquitetura APU.
- O drive usa cadência aproximada de 150 ciclos de CPU por byte; precisão física/CRC deve ser refinada em versões futuras.
- A suíte total passou em 30/30, incluindo os 12 golden/smoke regressions existentes.

## v0.8.12 — FDS Accuracy & Persistence

A auditoria da v0.8.8 encontrou três pontos de correção prioritários no FDS:

1. `$4025` ainda usava uma interpretação simplificada de scan/motor/read-write;
2. `$4023` não separava corretamente o enable dos registradores de disco e do bloco de som;
3. persistência de disco retornava a imagem FDS inteira mesmo quando apenas poucos bytes tinham sido alterados.

A v0.8.12 corrige esses pontos. O drive passa a usar acumulador de terços de ciclo para representar 149⅓ ciclos por byte e a persistência passa a registrar páginas modificadas de 256 bytes.

No áudio, os registradores `$4080-$408A` foram reorganizados para separar volume envelope, modulation envelope, master volume e estados de halt. A tabela de modulação agora usa 32 entradas e clocks em blocos de 16 ciclos.

### Limites ainda conhecidos

- fluxo físico de gaps/CRC do disco continua abstraído;
- bouncing e tempos mecânicos reais de inserção/rewind não são simulados analogicamente;
- watchdog DRAM do RAM Adapter não é emulado;
- áudio FDS ainda não é bit-perfect, especialmente em detalhes finos do algoritmo de modulação.

Esses limites estão documentados para evitar classificar o FDS como perfeito antes dos test ROMs apropriados.


## v0.8.12 — N163/VRC7 audit

- Mapper 19 exigiu uma extensão controlada do Bus para leituras abaixo de `$6000` (`$4800/$5000/$5800`). O roteamento é ativado somente quando o cartucho atual é Mapper 19, preservando o comportamento dos demais cartuchos.
- N163 usa a interface de áudio já existente do Cartridge (`expansionAudioSample()`), evitando acoplamento novo entre mapper e APU.
- Mapper 85 mantém o mesmo contrato de IRQ/banking dos demais mappers e expõe o VRC7 pela mesma interface de áudio de expansão.
- A síntese VRC7 desta versão é deliberadamente marcada como experimental. Ela preserva key/frequency/block/volume dos seis canais, mas ainda não implementa operadores/patches do YM2413 em nível bit-perfect.
- Nenhum schema global de Save State precisou mudar: os novos estados vivem dentro de `mapperState`; o schema permanece v37.
- A regressão completa terminou em 32/32 suítes, e os 12 golden frames permaneceram iguais.
