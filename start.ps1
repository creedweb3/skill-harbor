# Start Skill Harbor (API + UI). Stops any prior dev instances first.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path "node_modules")) {
  npm install
}
if (-not (Test-Path "frontend/node_modules")) {
  Push-Location frontend
  npm install
  Pop-Location
}

Write-Host "Starting Skill Harbor (stops any prior dev servers first)…" -ForegroundColor Cyan
Write-Host "  UI:  http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "  API: http://127.0.0.1:8765/api/health" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop. Use 'npm run stop' from another terminal to force-stop." -ForegroundColor DarkGray
npm run dev
