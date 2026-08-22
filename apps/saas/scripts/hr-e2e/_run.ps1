# Quick runner for e2e test
$ErrorActionPreference = 'Continue'
$saasDir = "C:\Users\Gonzalo Palomo\Dropbox\Mi PC (LAPTOP-NVALH40I)\Desktop\takeasygo\apps\saas"

# Parse MONGODB_URI
$rawUri = (Get-Content "$saasDir\.env.local" | Where-Object { $_ -match '^\s*MONGODB_URI\s*=' } | Select-Object -First 1) -replace '.*MONGODB_URI\s*=\s*', '' -replace '"', '' -replace "'", ''
$m = [regex]::Match(($rawUri -split '\?')[0], '^(mongodb(?:\+srv)?://[^/]+)')
$qs = if ($rawUri -match '\?') { '?' + ($rawUri -split '\?', 2)[1] } else { '' }
$testUri = "$($m.Groups[1].Value)/__hr_e2e__$qs"

$authLine = (Get-Content "$saasDir\.env.local" | Where-Object { $_ -match '^\s*AUTH_SECRET\s*=' } | Select-Object -First 1)
$authSecret = if ($authLine) { ($authLine -replace '^\s*AUTH_SECRET\s*=\s*', '' -replace '^["'']', '' -replace '["'']$', '') } else { '' }

# Start server via Start-Job
$job = Start-Job -ScriptBlock { param($uri, $secret, $dir)
  $env:MONGODB_URI = $uri
  $env:AUTH_SECRET = $secret
  Set-Location $dir
  & npx.cmd next dev --port 3100 2>&1
} -ArgumentList $testUri, $authSecret, $saasDir

# Wait for server
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3100" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($r.StatusCode) { Write-Host "Server ready after $((($i+1)*2))s" ; break }
  } catch { }
}

# Run e2e
$env:MONGODB_URI = $testUri
$env:E2E_BASE_URL = "http://localhost:3100"
$proc = Start-Process -FilePath "npx.cmd" -ArgumentList "tsx scripts/hr-e2e/e2e.ts" -WorkingDirectory $saasDir -PassThru -NoNewWindow -Wait

# Collect server logs
Start-Sleep -Seconds 1
Write-Host "`n=== SERVER DEBUG LOGS ==="
Receive-Job -Job $job -ErrorAction SilentlyContinue | Select-String 'HR-DISCOVER-DBG|HR-DISCOVER|CONFIRM-DBG' | ForEach-Object { Write-Host $_.Line }
Write-Host "`n=== ALL SERVER OUTPUT ==="
Receive-Job -Job $job -ErrorAction SilentlyContinue | Select-Object -Last 25 | ForEach-Object { Write-Host $_ }

# Cleanup
Stop-Job -Job $job -ErrorAction SilentlyContinue
Remove-Job -Job $job -Force -ErrorAction SilentlyContinue

Write-Host "`n=== EXIT CODE: $($proc.ExitCode) ==="
exit $proc.ExitCode
