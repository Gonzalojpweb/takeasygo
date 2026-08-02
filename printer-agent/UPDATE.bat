@echo off
setlocal EnableExtensions EnableDelayedExpansion

title ACTUALIZADOR AGENTE DE IMPRESION - TAKEASYGO
color 0B

echo ===================================================
echo    ACTUALIZADOR AUTOMATICO - TAKEASYGO
echo ===================================================
echo.
echo Este script actualiza el agente de impresion a la
echo ultima version con soporte de modo imagen.
echo.

echo ===================================================
echo    PASO 0: Verificando archivos necesarios
echo ===================================================
echo.

set "MISSING=0"

if not exist "ticket-renderer.js" (
    echo [FALTA] ticket-renderer.js
    set "MISSING=1"
)

if not exist "raster-encoder.js" (
    echo [FALTA] raster-encoder.js
    set "MISSING=1"
)

if not exist "agent.js.new" (
    echo [FALTA] agent.js.new
    set "MISSING=1"
)

if not exist "package.json.new" (
    echo [FALTA] package.json.new
    set "MISSING=1"
)

if "!MISSING!"=="1" (
    echo.
    echo ERROR: Faltan archivos para la actualizacion.
    pause
    exit /b 1
)

echo Todos los archivos presentes.

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
echo    PASO 2: Respaldando archivos
echo ===================================================
echo.

if exist "agent.js" (
    copy /Y "agent.js" "agent.js.bak" >nul
    echo Backup agent.js
)

if exist "package.json" (
    copy /Y "package.json" "package.json.bak" >nul
    echo Backup package.json
)

echo.
echo ===================================================
echo    PASO 3: Copiando archivos
echo ===================================================
echo.

copy /Y "agent.js.new" "agent.js"
if errorlevel 1 goto copyerror

copy /Y "package.json.new" "package.json"
if errorlevel 1 goto copyerror

echo Archivos copiados correctamente.

echo.
echo ===================================================
echo    PASO 4: Instalando dependencias
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
echo    PASO 5: Eliminando temporales
echo ===================================================
echo.

if exist "agent.js.new" del /q "agent.js.new"
if exist "package.json.new" del /q "package.json.new"

echo.
echo ===================================================
echo    PASO 6: Verificando modulos
echo ===================================================
echo.

node -e "require('./ticket-renderer');require('./raster-encoder');console.log('OK');"

if errorlevel 1 (
    echo.
    echo ERROR cargando modulos.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo    PASO 7: Reiniciando servicio
echo ===================================================
echo.

sc query "Takeasygo Printer Agent" >nul 2>&1

if errorlevel 1 (
    echo Servicio no instalado.
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

:copyerror
echo.
echo ERROR copiando archivos.
pause
exit /b 1
