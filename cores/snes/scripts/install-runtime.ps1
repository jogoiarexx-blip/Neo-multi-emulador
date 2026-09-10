$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$StableBase = 'https://cdn.emulatorjs.org/4.2.3/data'
$BsnesBase = 'https://cdn.emulatorjs.org/4.3.0-pre/data'
$Stable = Join-Path $Root 'vendor/emulatorjs/stable-4.2.3/data'
$Bsnes = Join-Path $Root 'vendor/emulatorjs/bsnes-4.3.0-pre/data'
New-Item -ItemType Directory -Force -Path (Join-Path $Stable 'cores'),(Join-Path $Stable 'localization'),(Join-Path $Bsnes 'cores'),(Join-Path $Bsnes 'localization') | Out-Null
function Get-File($Url,$Out){ Write-Host "Baixando $Url"; Invoke-WebRequest -Uri $Url -OutFile $Out -UseBasicParsing }
function Install-UI($Base,$Dst){ Get-File "$Base/loader.js" (Join-Path $Dst 'loader.js'); $z=Join-Path $Dst 'emulator.min.zip'; Get-File "$Base/emulator.min.zip" $z; Expand-Archive -Path $z -DestinationPath $Dst -Force; Remove-Item $z -Force; try { Get-File "$Base/version.json" (Join-Path $Dst 'version.json') } catch {}; try { Get-File "$Base/localization/pt-BR.json" (Join-Path $Dst 'localization/pt-BR.json') } catch {} }
Install-UI $StableBase $Stable
'snes9x-wasm.data','snes9x-legacy-wasm.data','snes9x-thread-wasm.data','snes9x-thread-legacy-wasm.data','cores.json' | ForEach-Object { Get-File "$StableBase/cores/$_" (Join-Path $Stable "cores/$_") }
Install-UI $BsnesBase $Bsnes
'bsnes-wasm.data','bsnes-legacy-wasm.data','bsnes-thread-wasm.data','bsnes-thread-legacy-wasm.data','cores.json' | ForEach-Object { Get-File "$BsnesBase/cores/$_" (Join-Path $Bsnes "cores/$_") }
$files = Get-ChildItem (Join-Path $Root 'vendor/emulatorjs') -File -Recurse | Where-Object {$_.Name -ne 'runtime-manifest.json'} | ForEach-Object { [pscustomobject]@{ path=$_.FullName.Substring($Root.Length+1).Replace('\\','/'); size=$_.Length; sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower() } }
[pscustomobject]@{ generatedAt=(Get-Date).ToUniversalTime().ToString('o'); snes9xRuntime='EmulatorJS 4.2.3'; bsnesRuntime='EmulatorJS 4.3.0-pre pinned'; files=$files } | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Root 'vendor/emulatorjs/runtime-manifest.json') -Encoding UTF8
Write-Host 'Runtime instalado localmente.'
