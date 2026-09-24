@echo off
setlocal EnableExtensions EnableDelayedExpansion

title ACTUALIZADOR AGENTE DE IMPRESION - TAKEASYGO
color 0B

echo ===================================================
echo    ACTUALIZADOR AUTOMATICO - TAKEASYGO
echo ===================================================
echo.
echo Coloca los archivos nuevos agent.js y package.json
echo en esta carpeta y ejecuta este script.
echo.

echo ===================================================
echo    PASO 1: Deteniendo servicio
echo ===================================================
echo.

sc query "Takeasygo Printer Agent" >nul 2>&1

if errorlevel 1 (
    echo Servicio no instalado. Se continua...
) else (
    echo Deteniendo servicio...
    net stop "Takeasygo Printer Agent"
    timeout /t 3 /nobreak >nul
)

echo.
echo ===================================================
echo    PASO 2: Respaldando archivos actuales
echo ===================================================
echo.

if exist "agent.js" (
    copy /Y "agent.js" "agent.js.bak" >nul
    echo Backup agent.js -^> agent.js.bak
)

if exist "package.json" (
    copy /Y "package.json" "package.json.bak" >nul
    echo Backup package.json -^> package.json.bak
)

echo.
echo ===================================================
echo    PASO 3: Instalando dependencias
echo ===================================================
echo.

where pnpm >nul 2>&1

if errorlevel 1 (
    echo Instalando pnpm...
    call npm install -g pnpm
)

call pnpm install

if errorlevel 1 (
    echo.
    echo ERROR instalando dependencias.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo    PASO 4: Verificando version
echo ===================================================
echo.

node -e "const v=require('./package.json').version;console.log('Version instalada:',v);"

if errorlevel 1 (
    echo.
    echo ERROR verificando agente.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo    PASO 5: Reiniciando servicio
echo ===================================================
echo.

sc query "Takeasygo Printer Agent" >nul 2>&1

if errorlevel 1 (
    echo Servicio no instalado. Inicia manualmente con start.bat
) else (
    net start "Takeasygo Printer Agent"
)

echo.
echo ===================================================
echo    ACTUALIZACION COMPLETADA
echo ===================================================
echo.
echo Listo.
pause
exit /b 0
