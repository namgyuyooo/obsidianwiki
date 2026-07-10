# RTM Customer DB

`RTM_고객DB_대시보드.html`에 박혀 있던 프론트 데이터를 seed로 삼아 SQLite 고객 DB를 구축하는 모듈입니다.

이 DB는 RAG 용도가 아닙니다. 고객, 회사, 활동, Slack 원문, GLM 추출 결과, 사용자 정합성 확인 요청을 관계형 데이터로 관리합니다.

## 빠른 시작

```bash
cd packages/customer-db
node scripts/extract_frontend_seed.mjs /Users/rtm/Downloads/RTM_고객DB_대시보드.html data/frontend_seed.json
python3 scripts/build_sqlite_db.py data/frontend_seed.json data/rtm_customer.db
```

생성물:

- `data/frontend_seed.json`: 프론트 내장 데이터 추출본
- `data/rtm_customer.db`: SQLite DB

## 핵심 테이블

- `companies`: 회사 마스터, 업종/세부분야/설명/담당자/메모
- `contacts`: 사람/고객 마스터
- `activities`: 릴레잇, 피트페이퍼, 수기, Slack GLM 활동 이력
- `solutions`, `contact_interests`: 관심 솔루션
- `sources`, `contact_sources`: 유입 채널
- `slack_raw_messages`: Slack 원문 메시지 보존
- `glm_extractions`: GLM 구조화 결과 staging
- `consistency_reviews`: 사용자 정합성 확인 요청 큐

## Slack GLM 입력

GLM 출력은 [schemas/slack_glm_extraction.schema.json](schemas/slack_glm_extraction.schema.json) 규격을 따릅니다.

```bash
python3 scripts/import_glm_extractions.py path/to/glm-output.json data/rtm_customer.db
```

낮은 confidence, 기존 값과 충돌하는 값, 새 회사/새 담당자 정보는 자동 확정하지 않고 `consistency_reviews`에 들어갑니다.

## 사용자 정합성 확인

확인 대기 큐:

```bash
sqlite3 data/rtm_customer.db "select * from v_pending_consistency_reviews limit 20;"
```

승인:

```bash
python3 scripts/resolve_review.py 1 approve data/rtm_customer.db
```

수정 승인:

```bash
python3 scripts/resolve_review.py 1 edit "수정된 값" data/rtm_customer.db
```

거절:

```bash
python3 scripts/resolve_review.py 1 reject data/rtm_customer.db
```

대시보드에는 `v_customer_dashboard`를 붙이면 현재 HTML의 회사/고객 뷰를 DB 기반으로 대체할 수 있습니다.

## 프론트 연동 API

```bash
python3 scripts/serve_api.py data/rtm_customer.db 8765
```

자세한 HTML 치환 방향은 [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md)를 보세요.
