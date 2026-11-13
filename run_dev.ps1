Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "         Launching Hirenomous AI Recruiter              " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Cleaning up previous instances on ports 8001 and 3001..." -ForegroundColor Yellow
$ports = @(8001, 3001)
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($conn in $conns) {
            Write-Host "Terminating process $($conn.OwningProcess) on port $port..." -ForegroundColor Gray
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}

Start-Sleep -Seconds 1

Write-Host "Starting Backend API (port 8001)..." -ForegroundColor Green
$backendPath = Join-Path $PSScriptRoot "backend"
Start-Process cmd.exe -ArgumentList "/k cd /d `"$backendPath`" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload"

Start-Sleep -Seconds 3

Write-Host "Starting Frontend UI (port 3001)..." -ForegroundColor Green
$frontendPath = Join-Path $PSScriptRoot "frontend"
Start-Process cmd.exe -ArgumentList "/k cd /d `"$frontendPath`" && npm run dev -- -p 3001"

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Both servers are starting up!" -ForegroundColor Cyan
Write-Host "- Backend API:  http://127.0.0.1:8001" -ForegroundColor White
Write-Host "- Swagger Docs: http://127.0.0.1:8001/docs" -ForegroundColor White
Write-Host "- Frontend App: http://localhost:3001" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Cyan
