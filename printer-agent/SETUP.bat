@echo off
TITLE CONFIGURADOR AGENTE DE IMPRESION - TAKEASYGO
color 0B
echo ===================================================
echo    CONFIGURADOR DEL AGENTE DE IMPRESION
echo ===================================================
echo.
echo Este programa te ayudara a configurar el agente
echo para conectarlo con tu restaurante.
echo.
echo ---------------------------------------------------
echo Verificando Node.js...
echo ---------------------------------------------------
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js no encontrado.
    echo Descargalo desde: https://nodejs.org
    pause
    exit /b 1
)
echo Node.js encontrado.
echo.
node setup.js
pause
