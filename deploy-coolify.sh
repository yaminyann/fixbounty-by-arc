#!/usr/bin/env bash
# Builds and starts the all-in-one stack (docker-compose.yml) and waits until the site answers.
# For Coolify itself use docker-compose.coolify.yml from the Coolify UI instead.
set -euo pipefail

if [ ! -f .env ]; then
  echo "[ERROR] .env not found. Copy .env.example to .env and fill it in."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

REQUIRED_VARS=(POSTGRES_PASSWORD FIREBASE_PROJECT_ID VITE_FIREBASE_API_KEY VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID ADMIN_EMAILS TREASURY_ADDRESS)
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "[ERROR] $var is not set in .env"
    exit 1
  fi
done

if [ -z "${BOUNTY_BOARD_ADDRESS:-}" ]; then
  echo "[NOTICE] BOUNTY_BOARD_ADDRESS is empty. The site will run but posting is paused until the contract is deployed."
fi

docker compose -f docker-compose.yml up -d --build

echo "Waiting for the site on http://localhost:5173 ..."
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:5173/health > /dev/null 2>&1; then
    echo "[OK] Site and API are healthy."
    exit 0
  fi
  sleep 2
done

echo "[ERROR] The stack did not become healthy within 2 minutes."
docker compose -f docker-compose.yml logs --tail=80 backend
exit 1
