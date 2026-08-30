# QrPromo / Club multi-sede E2E Runner (item A)
# Uso: .\scripts\qr-promo-e2e\run.ps1
#
# Requisitos:
#   - next dev NO esté corriendo en puerto 3101
#   - .env.local con MONGODB_URI definido
#
# NOTA: este script usa SOLO ASCII (PS 5.1 + escritura UTF-8 sin BOM corrompe
# caracteres no-ASCII). Cambios en los mensajes: mantener ASCII.

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$saasDir = Split-Path -Parent (Split-Path -Parent $scriptDir)  # scripts/qr-promo-e2e -> scripts -> saas
$PORT = 3101
$TEST_DB = '__qr_e2e__'

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "  QrPromo / Club multi-sede E2E - Runner (item A)" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan

# -- 1. Check port ---------------------------------------------------------
$portCheck = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
if ($portCheck) {
  Write-Host "  [WARN] Puerto $PORT ya en uso. Matá el proceso primero." -ForegroundColor Yellow
  exit 1
}

# -- 2. Read MONGODB_URI and build test DB URI ------------------------------
$envFile = Join-Path $saasDir ".env.local"
if (-not (Test-Path $envFile)) {
  Write-Host "  [ERR] .env.local no encontrado en $saasDir" -ForegroundColor Red
  exit 1
}

$mongoLine = (Get-Content $envFile | Where-Object { $_ -match '^\s*MONGODB_URI\s*=' }) | Select-Object -First 1
if (-not $mongoLine) {
  Write-Host "  [ERR] MONGODB_URI no definido en .env.local" -ForegroundColor Red
  exit 1
}

$rawUri = ($mongoLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
$uriParts = $rawUri -split '\?', 2
$uriPath = $uriParts[0]
$qs = if ($uriParts.Length -gt 1) { "?" + $uriParts[1] } else { "" }
$m = [regex]::Match($uriPath, '^(mongodb(?:\+srv)?://[^/]+)')
if ($m.Success) {
  $testUri = "$($m.Groups[1].Value)/${TEST_DB}${qs}"
} else {
  Write-Host "  [ERR] Cannot parse MONGODB_URI host" -ForegroundColor Red
  exit 1
}

Write-Host "  [OK] MONGODB_URI parsed OK" -ForegroundColor Green
Write-Host "  [OK] Target DB: $TEST_DB" -ForegroundColor Green

# -- 3. Start next dev on port with overridden URI ---------------------------
Write-Host ""
Write-Host "  Starting next dev --port $PORT (dbName=$TEST_DB)..." -ForegroundColor Cyan

$authSecret = (Get-Content $envFile | Where-Object { $_ -match '^\s*AUTH_SECRET\s*=' } | Select-Object -First 1) -replace '^\s*AUTH_SECRET\s*=\s*', '' -replace '^["'']', '' -replace '["'']$', ''

$serverCmd = "set MONGODB_URI=$testUri&& set AUTH_SECRET=$authSecret&& set SYNC_LAYER_URL=&& npx.cmd next dev --port $PORT"
$nextProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $serverCmd -WorkingDirectory $saasDir -PassThru -NoNewWindow
$nextPid = $nextProc.Id
Write-Host "  PID: $nextPid" -ForegroundColor Gray

$ready = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$PORT" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($r.StatusCode) { $ready = $true; break }
  } catch { }
}
if (-not $ready) {
  Write-Host "  [WARN] Server may not be ready after 30s, trying anyway..." -ForegroundColor Yellow
}

# -- 4. Run e2e test -----------------------------------------------------------
Write-Host ""
Write-Host "  Running e2e test..." -ForegroundColor Cyan
$env:E2E_BASE_URL = "http://localhost:$PORT"
$env:MONGODB_URI = $testUri

$testResult = 0
try {
  & npx.cmd tsx (Join-Path $scriptDir "e2e.ts")
  $testResult = $LASTEXITCODE
} catch {
  Write-Host "  [ERR] Test runner error: $_" -ForegroundColor Red
  $testResult = 1
}

# -- 5. Kill dev server ----------------------------------------------------------
Write-Host ""
Write-Host "  Stopping next dev (PID=$nextPid)..." -ForegroundColor Gray
Stop-Process -Id $nextPid -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Write-Host "  Server stopped." -ForegroundColor Green

# -- 6. Exit ---------------------------------------------------------------------
if ($testResult -eq 0) {
  Write-Host ""
  Write-Host "  [OK] E2E PASSED" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "  [ERR] E2E FAILED" -ForegroundColor Red
}
exit $testResult