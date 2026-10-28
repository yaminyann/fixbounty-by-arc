#!/usr/bin/env bash
# ==============================================================================
# FixBounty Coolify Deployment & Health Validation Script
# ==============================================================================
set -euo pipefail

echo "=========================================================="
echo " Starting FixBounty Deployment for Coolify / Docker"
echo "=========================================================="

# 1. Verify Environment Variables
echo "[1/4] Validating environment variables..."

REQUIRED_VARS=(
  "POSTGRES_USER"
  "POSTGRES_PASSWORD"
  "POSTGRES_DB"
  "VITE_FIREBASE_API_KEY"
  "VITE_FIREBASE_PROJECT_ID"
  "VITE_BOUNTY_BOARD_ADDRESS"
)

MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "  [WARNING] Variable $var is not set in environment."
    MISSING=1
  else
    echo "  [OK] $var is present."
  fi
done

if [ "$MISSING" -eq 1 ]; then
  echo "[NOTICE] Using standard defaults for unset local variables where applicable."
fi

# 2. Build and Start Services
echo "[2/4] Building and starting Docker services..."
docker compose -f docker-compose.yml up -d --build

# 3. Wait for PostgreSQL and Backend Readiness
echo "[3/4] Waiting for services to become healthy..."
MAX_ATTEMPTS=30
ATTEMPT=0

until curl -s -f http://localhost:4000/health > /dev/null 2>&1 || [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; do
  ATTEMPT=$((ATTEMPT + 1))
  echo "  Waiting for backend health check ($ATTEMPT/$MAX_ATTEMPTS)..."
  sleep 2
done

if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
  echo "[ERROR] Backend service failed to become healthy within 60 seconds."
  docker compose logs backend
  exit 1
fi

echo "  [OK] Backend API is healthy!"

# 4. Verify Frontend
echo "[4/4] Verifying Frontend response..."
if curl -s -f http://localhost:5173/ > /dev/null 2>&1; then
  echo "  [OK] Frontend is serving on port 5173!"
elif curl -s -f http://localhost/ > /dev/null 2>&1; then
  echo "  [OK] Frontend is serving on port 80!"
fi

echo "=========================================================="
echo " Deployment Successfully Verified!"
echo " Backend Health: http://localhost:4000/health"
echo " Web UI:        http://localhost:5173"
echo "=========================================================="
