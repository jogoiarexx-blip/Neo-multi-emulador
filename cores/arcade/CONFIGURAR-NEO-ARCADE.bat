@echo off
setlocal
title NEO ARCADE v0.2.9 - Configuracao inicial
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js nao foi encontrado.
 echo Instale o Node.js LTS e execute novamente.
 pause
 exit /b 1
)
if not exist roms mkdir roms
if not exist bios mkdir bios
if not exist logs mkdir logs
if not exist states mkdir states
if not exist screenshots mkdir screenshots
if not exist artwork mkdir artwork
echo Estrutura verificada.
echo Coloque suas ROMs em: %cd%\roms
pause
