# NEO ARCADE v0.3.1

## Configuração inicial no Windows

- assistente de primeira execução;
- verifica pasta ROMs;
- conta ROMs detectadas;
- verifica cores instalados;
- mostra status de BIOS;
- informa se está pronto para jogar;
- `CONFIGURAR-NEO-ARCADE.bat` prepara/verifica as pastas;
- `CRIAR-ATALHO.ps1` cria atalho na Área de Trabalho.

Mantido: paginação/filtros, cache incremental, compatibilidade aprendida, fallback, diagnóstico, MAME index, save states, artwork, controles e modo gabinete.

## v0.3.1 — validação de execução
- O backend não marca mais um core como compatível apenas por permanecer aberto durante alguns segundos.
- Execução curta/exit code de erro pode ser registrada como falha; encerramento normal ou solicitado pelo usuário exige tempo mínimo antes de alimentar a compatibilidade aprendida.
- O launcher mantém proteção contra múltiplas sessões concorrentes e tratamento explícito de erro de `spawn`.
