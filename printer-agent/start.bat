@echo off
TITLE AGENTE DE IMPRESION - MEETING RESTOBAR
color 0A
echo ===================================================
echo    INICIANDO AGENTE DE IMPRESION - MEETING
echo ===================================================
echo.
echo Verificando instalacion...
if not exist node_modules (
    echo Primera vez detectada. Instalando librerias...
    call npm install
)

echo.
echo Iniciando servicio...
echo Para detener presiona CTRL + C
echo.
node agent.js
pause
