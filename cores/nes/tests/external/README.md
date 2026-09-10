# ROMs de teste externas

Coloque aqui ROMs de teste NES obtidas legalmente (por exemplo suites de CPU/PPU/APU da comunidade).
O projeto não distribui essas ROMs.

Execute:

```bash
node tests/external-runner.mjs
```

O runner reconhece o protocolo comum de testes blargg quando a ROM expõe a assinatura em $6001-$6003 e o status em $6000. Para outras ROMs, ele roda um limite de frames e gera CRC/hash do framebuffer para regressão manual.
