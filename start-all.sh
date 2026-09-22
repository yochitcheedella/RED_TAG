#!/usr/bin/env bash
# ==============================================================================
# RED TAG AREA MONITORING SYSTEM - UNIFIED PARALLEL STARTUP SCRIPT (UNIX/LINUX)
# ==============================================================================

set -e

echo ""
echo "=================================================================="
echo " 🚀 RED TAG SURVEILLANCE & RFID SYSTEM - PARALLEL LAUNCHER"
echo "=================================================================="
echo ""

# Ensure .env exists
[ ! -f .env ] && [ -f .env.example ] && cp .env.example .env && echo "📋 Created root .env"
[ ! -f backend/.env ] && [ -f backend/.env.example ] && cp backend/.env.example backend/.env && echo "📋 Created backend/.env"

# Compile Java sources
echo "☕ Checking Java Compilation..."
node scripts/compile-java.js

echo ""
echo "🌟 Launching all services in parallel..."
echo "   • Java Engine & RFID TCP: http://localhost:8080 | tcp://localhost:9090"
echo "   • Node.js Backend:        http://localhost:3001"
echo "   • Frontend Dashboard:     http://localhost:5173"
echo ""

npm run dev
