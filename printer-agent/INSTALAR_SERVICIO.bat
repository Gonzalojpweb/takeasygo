@echo off
TITLE INSTALADOR SERVICIO IMPRESION - TAKEASYGO
color 1F
echo ===================================================
echo    INSTALADOR AUTOMATICO - TAKEASYGO
echo ===================================================
echo.
echo Este programa instalara el agente de impresion como un SERVICIO.
echo Esto significa que se encendera solo y no se podra cerrar por error.
echo.
echo ---------------------------------------------------
echo PASO 0: Verificando pnpm...
echo ---------------------------------------------------
where pnpm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Instalando pnpm...
    call npm install -g pnpm
)
echo.
echo ---------------------------------------------------
echo PASO 1: Instalando librerias necesarias...
echo ---------------------------------------------------
call pnpm install
echo.
echo ---------------------------------------------------
echo PASO 2: Registrando Servicio en Windows...
echo (Te pedira permiso de administrador, dile que SI)
echo ---------------------------------------------------
echo.
node install_service.js
echo.
echo ===================================================
echo    INSTALACION FINALIZADA
echo ===================================================
echo.
pause
