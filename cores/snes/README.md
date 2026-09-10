## Sistema de conquistas v1.5.0

- conquistas globais e por jogo
- XP, níveis, raridades e progresso
- notificações com som
- Doom, Final Fight e Final Fight 3 com conjuntos próprios
- persistência local e espelho IndexedDB
- backup/importação de conquistas
- infraestrutura declarativa para futuras conquistas por memória, sem endereços inventados

## Novidades da v1.5.0

- menu estilo console com navegação rápida
- preview animado dos jogos
- fundo dinâmico por jogo
- sons de interface configuráveis
- capas automáticas e personalizáveis para a biblioteca local

# SNES Nova v1.5.0

Frontend web/PWA para emulação SNES baseado em EmulatorJS.


## Jogo integrado na v1.5.0

- Final Fight 3 (Capcom, 1995)
- ROM normalizada sem copier header de 512 bytes
- CRC32: `8E6F0065`
- SHA-1: `A88AFD142CE4683DF2A5B2B1A06EAEA698E114F9`
- SHA-256: `F388115A96DCA534B8D7BA2B9A26E6C3C43877BCB8AF27C76C37C851EEB294AD`
- Core recomendado: `snes9x`

## Destaques v1.5.0
- Biblioteca IndexedDB com análise SHA-1/CRC32 e ROMs ZIP extraídas em memória.
- Top 10 de clássicos com associação da ROM do próprio usuário (ROMs comerciais não são distribuídas).
- Doom e Final Fight continuam integrados conforme arquivos fornecidos ao projeto.
- Parser de ROM ampliado: mapper, região, SRAM, checksum, copier header e chips especiais.
- Watchdog de inicialização do core, logs internos e diagnóstico ao vivo/exportável.
- Modo TV com navegação básica por gamepad e controles touch em telas móveis.
- Armazenamento persistente, gerenciador de cache e uso estimado.
- Perfis experimentais bsnes: run-ahead, HD Mode 7 e overclock somente quando o core expuser as opções.
- Service Worker v0.8 com timeout de navegação, caches separados e atualização versionada.
- Snes9x fixado no runtime EmulatorJS 4.2.3 via CDN quando runtime local não existir.

## GitHub Pages
Publique o conteúdo desta pasta na raiz do repositório. GitHub Pages funciona normalmente; threads WASM dependem de COOP/COEP e podem ficar indisponíveis.

## Runtime local
Se desejar independência total de CDN, coloque uma distribuição compatível do EmulatorJS em `vendor/emulatorjs/data/`. O app detecta automaticamente.

## ROMs
Não inclua ROMs comerciais sem autorização. O Top 10 serve como catálogo e permite associar arquivos que o usuário possui legalmente.


## Runtime local / GitHub Pages

A v1.5.0 separa os runtimes para evitar misturar cores incompatíveis:

- Snes9x: EmulatorJS 4.2.3 estável.
- bsnes: runtime EmulatorJS 4.3.0-pre compatível com o core bsnes.

No GitHub, mantenha `.github/workflows/pages.yml` e ative **Settings → Pages → Source: GitHub Actions**. O workflow executa `scripts/install-runtime.sh`, baixa os arquivos oficiais, valida os cores e publica o site com `vendor/emulatorjs/...` local.

No Windows, para preencher o runtime antes de um upload manual:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-runtime.ps1
```

O arquivo `vendor/emulatorjs/runtime-manifest.json` é gerado pelo instalador com tamanho e SHA-256 de cada arquivo baixado.


## SNES Nova Engine v1

A versão 1.5.0 adiciona uma camada de engine própria acima do EmulatorJS e dos cores Snes9x/bsnes. Ela detecta WASM SIMD, WebGL2, threads, Workers, OffscreenCanvas e AudioWorklet; cria um perfil de hardware não identificável; aprende o core por jogo+dispositivo; pré-carrega o runtime em idle; move hashing, ZIP e patches para Web Workers quando possível; oferece pós-processamento WebGL2 real; sincroniza o polling de gamepad com `requestAnimationFrame`; e prepara caminhos para builds WebAssembly customizados.

### Builds customizados

`scripts/core-build/build-custom-cores.sh` exige Emscripten (`emcc`) e commits upstream explicitamente fixados em `scripts/core-build/core-lock.env`. Sem um build aprovado, a engine continua usando os runtimes locais versionados Snes9x/bsnes já suportados pelo projeto.

### Pós-processamento GPU

Em hardware forte, a opção **Pós-processamento WebGL2** pode espelhar o framebuffer do core para um segundo canvas WebGL2 e aplicar brilho, contraste, saturação, gamma e scanlines na GPU. Em hardware classificado como fraco, fica desligada por padrão para não duplicar trabalho gráfico.

## Mobile v1.5.0

- Modo Jogo com fullscreen/landscape quando o navegador permite.
- Safe Area para iPhone/iPad e layout com `100dvh`.
- Controles touch com multitouch por `pointerId`, tamanho/opacidade configuráveis e vibração opcional.
- Perfil Mobile Auto (bateria/equilibrado/qualidade) e proteção de desempenho sustentado.
- Oculta controles touch quando um gamepad é conectado, opcionalmente.
- Perfil bateria desativa pós-processamento extra e prioriza Snes9x no modo automático.
- A proteção térmica é inferida por degradação sustentada de FPS/stutter; navegadores não expõem temperatura física do aparelho.

## Correção v1.5.0 — Final Fight 3 visível

- Corrigido o contador da seção **Já instalados** para 3 jogos.
- Final Fight 3 aparece no mesmo grid de Doom e Final Fight.
- Scripts principais usam cache-busting `?v=1.5.0` para impedir que um Service Worker antigo esconda o novo jogo.
- `app.js` e `advanced.js` passam a usar Network First no Service Worker.
- Adicionado `data/installed-games.json` como manifesto explícito dos jogos embutidos.
