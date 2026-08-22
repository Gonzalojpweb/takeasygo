# Hidden Rewards E2E Runner
# Uso: .\scripts\hr-e2e\run.ps1
#
# Requisitos:
#   - next dev NO esté corriendo en puerto 3100
#   - .env.local con MONGODB_URI definido

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$saasDir = Split-Path -Parent (Split-Path -Parent $scriptDir)  # scripts/hr-e2e → scripts → saas

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Hidden Rewards E2E — Runner" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

# ── 1. Check port 3100 ────────────────────────────────────────────────────
$portCheck = Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue
if ($portCheck) {
  Write-Host "  ⚠️  Puerto 3100 ya en uso. Matá el proceso primero." -ForegroundColor Yellow
  exit 1
}

# ── 2. Read MONGODB_URI and build __hr_e2e__ URI ──────────────────────────
$envFile = Join-Path $saasDir ".env.local"
if (-not (Test-Path $envFile)) {
  Write-Host "  ❌ .env.local no encontrado en $saasDir" -ForegroundColor Red
  exit 1
}

$mongoLine = (Get-Content $envFile | Where-Object { $_ -match '^\s*MONGODB_URI\s*=' }) | Select-Object -First 1
if (-not $mongoLine) {
  Write-Host "  ❌ MONGODB_URI no definido en .env.local" -ForegroundColor Red
  exit 1
}

$rawUri = ($mongoLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
# Build test DB URI: strip query string, append /__hr_e2e__, re-add query
$uriParts = $rawUri -split '\?', 2
$uriPath = $uriParts[0]
$qs = if ($uriParts.Length -gt 1) { "?" + $uriParts[1] } else { "" }
# Anchor to host: safe for srv://...mongodb.net/?... (empty dbname)
$m = [regex]::Match($uriPath, '^(mongodb(?:\+srv)?://[^/]+)')
if ($m.Success) {
  $testUri = "$($m.Groups[1].Value)/__hr_e2e__${qs}"
} else {
  Write-Host "  ❌ Cannot parse MONGODB_URI host from: $($uriPath.Substring(0, [Math]::Min(40, $uriPath.Length)))..." -ForegroundColor Red
  exit 1
}

Write-Host "  ✓ MONGODB_URI parsed OK" -ForegroundColor Green
Write-Host "  ✓ Target DB: __hr_e2e__" -ForegroundColor Green

# ── 3. Start next dev on port 3100 with overridden URI ─────────────────────
Write-Host ""
Write-Host "  Starting next dev --port 3100 (dbName=__hr_e2e__)..." -ForegroundColor Cyan

# Read AUTH_SECRET from .env.local
$authSecret = (Get-Content $envFile | Where-Object { $_ -match '^\s*AUTH_SECRET\s*=' } | Select-Object -First 1) -replace '^\s*AUTH_SECRET\s*=\s*', '' -replace '^["'']', '' -replace '["'']$', ''

# Use cmd /c to GUARANTEE env vars are in the child process environment
$serverCmd = "set MONGODB_URI=$testUri&& set AUTH_SECRET=$authSecret&& npx.cmd next dev --port 3100"
$nextProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $serverCmd -WorkingDirectory $saasDir -PassThru -NoNewWindow
$nextPid = $nextProc.Id
Write-Host "  PID: $nextPid" -ForegroundColor Gray

# Wait for server to be ready (poll /api/health or just wait 8 seconds)
Write-Host "  Waiting for server ready..."
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3100" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($r.StatusCode) { $ready = $true; break }
  } catch { }
}
if (-not $ready) {
  Write-Host "  ⚠️  Server may not be ready after 30s, trying anyway..." -ForegroundColor Yellow
}

# ── 4. Run e2e test ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Running e2e test..." -ForegroundColor Cyan
$env:E2E_BASE_URL = "http://localhost:3100"
$env:MONGODB_URI = $testUri

$testResult = 0
try {
  & npx.cmd tsx (Join-Path $scriptDir "e2e.ts")
  $testResult = $LASTEXITCODE
} catch {
  Write-Host "  ❌ Test runner error: $_" -ForegroundColor Red
  $testResult = 1
}

# ── 5. Kill dev server ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Stopping next dev (PID=$nextPid)..." -ForegroundColor Gray
Stop-Process -Id $nextPid -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Write-Host "  Server stopped." -ForegroundColor Green

# ── 6. Exit ────────────────────────────────────────────────────────────────
if ($testResult -eq 0) {
  Write-Host ""
  Write-Host "  ✅ E2E PASSED" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "  ❌ E2E FAILED" -ForegroundColor Red
}
exit $testResult
