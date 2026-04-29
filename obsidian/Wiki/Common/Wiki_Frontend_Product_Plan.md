---
type: knowledge
created: 2026-04-29
updated: 2026-04-29
source: "Local wiki frontend product and architecture plan"
---

# Wiki Frontend Product Plan

이 프론트엔드는 Obsidian을 대체하는 앱이 아니라, 위키 운영을 위한 로컬 콘솔이다.
핵심 화면은 `운영`, `수집 파이프라인`, `위키 직접 조회`, `위키 검색/조회`, `신규 지식 주입`, `LLM 다이제스트 결과`, `GLM 업무 챗`, `Paperclip 컨텍스트 브리지`다.

## 목표 화면

### 1. Operations Console

보여줄 것:

- 현재 `.env` 대상 Drive, mirror root, manifest path
- 최근 run output, validation pass/fail, cleanup action
- `deletion_log.jsonl` 요약
- 안전 상태: `DRIVE_DELETE_SOURCE=false`
- 예약 실행, 운영 설정, 스킬 카탈로그

금지:

- 원본 Google Drive 삭제 버튼
- `rclone sync`, `rclone delete`, `rclone purge`

### 1-A. Drive Collection Pipeline

사용자 동선:

- `rclone copy 미리보기`
- `manifest 생성`
- `위키화 실행`
- `전체 흐름 미리보기`
- `오픈클로/GLM 트리거`
- `현재 작업 중지`

설계 의도:

- 운영 설정과 수집 실행을 분리해 사용자가 “지금 무엇을 누르면 되는지”만 보게 한다.
- Drive 경로 기본값은 `gdrive: 최상위`다.
- 실행 로그와 재개 기준은 수집 파이프라인 탭에 모으고, 사이드바에는 어디서나 보이는 현재 상태만 둔다.

### 2. Wiki Direct Browser

조회 대상:

- `obsidian/Wiki/**/*.md`
- `obsidian/L1_memory/**/*.md`

보여줄 것:

- 좌측 문서 목록과 title/path/type 필터
- 중앙 Markdown preview
- 우측 Obsidian식 link graph map
- 그래프 노드 선택 시 같은 중앙 preview로 이동

그래프 기준:

- `[[wikilink]]`를 우선 link로 인식한다.
- Markdown `.md` 링크도 보조 link로 인식한다.
- 노드 크기는 연결 수로 표현한다.

### 2-A. Wiki Search and Reader

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

### 3. 한국어 지식 주입 Inbox

입력:

- 텍스트 pasted note
- 로컬 파일 경로
- Drive mirror file path
- 관련 프로젝트 hint

처리:

- 한국어 GLM digest
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
- 모든 사용자 검토용 출력은 한국어로 작성

### 4. LLM Digest Review

GLM API가 맡을 일:

- 긴 입력의 첫 한국어 digest
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
- 전역 지침과 프로젝트별 특수 지침을 분리해 GPT/Claude식 작업실 구조로 운영한다.
- 날짜, 테스트, 결정, 변경, 선호, 규칙처럼 기억할 만한 대화 문장은 자동 프로젝트 메모리 후보로 저장한다.
- Paperclip 상태, agent template, 최근 task는 GLM 챗의 운영 힌트로 사용한다.
- GLM 호출은 기본적으로 thinking을 활성화하고 충분한 budget을 둔다.
- GLM 추론 중에는 같은 프로젝트의 다음 메시지를 UI와 API 양쪽에서 막는다.
- 실패 시에는 입력문을 복원하고 재시도 가능한 실패 상태를 표시한다.
- 프로젝트별 메모리와 대화내용은 L1 memory에 보조 지식으로 저장하되, 대화내역은 `결정/검증된 지식이 아닐 수 있음`을 명시한다.
- 대화에서 나온 사실은 근거 Markdown으로 확인되거나 사용자가 결정해야만 프로젝트 본문 지식으로 승격한다.
- `위키 자체가 아니라 고객 프로젝트 업무 상태와 다음 액션으로 답한다` 류의 공통 원칙은 프로젝트 메모리가 아니라 전역 지침으로 관리한다.

## 권장 아키텍처

```text
Browser UI
  -> local wiki API
    -> markdown search/read
    -> drive_wikify CLI trigger
    -> GLM digest adapter
    -> GLM wiki chat adapter
    -> Paperclip context/task bridge
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

- GLM-backed OpenClaw automation trigger
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

- GLM-backed project operations chat

`GET /api/chat/projects`

- 프로젝트별 GLM 챗 지침, 메모리, 최근 대화 이력

`POST /api/chat/projects`

- GLM 챗 프로젝트 생성/수정

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

## 2026-04-29 v1 Screen Separation

- `운영`은 상태/예약/설정/스킬 카탈로그로 정리했다.
- `수집 파이프라인`은 보수적 Drive 수집부터 위키화 실행까지 사용자가 순서대로 누르는 화면으로 분리했다.
- `Paperclip`은 별도 작업장이 아니라 본 위키와 GLM 챗이 활용하는 컨텍스트 브리지로 정의했다.
- GLM 챗은 Paperclip 템플릿과 최근 task를 참고하지만, 이를 확정된 근거처럼 말하지 않도록 시스템 프롬프트에서 제한했다.
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
