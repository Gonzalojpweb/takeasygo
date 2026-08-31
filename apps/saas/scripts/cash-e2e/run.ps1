# Cash per-location E2E Runner (Item C)
# Uso: .\scripts\cash-e2e\run.ps1
#
# Requisitos:
#   - next dev NO este corriendo en puerto 3102
#   - .env.local con MONGODB_URI definido

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$saasDir = Split-Path -Parent (Split-Path -Parent $scriptDir)

Write-Host ""
Write-Host "========================================================="
Write-Host "  Cash per-location E2E - Runner (port 3102)"
Write-Host "========================================================="

# -- 1. Check port 3102 ------------------------------------------------------
$portCheck = Get-NetTCPConnection -LocalPort 3102 -ErrorAction SilentlyContinue
if ($portCheck) {
  Write-Host "  WARNING: Puerto 3102 ya en uso. Mata el proceso primero." -ForegroundColor Yellow
  exit 1
}

# -- 2. Read MONGODB_URI and build __cash_e2e__ URI --------------------------
$envFile = Join-Path $saasDir ".env.local"
if (-not (Test-Path $envFile)) {
  Write-Host "  ERROR: .env.local no encontrado en $saasDir" -ForegroundColor Red
  exit 1
}

$mongoLine = (Get-Content $envFile | Where-Object { $_ -match '^\s*MONGODB_URI\s*=' }) | Select-Object -First 1
if (-not $mongoLine) {
  Write-Host "  ERROR: MONGODB_URI no definido en .env.local" -ForegroundColor Red
  exit 1
}

$rawUri = ($mongoLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
$uriParts = $rawUri -split '\?', 2
$uriPath = $uriParts[0]
$qs = if ($uriParts.Length -gt 1) { "?" + $uriParts[1] } else { "" }
$m = [regex]::Match($uriPath, '^(mongodb(?:\+srv)?://[^/]+)')
if ($m.Success) {
  $testUri = "$($m.Groups[1].Value)/__cash_e2e__${qs}"
} else {
  Write-Host "  ERROR: Cannot parse MONGODB_URI host." -ForegroundColor Red
  exit 1
}

Write-Host "  OK MONGODB_URI parsed" -ForegroundColor Green
Write-Host "  OK Target DB: __cash_e2e__" -ForegroundColor Green

# -- 3. Start next dev on port 3102 with overridden URI -----------------------
Write-Host ""
Write-Host "  Starting next dev --port 3102 (dbName=__cash_e2e__)..." -ForegroundColor Cyan

$authSecret = (Get-Content $envFile | Where-Object { $_ -match '^\s*AUTH_SECRET\s*=' } | Select-Object -First 1) -replace '^\s*AUTH_SECRET\s*=\s*', '' -replace '^["'']', '' -replace '["'']$', ''

$serverCmd = "set MONGODB_URI=$testUri&& set AUTH_SECRET=$authSecret&& npx.cmd next dev --port 3102"
$nextProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $serverCmd -WorkingDirectory $saasDir -PassThru -NoNewWindow
$nextPid = $nextProc.Id
Write-Host "  PID: $nextPid" -ForegroundColor Gray

# Wait for server ready
Write-Host "  Waiting for server ready..."
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3102" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($r.StatusCode) { $ready = $true; break }
  } catch { }
}
if (-not $ready) {
  Write-Host "  WARNING: Server may not be ready after 30s, trying anyway..." -ForegroundColor Yellow
}

# -- 4. Run e2e test ----------------------------------------------------------
Write-Host ""
Write-Host "  Running e2e test..." -ForegroundColor Cyan
$env:E2E_BASE_URL = "http://localhost:3102"
$env:MONGODB_URI = $testUri

$testResult = 0
try {
  & npx.cmd tsx (Join-Path $scriptDir "e2e.ts")
  $testResult = $LASTEXITCODE
} catch {
  Write-Host "  ERROR: Test runner error: $_" -ForegroundColor Red
  $testResult = 1
}

# -- 5. Kill dev server --------------------------------------------------------
Write-Host ""
Write-Host "  Stopping next dev (PID=$nextPid)..." -ForegroundColor Gray
Stop-Process -Id $nextPid -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
# Matar wrappers que quedan escuchando en el puerto si los hubiera
$leftover = Get-NetTCPConnection -LocalPort 3102 -ErrorAction SilentlyContinue
foreach ($l in $leftover) {
  Stop-Process -Id $l.OwningProcess -Force -ErrorAction SilentlyContinue
}
Write-Host "  Server stopped." -ForegroundColor Green

# -- 6. Exit --------------------------------------------------------------------
if ($testResult -eq 0) {
  Write-Host ""
  Write-Host "  OK E2E PASSED" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "  FAIL E2E FAILED" -ForegroundColor Red
}
exit $testResult