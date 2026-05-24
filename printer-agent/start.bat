@echo off
TITLE AGENTE DE IMPRESION - TAKEASYGO
color 0A
echo ===================================================
echo    INICIANDO AGENTE DE IMPRESION - TAKEASYGO
echo ===================================================
echo.
echo Verificando instalacion...
where pnpm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Instalando pnpm...
    call npm install -g pnpm
)
if not exist node_modules (
    echo Primera vez detectada. Instalando librerias...
    call pnpm install
)

echo.
echo Iniciando servicio...
echo Para detener presiona CTRL + C
echo.
node agent.js
pause
