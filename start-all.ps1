# ==============================================================================
# RED TAG AREA MONITORING SYSTEM - UNIFIED PARALLEL STARTUP SCRIPT (WINDOWS)
# Launches Java Engine (8080/9090), Node.js Backend (3001), and Vite Frontend (5173)
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " 🚀 RED TAG SURVEILLANCE & RFID SYSTEM - PARALLEL LAUNCHER" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

# Ensure .env exists in root and backend
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "📋 Created root .env from .env.example" -ForegroundColor Yellow
    }
}

if (-not (Test-Path "backend/.env")) {
    if (Test-Path "backend/.env.example") {
        Copy-Item "backend/.env.example" "backend/.env"
        Write-Host "📋 Created backend/.env from backend/.env.example" -ForegroundColor Yellow
    }
}

# Compile Java source if JDK is present
Write-Host "☕ Checking Java Compilation..." -ForegroundColor Magenta
node scripts/compile-java.js

Write-Host ""
Write-Host "🌟 Launching all services in parallel via concurrently..." -ForegroundColor Green
Write-Host "   • Java Engine & RFID TCP: http://localhost:8080 | tcp://localhost:9090" -ForegroundColor Magenta
Write-Host "   • Node.js Backend:        http://localhost:3001" -ForegroundColor Blue
Write-Host "   • Frontend Dashboard:     http://localhost:5173" -ForegroundColor Cyan
Write-Host ""

npm run dev
