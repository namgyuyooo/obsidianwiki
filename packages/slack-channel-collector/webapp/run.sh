#!/usr/bin/env bash
# RTM 고객 DB 대시보드 통합 실행기.
#   ./run.sh              # 준비(필요 시) 후 http://127.0.0.1:8765 로 실행 (API + UI)
#   ./run.sh 9000         # 포트 지정
#   ./run.sh --rebuild    # 프론트엔드 강제 재빌드 후 실행
#   ./run.sh --dev        # 백엔드(:8765) + Vite 개발서버(:5173) 동시 실행
set -euo pipefail
cd "$(dirname "$0")"

PORT=8765
REBUILD=0
DEV=0
for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=1 ;;
    --dev) DEV=1 ;;
    ''|*[!0-9]*) ;;      # 숫자 아니면 무시
    *) PORT="$arg" ;;
  esac
done

BACKEND="$(pwd)/backend"
FRONTEND="$(pwd)/frontend"

# ── 1) 백엔드 파이썬 준비 ─────────────────────────────────────────────
cd "$BACKEND"
PY=python3
if [ ! -d ".venv" ]; then
  echo "[setup] 파이썬 가상환경(.venv) 생성"
  $PY -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
if ! python -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo "[setup] 백엔드 의존성 설치 (fastapi/uvicorn/pydantic)"
  pip install -q -r requirements.txt
fi

# .env 로드 (Slack 토큰, GLM 키 등)
if [ -f ".env" ]; then
  set -a; # shellcheck disable=SC1091
  . ./.env; set +a
  echo "[setup] .env 로드됨"
fi

# ── 2) 개발 모드: Vite dev + 백엔드 동시 실행 ─────────────────────────
if [ "$DEV" -eq 1 ]; then
  echo "[dev] 백엔드(:$PORT) + Vite(:5173) 실행. Ctrl+C로 종료."
  ( cd "$FRONTEND" && { [ -d node_modules ] || npm install; } && npm run dev ) &
  DEV_PID=$!
  trap 'kill $DEV_PID 2>/dev/null || true' EXIT
  exec uvicorn app.main:app --reload --host 127.0.0.1 --port "$PORT"
fi

# ── 3) 프론트엔드 빌드 (필요 시) ──────────────────────────────────────
if [ "$REBUILD" -eq 1 ] || [ ! -f "$FRONTEND/dist/index.html" ]; then
  echo "[build] 프론트엔드 빌드 중…"
  ( cd "$FRONTEND" && { [ -d node_modules ] || npm install; } && npm run build )
else
  echo "[build] 기존 dist 사용 (강제 재빌드: ./run.sh --rebuild)"
fi

# ── 4) 실행 (백엔드가 API + 빌드된 UI를 함께 서빙) ────────────────────
# --reload 안 씀: 긴 백그라운드 백필이 파일 변경으로 중단되지 않도록. (개발은 --dev)
echo "[run] http://127.0.0.1:$PORT  (Ctrl+C 종료)"
exec uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
