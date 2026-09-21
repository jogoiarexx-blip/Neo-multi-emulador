$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Base = 'https://cdn.emulatorjs.org/4.2.3/data'
$Dst = Join-Path $Root 'vendor/emulatorjs/stable-4.2.3/data'
New-Item -ItemType Directory -Force -Path (Join-Path $Dst 'cores'),(Join-Path $Dst 'localization') | Out-Null
function Get-File($Url,$Out){ Write-Host "Baixando $Url"; Invoke-WebRequest -Uri $Url -OutFile $Out -UseBasicParsing }
Get-File "$Base/loader.js" (Join-Path $Dst 'loader.js')
$z=Join-Path $Dst 'emulator.min.zip'; Get-File "$Base/emulator.min.zip" $z; Expand-Archive -Path $z -DestinationPath $Dst -Force; Remove-Item $z -Force
try { Get-File "$Base/version.json" (Join-Path $Dst 'version.json') } catch {}
try { Get-File "$Base/localization/pt-BR.json" (Join-Path $Dst 'localization/pt-BR.json') } catch {}
'gb-wasm.data','gb-legacy-wasm.data','gb-thread-wasm.data','gb-thread-legacy-wasm.data','cores.json' | ForEach-Object {
  try { Get-File "$Base/cores/$_" (Join-Path $Dst "cores/$_") } catch { Write-Warning "Arquivo opcional não encontrado: $_" }
}
Write-Host 'Runtime GB/GBC instalado localmente.'
