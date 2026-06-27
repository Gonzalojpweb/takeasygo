@echo off
TITLE BUILD - AGENTE DE IMPRESION TAKEASYGO
color 0B
echo ===================================================
echo    GENERANDO ZIP PARA DISTRIBUCION
echo ===================================================
echo.
powershell -ExecutionPolicy Bypass -File build-dist.ps1
pause
