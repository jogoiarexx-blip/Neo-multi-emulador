
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath("Desktop")
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut((Join-Path $desktop "NEO ARCADE.lnk"))
$sc.TargetPath = (Join-Path $root "INICIAR-NEO-ARCADE.bat")
$sc.WorkingDirectory = $root
$sc.Save()
Write-Host "Atalho criado na Area de Trabalho."
