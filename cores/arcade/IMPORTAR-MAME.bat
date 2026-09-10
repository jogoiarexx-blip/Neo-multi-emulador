@echo off
title NEO ARCADE - Importar indice MAME
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js nao foi encontrado.
 pause
 exit /b 1
)
node tools\import-mame.js
echo.
echo Importacao concluida. Reinicie ou atualize o NEO ARCADE.
pause
