#!/usr/bin/env bash
# One-command server update for webservice-esim.
#
#   bash deploy/update.sh [--branch <name>] [--mode auto|docker|node] [--no-migrate]
#
# Pulls the branch, installs, runs the database migrations (0004 + 0005,
# safe to re-run), rebuilds and restarts the app, then health-checks it.
set -euo pipefail

BRANCH="claude/auto-activation-payment-nweklk"
MODE="auto"
MIGRATE=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --no-migrate) MIGRATE=0; shift ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done
cd "$(dirname "$0")/.."

echo "==> Updating code to origin/$BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [[ "$MODE" == "auto" ]]; then
  if command -v docker >/dev/null 2>&1 \
     && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^esims-app-backend$'; then
    MODE=docker
  else
    MODE=node
  fi
fi
echo "==> Mode: $MODE"

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable 2>/dev/null || npm install -g pnpm
fi
echo "==> Installing dependencies (dev deps included, for build & migrations)"
pnpm install --frozen-lockfile

run_with_env() {
  if [[ -f .env ]]; then npx env-cmd -f .env "$@"; else "$@"; fi
}

if [[ "$MIGRATE" == 1 ]]; then
  echo "==> Applying database migrations 0004 + 0005 (safe to re-run)"
  run_with_env node deploy/apply-migration.js \
    migrations/0004_payment_balance_renewals.sql \
    migrations/0005_provider_inventory_pricing.sql
fi

if [[ "$MODE" == docker ]]; then
  echo "==> Rebuilding and restarting the backend container"
  docker compose -f docker-compose-backend.yml build
  docker compose -f docker-compose-backend.yml up -d
else
  echo "==> Building"
  pnpm build
  echo "==> Restarting the app"
  if command -v pm2 >/dev/null 2>&1 && pm2 describe esims >/dev/null 2>&1; then
    pm2 restart esims --update-env
  elif command -v pm2 >/dev/null 2>&1; then
    pm2 start dist/src/main.js --name esims
  elif systemctl list-unit-files 2>/dev/null | grep -q '^esims\.service'; then
    sudo systemctl restart esims
  else
    pkill -f 'dist/src/main\.js' 2>/dev/null || true
    sleep 1
    nohup node dist/src/main.js > app.log 2>&1 &
    echo "    started with nohup (log: app.log)"
  fi
fi

echo "==> Health check"
sleep 4
if curl -fsS http://localhost:9000/api/health >/dev/null 2>&1; then
  echo "    API OK — store at /shop"
else
  echo "    WARNING: health check failed — inspect the app logs"
  exit 1
fi
