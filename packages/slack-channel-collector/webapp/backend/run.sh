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

exec uvicorn app.main:app --reload --host 127.0.0.1 --port "$PORT"
