# =============================================================================
# Repara el driver USB de Epson: quita el dispositivo con problema y lo vuelve a
# detectar. No borra el driver ni toca la memoria fiscal.
# Lo ejecuta REPARAR_USB_EPSON.bat, como administrador.
# =============================================================================
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host 'Hay que ejecutarlo como administrador: clic derecho > Ejecutar como administrador.'
    exit 1
}

$devices = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match 'VID_04B8' -and $_.Status -ne 'OK' })
if ($devices.Count -eq 0) {
    Write-Host 'No hay equipos Epson con problema. No se cambio nada.'
    exit 0
}

foreach ($d in $devices) {
    Write-Host "Reparando: $($d.FriendlyName)"
    & pnputil /remove-device "$($d.InstanceId)"
}
& pnputil /scan-devices
Start-Sleep -Seconds 3

$left = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match 'VID_04B8' -and $_.Status -ne 'OK' })
if ($left.Count -eq 0) {
    Write-Host 'Listo: el equipo quedo funcionando.'
    exit 0
}
Write-Host 'Sigue con problema: desconecta y reconecta el USB. Si no cambia, reinstala el driver USB de Epson y reinicia la PC.'
exit 1
