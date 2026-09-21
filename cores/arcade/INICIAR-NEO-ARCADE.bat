@echo off
title NEO ARCADE v0.3.1
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js nao foi encontrado.
 echo Instale o Node.js LTS e execute este arquivo novamente.
 pause
 exit /b 1
)
start "" "http://127.0.0.1:4781"
node server.js
pause
