# build-dist.ps1
# Genera el ZIP descargable para cada tenant
# Uso: .\build-dist.ps1

$ErrorActionPreference = 'Stop'

$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $agentDir 'dist'
$stageDir = Join-Path $distDir 'takeasygo-printer-agent'
$zipPath = Join-Path $distDir 'takeasygo-printer-agent.zip'

# Limpiar
if (Test-Path $distDir) { Remove-Item -Recurse -Force $distDir }
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

# Archivos a copiar
$files = @(
    'agent.js',
    'setup.js',
    'package.json',
    'pnpm-lock.yaml',
    '.npmrc',
    'send-raw.ps1',
    'fiscal-drivers',
    'SETUP.bat',
    'start.bat',
    'UPDATE.bat',
    'DIAGNOSTICO.bat',
    'REPARAR_USB_EPSON.bat',
    'INSTALAR_SERVICIO.bat',
    'install_service.js',
    'uninstall_service.js',
    'README.md'
)

foreach ($file in $files) {
    $src = Join-Path $agentDir $file
    if (Test-Path $src) {
        Copy-Item $src -Destination $stageDir -Recurse
        Write-Host "  + $file"
    } else {
        Write-Host "  ! $file no encontrado, saltando"
    }
}

# Plantilla limpia: el config.json de esta PC tiene el comercio y el token.
@{ apiUrl = 'https://www.takeasygo.com'; tenantSlug = 'TU-SLUG-DEL-RESTAURANTE'; locationId = 'TU-OBJECT-ID-DE-LA-SEDE'; pollInterval = 15000 } |
    ConvertTo-Json | Set-Content -Path (Join-Path $stageDir 'config.json') -Encoding ascii
Write-Host "  + config.json (plantilla)"

# Sin pruebas ni archivos de cada PC adentro del paquete.
Get-ChildItem (Join-Path $stageDir 'fiscal-drivers') -Recurse -Include '*.test.js','*.log','*.pem' | Remove-Item -Force

# DLL de Epson: desde esta PC o desde el programa oficial del fabricante.
$dllTarget = Join-Path $stageDir 'fiscal-drivers\epson'
$dllSources = @(
    (Join-Path $agentDir 'fiscal-drivers\epson\EpsonFiscalDriver.dll'),
    (Join-Path $agentDir '..\EpsonFiscalDriver_03.07.00\examples\C#-DLL\example\target\EpsonFiscalDriver.dll')
)
$dll = $dllSources | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($dll) {
    New-Item -ItemType Directory -Path $dllTarget -Force | Out-Null
    Copy-Item -LiteralPath $dll -Destination $dllTarget -Force
    Write-Host "  + DLL de Epson"
} else {
    Write-Host "  ! DLL de Epson no encontrada: el paquete no va a poder emitir en Epson"
}

# Daemon excluido: cada tenant lo genera con INSTALAR_SERVICIO.bat

# Crear ZIP
if (Test-Path $zipPath) { Remove-Item $zipPath }
Compress-Archive -Path "$stageDir\*" -DestinationPath $zipPath
Write-Host ""
Write-Host "ZIP generado: $zipPath"
Write-Host "Tamanio: $([math]::Round((Get-Item $zipPath).Length / 1KB, 1)) KB"

# Limpiar stage
Remove-Item -Recurse -Force $stageDir
Write-Host "Listo!"
