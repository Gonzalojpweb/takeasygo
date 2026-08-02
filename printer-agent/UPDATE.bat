@echo off
TITLE ACTUALIZADOR AGENTE DE IMPRESION - TAKEASYGO
color 0B
echo ===================================================
echo    ACTUALIZADOR AUTOMATICO - TAKEASYGO
echo ===================================================
echo.
echo Este script actualiza el agente de impresion a la
echo ultima version con soporte de modo imagen.
echo.
echo ===================================================
echo    PASO 0: Verificando archivos necessarios
echo ===================================================
echo.

setlocal enabledelayedexpansion

set "MISSING=0"

if not exist "ticket-renderer.js" (
    echo  [FALTA] ticket-renderer.js
    set "MISSING=1"
)
if not exist "raster-encoder.js" (
    echo  [FALTA] raster-encoder.js
    set "MISSING=1"
)
if not exist "agent.js.new" (
    echo  [FALTA] agent.js.new ^(copia el agent.js actualizado como agent.js.new^)
    set "MISSING=1"
)
if not exist "package.json.new" (
    echo  [FALTA] package.json.new ^(copia el package.json actualizado como package.json.new^)
    set "MISSING=1"
)

if "%MISSING%"=="1" (
    echo.
    echo  ---------------------------------------------------
    echo  ERROR: Faltan archivos para la actualizacion.
    echo.
    echo  Copia estos archivos en la carpeta del agente
    echo  ANTES de ejecutar UPDATE.bat:
    echo.
    echo    agent.js.new      ^(del ZIP de la nueva version^)
    echo    package.json.new  ^(del ZIP de la nueva version^)
    echo    ticket-renderer.js ^(del ZIP de la nueva version^)
    echo    raster-encoder.js  ^(del ZIP de la nueva version^)
    echo  ---------------------------------------------------
    echo.
    pause
    exit /b 1
)

echo  Todos los archivos presentes.
echo.
echo ===================================================
echo    PASO 1: Deteniendo servicio
echo ===================================================
echo.

sc query "Takeasygo Printer Agent" >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo  Deteniendo servicio...
    net stop "Takeasygo Printer Agent" >nul 2>nul
    timeout /t 3 /nobreak >nul
    echo  Servicio detenido.
) else (
    echo  Servicio no encontrado (puede que no este instalado).
)

echo.
echo ===================================================
echo    PASO 2: Respaldando archivos actuales
echo ===================================================
echo.

if exist "agent.js" (
    copy /Y "agent.js" "agent.js.bak" >nul
    echo  + agent.js.bak (respaldo)
)
if exist "package.json" (
    copy /Y "package.json" "package.json.bak" >nul
    echo  + package.json.bak (respaldo)
)

echo.
echo ===================================================
echo    PASO 3: Aplicando actualizacion
echo ===================================================
echo.

copy /Y "agent.js.new" "agent.js" >nul
echo  + agent.js (actualizado)

copy /Y "package.json.new" "package.json" >nul
echo  + package.json (actualizado)

copy /Y "ticket-renderer.js" "ticket-renderer.js" >nul
echo  + ticket-renderer.js (nuevo)

copy /Y "raster-encoder.js" "raster-encoder.js" >nul
echo  + raster-encoder.js (nuevo)

echo.
echo ===================================================
echo    PASO 4: Instalando dependencias
echo ===================================================
echo.

where pnpm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  Instalando pnpm...
    call npm install -g pnpm
)

echo  Ejecutando pnpm install...
echo  ^(Esto puede demorar 30-60 segundos^)
echo.
call pnpm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo  ---------------------------------------------------
    echo  ERROR: pnpm install fallo.
    echo  Revisa los errores arriba.
    echo  ---------------------------------------------------
    echo.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo    PASO 5: Limpiando archivos temporales
echo ===================================================
echo.

del /Q "agent.js.new" 2>nul
del /Q "package.json.new" 2>nul
echo  Limpiados: agent.js.new, package.json.new

echo.
echo ===================================================
echo    PASO 6: Verificando instalacion
echo ===================================================
echo.

node -e "try { require('./ticket-renderer'); require('./raster-encoder'); console.log('  [OK] Modulos canvas cargados correctamente'); } catch(e) { console.log('  [ERROR] ' + e.message); process.exit(1); }"
if %ERRORLEVEL% neq 0 (
    echo.
    echo  ---------------------------------------------------
    echo  ERROR: Los modulos de canvas no cargaron.
    echo  Verifica que @napi-rs/canvas-win32-x64-msvc
    echo  se instalo correctamente en node_modules.
    echo  ---------------------------------------------------
    echo.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo    PASO 7: Reiniciando servicio
echo ===================================================
echo.

sc query "Takeasygo Printer Agent" >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo  Iniciando servicio...
    net start "Takeasygo Printer Agent" >nul 2>nul
    timeout /t 3 /nobreak >nul
    
    sc query "Takeasygo Printer Agent" | find "RUNNING" >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        echo  Servicio iniciado correctamente.
    ) else (
        echo  ---------------------------------------------------
        echo  ADVERTENCIA: El servicio no pudo iniciarse.
        echo  Revisa el Visor de Eventos para mas detalles.
        echo  ---------------------------------------------------
    )
) else (
    echo  Servicio no registrado. Para instalarlo:
    echo    node install_service.js
)

echo.
echo ===================================================
echo    ACTUALIZACION COMPLETADA
echo ===================================================
echo.
echo  Resumen:
echo    - agent.js actualizado
echo    - ticket-renderer.js y raster-encoder.js agregados
echo    - @napi-rs/canvas instalado
echo    - Servicio reiniciado
echo.
echo  Para activar modo imagen:
echo    Panel - Impresoras - Estilos - Modo de impresion
echo.
echo  Para revertir:
echo    Renombra agent.js.bak a agent.js
echo    y reinicia el servicio.
echo.
pause
