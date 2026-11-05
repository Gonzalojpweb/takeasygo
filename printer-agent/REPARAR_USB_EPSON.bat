@echo off
chcp 65001 >nul 2>&1
TITLE REPARAR DRIVER USB EPSON - TAKEASYGO
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File fiscal-drivers\repair-usb.ps1
pause
