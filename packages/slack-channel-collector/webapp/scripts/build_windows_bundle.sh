#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_ROOT="${1:-$(pwd)/dist}"
STAGE="$OUT_ROOT/rtm-windows-server-$STAMP"
ZIP="$OUT_ROOT/rtm-windows-server-$STAMP.zip"
mkdir -p "$STAGE" "$STAGE/backend" "$STAGE/backend/tests" "$STAGE/frontend" "$STAGE/collector" \
  "$STAGE/customer-db" "$STAGE/data" "$STAGE/backups" "$STAGE/secrets" "$STAGE/installers"

cp deploy/windows/Dockerfile deploy/windows/docker-compose.yml deploy/windows/Caddyfile deploy/windows/README.md deploy/windows/.dockerignore "$STAGE/"
cp -R deploy/windows/scripts "$STAGE/scripts"
if [ -f "deploy/windows/installers/Docker Desktop Installer.exe" ]; then
  cp "deploy/windows/installers/Docker Desktop Installer.exe" "$STAGE/installers/"
fi
cp backend/requirements.txt "$STAGE/backend/requirements.txt"
cp -R backend/app "$STAGE/backend/app"
cp -R backend/scripts "$STAGE/backend/scripts"
cp backend/tests/run_live_ocr.py "$STAGE/backend/tests/run_live_ocr.py"
cp frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/vite.config.ts frontend/index.html "$STAGE/frontend/"
cp -R frontend/src "$STAGE/frontend/src"
cp -R ../src "$STAGE/collector/src"
cp -R ../../customer-db/docs "$STAGE/customer-db/docs"

DB="../../customer-db/data/rtm_customer.db"
sqlite3 "$DB" ".timeout 60000" ".backup '$STAGE/data/rtm_customer.db'"
sqlite3 "$STAGE/data/rtm_customer.db" "PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check;"
rm -f "$STAGE/data/rtm_customer.db-wal" "$STAGE/data/rtm_customer.db-shm"

find "$STAGE" -type d -name __pycache__ -prune -exec rm -rf {} +
find "$STAGE" -type f -name '*.pyc' -delete
(cd "$OUT_ROOT" && zip -qr "$(basename "$ZIP")" "$(basename "$STAGE")")
echo "$STAGE"
echo "$ZIP"
