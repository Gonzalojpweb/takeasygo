@echo off
TITLE INSTALADOR SERVICIO IMPRESION MEET
color 1F
echo ===================================================
echo    INSTALADOR AUTOMATICO - MEETING RESTOBAR
echo ===================================================
echo.
echo Este programa instalara el agenter de impresion como un SERVICIO.
echo Esto significa que se encendera solo y no se podra cerrar por error.
echo.
echo ---------------------------------------------------
echo PASO 1: Instalando librerias necesarias...
echo ---------------------------------------------------
call npm install
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
