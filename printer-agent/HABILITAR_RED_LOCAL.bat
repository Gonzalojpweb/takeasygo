@echo off
TITLE HABILITAR IMPRESION DESDE OTRA PC - TAKEASYGO
color 1F
echo ===================================================
echo    IMPRESION SIN INTERNET DESDE OTRA PC DEL LOCAL
echo ===================================================
echo.
echo Abre el puerto 7717 del firewall de Windows SOLO para la red
echo privada del local, para que el POS de otra PC (equipo
echo secundario) le pueda mandar las comandas a este agente.
echo Si el POS corre en esta misma PC no hace falta.
echo.
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Hace falta permiso de administrador.
    echo Clic derecho en este archivo ^> "Ejecutar como administrador".
    echo.
    pause
    exit /b 1
)
netsh advfirewall firewall delete rule name="TakeasyGO Printer Agent (POS local)" >nul 2>&1
netsh advfirewall firewall add rule name="TakeasyGO Printer Agent (POS local)" dir=in action=allow protocol=TCP localport=7717 profile=private
echo.
echo Listo. Si la red del local figura como "Publica" en Windows, cambiala
echo a "Privada" (Configuracion ^> Red e Internet ^> propiedades de la red).
echo.
pause
