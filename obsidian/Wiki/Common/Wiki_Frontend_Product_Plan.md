---
type: knowledge
created: 2026-04-29
updated: 2026-04-29
source: "Local wiki frontend product and architecture plan"
---

# Wiki Frontend Product Plan

이 프론트엔드는 Obsidian을 대체하는 앱이 아니라, 위키 운영을 위한 로컬 콘솔이다.
핵심 화면은 `자동화 트리거`, `위키 검색/조회`, `신규 지식 주입`, `LLM 다이제스트 결과`, `개인용 로컬 LLM 챗`이다.

## 목표 화면

### 1. Operations Console

보여줄 것:

- `rclone-copy`, `build-manifest`, `run`, `full-cycle` 실행 버튼
- 현재 `.env` 대상 Drive, mirror root, manifest path
- 최근 run output, validation pass/fail, cleanup action
- `deletion_log.jsonl` 요약
- 안전 상태: `DRIVE_DELETE_SOURCE=false`

금지:

- 원본 Google Drive 삭제 버튼
- `rclone sync`, `rclone delete`, `rclone purge`

### 2. Wiki Search and Reader

검색 대상:

- `obsidian/Wiki/**/*.md`
- `obsidian/L1_memory/**/*.md`
- 필요 시 `automation/drive_wikify/runtime/*.json`

검색 결과 카드:

- 문서 제목
- 경로
- frontmatter type/source
- 매칭 문장
- 관련 프로젝트

조회 화면:

- markdown preview
- source/evidence/conflict/change log 빠른 탭
- Obsidian wikilink 후보

### 3. Knowledge Ingest Inbox

입력:

- 텍스트 pasted note
- 로컬 파일 경로
- Drive mirror file path
- 관련 프로젝트 hint

처리:

- GLM digest
- 프로젝트 판정
- evidence 후보
- conflict 후보
- write 전 preview

출력:

- `Sources.md` draft
- `Evidence_Log.md` draft
- `Change_Log.md` draft
- `Conflict_Register.md` draft
- L1 memory update 후보

### 4. LLM Digest Review

GLM API가 맡을 일:

- 긴 입력의 첫 digest
- 신규/기존 프로젝트 판정
- 중복 프로젝트 후보 비교
- 충돌 가능성 분류

로컬 LLM이 맡을 일:

- 개인용 빠른 질의
- 위키 검색 결과를 바탕으로 한 설명
- 민감도 높은 초안의 로컬 검토

### 5. GLM Wiki Chat

1차 연결:

- `GLM API`

이유:

- 사용자는 메인 LLM으로 GLM API를 사용한다.
- digest와 chat을 같은 API 계층으로 묶으면 운영 설정과 비용 관리가 단순하다.
- 위키 검색 결과를 context로 넣어 RAG-lite 방식으로 먼저 운영할 수 있다.

## 권장 아키텍처

```text
Browser UI
  -> local wiki API
    -> markdown search/read
    -> drive_wikify CLI trigger
    -> GLM digest adapter
    -> GLM wiki chat adapter
    -> Paperclip status/task bridge
```

## API Contract v0

`GET /api/status`

- env summary
- safety flags
- last manifest/run/deletion log status

`GET /api/settings`

- editable operation settings
- locked safety settings

`GET /api/coverage`

- tracked Drive queue coverage
- manifest/run/local cleanup summary

`POST /api/settings`

- allowlisted `.env` operation updates
- `DRIVE_DELETE_SOURCE` remains locked

`POST /api/openclaw/trigger`

- OpenClaw webhook trigger
- sends safe drive_wikify task payload

`POST /api/automation/trigger`

- input: `{ "command": "rclone-copy" | "build-manifest" | "run" | "full-cycle", "dryRun": true }`
- output: `{ "runId": "...", "status": "queued" }`

`GET /api/automation/runs`

- recent command history
- stdout summary
- validation count

`GET /api/wiki/search?q=...`

- markdown search over wiki and L1 memory

`GET /api/wiki/page?path=...`

- markdown source and parsed frontmatter

`POST /api/ingest`

- input note/file/project hint
- output digest and proposed wiki writes

`POST /api/llm/digest`

- GLM-backed structured digest

`POST /api/chat/glm`

- GLM-backed wiki chat

`GET /api/paperclip/status`

- Paperclip availability and recent task bridge status

## 1차 구현 범위

- static local frontend scaffold
- API endpoint contract 문서화
- mock data 기반 화면
- 명령 버튼은 API 호출 형태만 고정
- 실제 backend는 다음 단계에서 `automation/wiki_api/`로 분리

## 2026-04-29 v0 Implementation

구현 위치:

- `automation/wiki_frontend/`
- `automation/wiki_api/`

구현된 것:

- 정적 프론트엔드 서빙
- 운영 설정 조회/수정 UI
- 전체 Google Drive 수집 상태 바
- OpenClaw 자동화 호출 버튼
- `GET /api/status`
- `GET /api/settings`
- `POST /api/settings`
- `GET /api/coverage`
- `GET /api/automation/runs`
- `POST /api/automation/trigger`
- `POST /api/openclaw/trigger`
- `GET /api/wiki/search`
- `GET /api/wiki/page`
- `POST /api/llm/digest`
- `POST /api/chat/glm`
- `GET /api/paperclip/status`

현재 동작:

- markdown 검색은 `obsidian/Wiki/`와 `obsidian/L1_memory/`를 직접 읽는다.
- automation trigger는 허용된 `drive_wikify.cli` 명령만 실행한다.
- operation settings는 allowlist 기반으로 `.env`를 수정한다.
- `DRIVE_DELETE_SOURCE`는 수정 대상에서 제외하고 항상 `false`로 유지한다.
- 전체 수집 상태는 `Drive_Wikify_Coverage_Tracker`, manifest, run output, local mirror cleanup log를 합쳐 표시한다.
- OpenClaw trigger는 전용 `OPENCLAW_WEBHOOK_URL`/`OPENCLAW_API_KEY`가 비어 있으면 `GLM_API_URL`/`GLM_API_KEY`를 재사용한다.
- `rclone-copy`는 `rclone copy` 기반이며 dry-run 검증을 통과했다.
- GLM 환경값이 없으면 local rule digest 또는 GLM 설정 요청 메시지로 fallback한다.
- Paperclip은 `PAPERCLIP_URL`에 대한 reachability bridge만 구현했다.

남은 것:

- GLM API endpoint/key 실제 연결 확인
- write preview 승인 flow
- Paperclip task 생성/조회 API bridge

## UI 원칙

- 운영 도구이므로 대시보드형, 조밀하고 읽기 쉬운 화면
- 프로젝트/로그/명령 상태를 한 화면에서 스캔 가능하게 함
- 신규 지식 주입은 write 전에 preview와 승인 단계를 둠
- 오류는 숨기지 않고 `hold`, `retry`, `validation_failed`로 분류
