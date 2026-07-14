#!/usr/bin/env bash
# Start the FastAPI dev server for the RTM Customer DB dashboard.
#
#   ./run.sh                 # uses packages/customer-db/data/rtm_customer.db
#   RTM_CUSTOMER_DB=/path/to.db ./run.sh 8765
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8765}"

if [ -d ".venv" ]; then
  export PATH="$(pwd)/.venv/bin:$PATH"
fi

# Load local environment settings. Prefer .env and support the existing env file.
ENV_FILE=""
if [ -f ".env" ]; then
  ENV_FILE=".env"
elif [ -f "env" ]; then
  ENV_FILE="env"
fi
if [ -n "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1091
  . "./$ENV_FILE"
  set +a
fi

UVICORN_ARGS=(app.main:app --host 127.0.0.1 --port "$PORT")
# 예약 수집 같은 장기 작업은 코드 감시 재시작 시 중단되므로 운영 기본값은 reload를 끈다.
# 프론트/백엔드 개발 중에만 RTM_RELOAD=1 ./run.sh 로 활성화한다.
if [ "${RTM_RELOAD:-0}" = "1" ]; then
  UVICORN_ARGS+=(--reload)
fi
exec uvicorn "${UVICORN_ARGS[@]}"
