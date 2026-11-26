# Starts the page lookup service on http://127.0.0.1:8000  (run from the scraper folder:  .\start.ps1)
# If an older copy of this same service is still running, it is stopped first, so you never get "port already in use".

if (-not (Test-Path .venv)) { python -m venv .venv; .venv\Scripts\python -m pip install -r requirements.txt }

$old = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $old) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue
  if ($p -and $p.CommandLine -match 'uvicorn app:app') {
    Write-Host "Stopping the old scraper (PID $($p.ProcessId))..."
    taskkill /PID $p.ParentProcessId /T /F 2>$null | Out-Null   # the launcher and its child
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  } elseif ($p) {
    Write-Host "Port 8000 is used by another program: $($p.Name) (PID $($p.ProcessId)). Close it first."
    exit 1
  }
}

.venv\Scripts\python -m uvicorn app:app --port 8000
