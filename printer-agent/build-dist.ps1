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
    'ticket-renderer.js',
    'raster-encoder.js',
    'setup.js',
    'config.json',
    'package.json',
    'pnpm-lock.yaml',
    '.npmrc',
    'send-raw.ps1',
    'test-ticket.js',
    'SETUP.bat',
    'start.bat',
    'UPDATE.bat',
    'INSTALAR_SERVICIO.bat',
    'install_service.js',
    'uninstall_service.js',
    'README.md'
)

foreach ($file in $files) {
    $src = Join-Path $agentDir $file
    if (Test-Path $src) {
        Copy-Item $src -Destination $stageDir
        Write-Host "  + $file"
    } else {
        Write-Host "  ! $file no encontrado, saltando"
    }
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
