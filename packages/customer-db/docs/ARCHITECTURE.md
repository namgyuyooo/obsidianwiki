# RTM 고객 DB 구조

## 목표

기존 단일 HTML 프론트에 내장된 고객 데이터를 seed로 삼아, 운영 가능한 관계형 DB를 만든다. Slack/GLM은 RAG가 아니라 구조화 추출기로만 사용하고, 최종 고객 DB는 정규화된 테이블과 사용자 검수 큐로 관리한다.

## 데이터 흐름

1. `RTM_고객DB_대시보드.html`
   - `BASE`: 고객 seed
   - `BASE_EVTS`: 활동 seed
   - `AUTO_CINFO`: 회사 프로필 seed
   - `CO_ALIAS`: 회사명 정규화 alias
2. `extract_frontend_seed.mjs`
   - HTML 내장 JS 상수를 `frontend_seed.json`으로 추출
3. `build_sqlite_db.py`
   - `schema.sql` 적용
   - 회사/고객/관심솔루션/소스/활동 seed 적재
   - 누락/불확실 필드에 대한 초기 정합성 확인 요청 생성
4. Slack 수집 모듈
   - 채널 원문 JSON 생성
5. GLM 구조화
   - Slack 메시지를 `slack_glm_extraction.schema.json` 규격으로 변환
6. `import_glm_extractions.py`
   - Slack 원문과 GLM 추출 결과 staging
   - 충돌/낮은 신뢰도 항목은 `consistency_reviews`로 이동
7. 사용자 확인
   - 승인/수정/거절 후 본 테이블 반영

## 정합성 원칙

- 기존 DB 값과 GLM 제안값이 다르면 자동 덮어쓰지 않는다.
- 새 회사/새 연락처라도 confidence가 낮으면 확인 요청으로 보낸다.
- 정합성 확인 요청은 필드 단위로 쌓는다.
- 승인된 값만 `contacts`, `companies`에 반영한다.
- 모든 Slack/GLM 근거는 원문 또는 extracted payload로 추적 가능해야 한다.

## 대시보드 통합 방향

현재 HTML의 `BASE`, `BASE_EVTS`, `AUTO_CINFO`, `localStorage`는 DB로 대체한다.

- 회사 뷰: `v_customer_dashboard`를 회사 기준 group by
- 고객 뷰: `v_customer_dashboard` 직접 조회
- 동기화 버튼: Slack 수집 + GLM 구조화 + `import_glm_extractions.py` 실행
- 정합성 확인 UI: `v_pending_consistency_reviews`를 보여주고 승인/수정/거절 action 호출

초기에는 SQLite 파일로 충분하고, 다중 사용자/서버 운영이 필요해지면 PostgreSQL로 올리는 구조가 자연스럽다.
