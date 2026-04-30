# Wiki API

로컬 위키 운영 콘솔을 위한 의존성 없는 Node API 서버다.

## 실행

```bash
node automation/wiki_api/server.mjs
```

기본 URL:

```text
http://127.0.0.1:8787
```

## 제공 기능

- `automation/wiki_frontend/` 정적 파일 서빙
- 위키/L1 memory markdown 검색
- 위키/L1 memory markdown index와 링크 graph 생성
- markdown 페이지 조회
- `drive_wikify.cli` 안전 명령 트리거
- Slack 채널 목록 조회와 raw evidence 수집 트리거
- 실행 중 자동화 상태 조회와 중지
- `once`, `daily`, `interval` 예약 실행
- Drive Wikify `.env` 운영 설정 조회/수정
- GLM-backed OpenClaw 자동화 트리거
- 전체 Google Drive 수집 상태 요약
- 신규 지식 digest draft
- 전역 지침과 프로젝트별 특수 지침/메모리를 분리 저장하는 GLM 업무 운영 chat
- 프로젝트별 GLM 추론 lock과 `/api/chat/status` 실행 상태 조회
- 프로젝트별 GLM 챗 지침/메모리/최근 대화의 L1 memory 보조 지식 동기화
- 대화 중 기억할 만한 날짜/결정/테스트/선호/규칙을 자동 프로젝트 메모리 후보로 저장
- Paperclip bridge 상태를 GLM chat 운영 컨텍스트로 주입

## 안전 원칙

- 원본 Google Drive 삭제 명령은 제공하지 않는다.
- 허용된 automation command만 실행한다.
- 예약 실행도 같은 allowlist와 `DRIVE_DELETE_SOURCE=false` 원칙을 따른다.
- `rclone-copy`는 `rclone copy`만 사용한다.
- `DRIVE_DELETE_SOURCE=true`면 `drive_wikify.cli`가 중단한다.
- `POST /api/settings`는 allowlist에 있는 운영 키만 수정한다.
- `DRIVE_DELETE_SOURCE`는 API에서 수정할 수 없다.

## 주요 환경값

- `WIKI_API_PORT`: 기본 `8787`
- `WIKI_API_HOST`: 기본 `127.0.0.1`
- `GLM_API_KEY`: GLM digest/chat에서 사용
- `GLM_API_URL`: GLM endpoint. Z.ai Lite Coding Plan은 `https://api.z.ai/api/coding/paas/v4` 사용
- `GLM_MODEL`: GLM 모델명
- `GLM_THINKING_TYPE`: 기본 `enabled`
- `GLM_THINKING_BUDGET_TOKENS`: 기본 `8192`
- `OPENCLAW_WEBHOOK_URL`: OpenClaw 전용 override. 비우면 `GLM_API_URL` 사용
- `OPENCLAW_API_KEY`: OpenClaw 전용 override. 비우면 `GLM_API_KEY` 사용
- `PAPERCLIP_URL`: Paperclip 상태 확인 URL, 기본 `http://127.0.0.1:3000`
- `PAPERCLIP_API_KEY`: Paperclip bridge bearer token 후보
- `SLACK_BOT_TOKEN` / `SLACK_USER_TOKEN`: Slack raw 수집 인증
- `SLACK_CHANNELS`: 기본 수집 채널 셀렉터
- `SLACK_EXPORT_ROOT`: raw Slack export 저장 위치

## 역할 분리

- `수집 파이프라인`: rclone 미리보기, manifest 생성, 위키화 실행, OpenClaw/GLM 트리거, 실행 로그를 담당한다.
- `Slack 수집`: 채널 목록 조회, 증분 수집, raw export/state 보존을 담당한다.
- `운영`: 상태, 예약, 설정, 스킬 카탈로그를 담당한다.
- `Paperclip`: 독립 지식 저장소가 아니라 위키와 GLM 챗이 참고할 agent/template/task 컨텍스트 브리지다.

## GLM 챗 보조 지식 저장

- `automation/wiki_api/runtime/chat_projects.json`은 런타임 원본이다.
- `automation/wiki_api/runtime/chat_global_settings.json`은 모든 GLM 챗에 적용되는 전역 운영 지침 원본이다.
- 전역 지침은 `obsidian/L1_memory/GLM_Global_Instructions.md`로 자동 동기화한다.
- 같은 내용은 `obsidian/L1_memory/GLM_Chat_Projects/*.md`로 자동 동기화한다.
- 이 문서들은 `auxiliary_not_decision` 성격이며, 대화내역은 결정/검증된 사실이 아니라 보조 맥락으로만 사용한다.
- 프로젝트별 자동 메모리는 `source: auto_from_chat`, `confidence: auxiliary_not_decision`으로 저장한다.
- 같은 프로젝트에서 GLM이 추론 중이면 다음 `/api/chat/glm` 요청은 `409 busy`로 거절한다.
