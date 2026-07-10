# RTM 고객 DB 대시보드 (React + FastAPI)

`RTM_고객DB_대시보드.html` 단일 파일 대시보드를 **React (Vite + TypeScript) 프론트엔드**와
**FastAPI 백엔드**로 완전 이식한 파생 서비스입니다. 데이터는 브라우저 메모리/`localStorage`가
아니라 `packages/customer-db`가 만든 SQLite DB에서 옵니다.

```
webapp/
  backend/    FastAPI — customer-db SQLite를 읽고/쓰는 API
  frontend/   Vite + React + TS — 대시보드 UI
```

## 빠른 시작

먼저 DB가 있어야 합니다 (`packages/customer-db` 참고):

```bash
cd ../../customer-db
node scripts/extract_frontend_seed.mjs <html> data/frontend_seed.json
python3 scripts/build_sqlite_db.py data/frontend_seed.json data/rtm_customer.db
```

### 1) 백엔드

```bash
cd webapp/backend
pip install -r requirements.txt
./run.sh                 # http://127.0.0.1:8765  (기본 DB: ../../customer-db/data/rtm_customer.db)
# 다른 DB: RTM_CUSTOMER_DB=/path/to.db ./run.sh 8765
```

### 2) 프론트엔드

```bash
cd webapp/frontend
npm install
npm run dev              # http://localhost:5173  (/api 는 8765로 프록시됨)
```

프로덕션 빌드: `npm run build` → `dist/` 를 임의의 정적 호스팅에 배포.
백엔드가 다른 호스트면 빌드 시 `VITE_API_BASE=https://api.example.com npm run build`.

## API

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/health` | 상태 확인 |
| GET | `/api/summary` | 회사/고객/활동/대기 리뷰 카운트 |
| GET | `/api/customers` | 전체 고객(레코드 shape) + 회사 프로필 맵 |
| GET | `/api/activities` | 활동 타임라인 |
| GET | `/api/reviews?status=pending` | 정합성 확인 대기열 (원본+해석 포함) |
| GET | `/api/companies/search?q=` | 회사 검색 (기고객사 연결용) |
| GET | `/api/guide` | Slack 메시지 작성 가이드 (마크다운) |
| GET | `/api/settings` · PUT | 동기화 규칙·주기 설정 |
| GET | `/api/glm/status` | GLM 설정 여부 |
| PUT | `/api/companies/{key}` | 회사 프로필(업종/세부/설명/담당/메모) 수정 |
| POST | `/api/companies/{key}/infer` | GLM 업종/설명 자동 추정 |
| POST | `/api/reviews/{id}/resolve` | 리뷰 처리 |
| POST | `/api/leads` | 수기 리드 추가 |
| PUT | `/api/contacts/{email}/tags` | 태그 설정 |
| POST | `/api/activities` | 영업 활동 기록(히스토리) 추가 |
| POST | `/api/search/glm` | 자연어/키워드 검색 |
| POST | `/api/sync` | 슬랙 리드 동기화 (live collector 또는 export 파일) |

### 리뷰 처리 액션

```jsonc
{"action": "approve"}                                  // 제안값 반영
{"action": "edit", "value": "수정된 값"}                // 수정 후 반영
{"action": "reject"}                                   // 거절
{"action": "link_existing", "company_key": "삼성전자"}  // 기고객사 연결
{"action": "register_new", "company_name": "예시반도체", // 신규 회사 등록
 "company_fields": {"industry": "반도체장비"}}
```

## 정합성 확인 (핵심 기능)

Slack/GLM 해석 결과가 운영 DB를 조용히 오염시키지 않도록, 각 대기 항목은
**수집 원본(Slack 원문 + 원본 링크) ↔ GLM 해석 결과**를 나란히 보여줍니다.
사용자는 항목별로:

- 회사 관련 항목: **기고객사 연결** 또는 **신규 등록**
- 일반 필드 항목: **승인 / 수정 승인 / 거절**

Slack 원본 링크는 `RTM_SLACK_WORKSPACE_URL` + 채널/타임스탬프로 생성됩니다
(원본 payload에 permalink가 있으면 그것을 우선 사용).

## 슬랙 리드 동기화

`POST /api/sync`는 collector 정규화 메시지에서 릴레잇/피트페이퍼 리드를 파싱해 DB에 반영합니다
(GLM 불필요). 입력은 (1) 라이브 collector 실행(SLACK_BOT_TOKEN 필요) 또는 (2) export JSON 파일
(`RTM_SLACK_EXPORT_FILE` 또는 요청 body `export_file`). `last_synced_ts`로 중복을 방지합니다.

동기화 규칙·주기는 `⚙ 동기화 설정`(또는 `/api/settings`)에서 조정합니다: 채널, 수집 범위(시간),
최근 N개만 수집(`sync_limit`, 0=증분), 소스별 포함 여부, 새 회사 자동등록 대신 검수 큐로 보내기,
자동 동기화 주기(분).

### 안정적 주기 수집

자동 동기화를 켜면 **백엔드 스케줄러**가 서버에서 주기적으로 실행됩니다(대시보드를 닫아도 동작).
서버 재시작을 넘어 24/7로 확실히 돌리려면 collector의 OS 스케줄러(cron/launchd,
`packages/slack-channel-collector/USAGE.md`)를 함께 쓰는 것을 권장합니다.

### 원본·링크·댓글 보존

동기화 시 각 Slack 메시지의 **원문 텍스트 + permalink(원본 링크) + 스레드 댓글**을
`slack_raw_messages`에 보존하고, 생성된 활동(타임라인)에 링크와 댓글을 함께 노출합니다
(댓글 수집은 collector `include_threads=true` 필요, 기본값 on).

## GLM 고도화 (선택)

`GLM_API_URL`/`GLM_API_KEY`/`GLM_MODEL` 설정 시:

- **자연어 검색**: 상단 검색바가 질의를 구조화 필터로 변환해 결과를 좁힙니다. 미설정 시 키워드 폴백.
- **회사 자동 추정**: 회사 상세의 `✨ GLM 추정`이 업종/세부분야/설명을 제안 → 검토 후 저장.

## 이식·확장 기능

기존 HTML 기능(KPI, 차트, 회사/고객 뷰, 검색·필터, 상세 편집, 수기 리드, CSV, 동기화)에 더해:

- **정합성 확인 패널**: 수집 원본 ↔ GLM 해석 비교 + 신규등록/기고객사 연결
- **작성 가이드 상시 노출** (`📝 작성 가이드`)
- **담당자 뷰**: 내부 담당자별 담당 회사 묶어보기
- **담당자·태그 필터** + 정렬 가능한 헤더
- **태그 편집** (고객 상세) 및 소스/태그 DB 필드 분리
- **영업 히스토리**: 회사 → 부서 → 담당자 계층 타임라인 + 활동 기록 추가(방문/콜/견적/데모/후속)

설정은 `backend/.env.example` 참고.
