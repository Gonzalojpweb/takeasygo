@echo off
chcp 65001 >nul 2>&1
TITLE DIAGNOSTICO IMPRESORA FISCAL - TAKEASYGO
cd /d "%~dp0"
node fiscal-drivers\diagnose.js
pause
