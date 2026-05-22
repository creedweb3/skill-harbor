# Start Cursor Skills Studio (API + UI)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path "node_modules")) {
  npm install
}
if (-not (Test-Path "frontend/node_modules")) {
  Set-Location frontend
  npm install
  Set-Location ..
}

Write-Host "Starting Cursor Skills Studio..." -ForegroundColor Cyan
Write-Host "  UI:  http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "  API: http://127.0.0.1:8765/api/health" -ForegroundColor Green
Write-Host "Keep this window open. If connection fails, check nothing else uses port 5173." -ForegroundColor DarkGray
npm run dev
