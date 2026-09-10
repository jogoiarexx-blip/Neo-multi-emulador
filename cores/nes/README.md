# NEO NES v0.8.12 — Interface & Functionality Refresh

Esta versão preserva o núcleo da v0.8.10 e reorganiza a experiência de uso.

## Destaques
- Navegação por áreas: Início, Jogar, Biblioteca, Ajustes, Saves e Ferramentas.
- Interface responsiva com barra inferior no celular.
- Tela de jogo e toolbar mais focadas.
- Biblioteca e filtros mais claros.
- Paleta de comandos com Ctrl+K.
- Feedback visual de status por toast.
- Última área aberta é lembrada.
- Ao abrir/iniciar uma ROM, a interface muda automaticamente para Jogar.
- Compatibilidade de configurações com v0.8.10.
- Todo o núcleo, FDS, NSF/NSFe, mappers, debugger, WebGL2, saves e 12 jogos permanecem.

# NEO NES v0.8.12 — Namco 163 & VRC7 Expansion Pack

A v0.8.12 evolui diretamente a v0.8.9 sem recriar o core. O foco desta revisão é ampliar a compatibilidade com dois chips importantes de Famicom/NES e integrar o áudio de expansão ao mixer já existente, preservando FDS, NSF/NSFe, Four Score, Zapper, debugger, WebGL2 e os 12 jogos incluídos.

## Mapper 19 — Namco 163

- PRG banking de 8 KB;
- CHR banking de 1 KB;
- controle de nametables;
- PRG-RAM;
- IRQ de 15 bits;
- RAM de áudio acessível por `$F800/$4800`;
- auto-incremento do endereço de áudio;
- síntese wavetable de até 8 canais integrada em `expansionAudioSample()`;
- estado completo em Save State/Rewind.

O áudio N163 preserva a organização de registradores e wavetable, mas ainda é uma aproximação do multiplexing analógico real.

## Mapper 85 — Konami VRC7

- PRG banking de 8 KB;
- CHR banking de 1 KB;
- PRG-RAM;
- mirroring;
- IRQ em modo ciclo/scanline aproximado;
- interface de registradores FM `$9010/$9030`;
- 6 canais de áudio VRC7 integrados ao mixer;
- estado completo em Save State/Rewind.

A interface FM e os principais controles de frequência/key/volume estão implementados. A síntese FM ainda é **experimental** e não é anunciada como YM2413/VRC7 bit-perfect.

## Compatibilidade

O conjunto de mappers implementados agora inclui também **19 (Namco 163)** e **85 (VRC7)**. O diagnóstico do emulador reconhece ambos e identifica o áudio de expansão correspondente.

## Testes

Execute:

```bash
node tests/run-all.mjs
```

Resultado desta versão: **32/32 suítes aprovadas**.

A nova suíte `tests/v0810-n163-vrc7.mjs` valida:

- banking PRG/CHR N163;
- acesso à RAM de áudio N163;
- IRQ N163;
- saída de áudio N163;
- banking PRG/CHR VRC7;
- registradores FM VRC7;
- IRQ VRC7;
- saída de áudio VRC7;
- Save/Restore dos dois mappers.

Os golden frames dos 12 jogos embutidos permanecem inalterados.

---


A v0.8.12 evolui diretamente a v0.8.8. O foco desta revisão é tornar o Famicom Disk System mais fiel e mais seguro para uso prolongado, sem alterar o core NES estável nem remover NSF/NSFe, Four Score, Zapper, WebGL2, debugger ou os 12 jogos incluídos.

## Melhorias FDS

- interpretação revisada dos registradores `$4023` e `$4025`;
- enable de I/O de disco e de áudio tratados separadamente;
- estados de scan, motor, read/write, mirroring, CRC/transfer e IRQ separados;
- intervalo de transferência modelado como 149⅓ ciclos de CPU por byte;
- escrita em `$4024` e leitura em `$4031` reconhecem/limpam IRQ de transferência;
- status `$4032` diferencia disco ejetado, drive não pronto e write-protect;
- contadores internos de transferências, IRQ de disco e IRQ de timer para diagnóstico;
- sugestão do próximo lado quando o fim do lado atual é alcançado.

## Áudio FDS

- master sound enable de `$4023` aplicado;
- wavetable `$4040-$407F` refinada;
- volume/master em `$4089` corrigido;
- `$4083` passa a tratar halt/envelope em vez de usar bits incorretamente como volume;
- envelope de volume e envelope de modulação separados;
- período de envelope usa o fator de 8 ciclos;
- tabela de modulação passa a usar 32 entradas e avanço próprio;
- clock da wavetable/modulação refinado para blocos de 16 ciclos.

O áudio ainda não é anunciado como bit-perfect; esta revisão reduz aproximações sem criar hacks específicos por jogo.

## Persistência de disco

O autosave FDS não precisa mais guardar a imagem completa do disco quando poucos bytes mudaram.

Agora o formato `NEO-FDS-PERSIST-v2` mantém patches de páginas modificadas de 256 bytes. Isso reduz tamanho de escrita no IndexedDB e preserva compatibilidade de leitura com o formato anterior que guardava `diskData` completo.

## Testes

Execute:

```bash
node tests/run-all.mjs
```

Resultado desta versão: **31/31 suítes aprovadas**.

A nova suíte `tests/v089-fds-accuracy.mjs` valida:

- enable separado de disco/som;
- semântica de `$4025`;
- transferência em 149⅓ ciclos;
- acknowledge de IRQ;
- status de eject/write-protect;
- enable de áudio;
- persistência por patches;
- state FDS v2.

Os golden frames dos 12 jogos NES permanecem inalterados.

## NEO NES v0.8.12 — Rendering Quality Pass

Esta revisão melhora apenas a camada de apresentação. O framebuffer lógico 256×240 do NES e o core CPU/PPU/APU não foram alterados.

- pipeline de cor migrado para o shader WebGL2 (brilho, contraste, saturação e gamma);
- Sharp Bilinear pixel-aware com controle de nitidez;
- Composite NTSC com bleed horizontal de chroma/luma e pequena modulação de fase;
- CRT com beam scanlines, shadow mask, glow por amostras vizinhas e vignette;
- LCD com subpixels leves;
- novos controles Gamma e Nitidez GPU, persistidos globalmente e por ROM;
- fallback Canvas 2D preservado;
- compatibilidade retroativa da API do renderer preservada;
- suíte v0.8.12 adicionada ao regression runner.

Validação: 34/34 suítes aprovadas e golden frames dos 12 jogos inalterados.
