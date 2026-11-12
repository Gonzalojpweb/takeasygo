@echo off
TITLE CODIGO PARA EL POS - TAKEASYGO
color 0B
echo ===================================================
echo    IMPRESION SIN INTERNET - CODIGO PARA EL POS
echo ===================================================
echo.
if exist "CODIGO_POS.txt" (
    type "CODIGO_POS.txt"
) else (
    echo Todavia no hay codigo: inicia el agente una vez
    echo ^(servicio o start.bat^) y volve a abrir este archivo.
)
echo.
echo Cargalo en el POS: Configuracion ^> Sin internet ^> Impresion sin internet.
echo.
pause
