@echo off
cd /d "%~dp0"
title NEO Multi
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale Node.js LTS e tente novamente.
  pause
  exit /b 1
)
node server.js
pause
