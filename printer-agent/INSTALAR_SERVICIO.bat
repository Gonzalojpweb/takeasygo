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
echo ---------------------------------------------------
echo PASO 3: Impresion sin internet desde otra PC (puerto 7717, red privada)
echo ---------------------------------------------------
netsh advfirewall firewall delete rule name="TakeasyGO Printer Agent (POS local)" >nul 2>&1
netsh advfirewall firewall add rule name="TakeasyGO Printer Agent (POS local)" dir=in action=allow protocol=TCP localport=7717 profile=private
if %ERRORLEVEL% neq 0 echo (Sin permiso de administrador: si hace falta, corre HABILITAR_RED_LOCAL.bat como administrador)
echo.
echo El codigo para vincular el POS esta en CODIGO_POS.txt (o abri VER_CODIGO.bat).
echo.
echo ===================================================
echo    INSTALACION FINALIZADA
echo ===================================================
echo.
pause
