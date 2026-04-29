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
- markdown 페이지 조회
- `drive_wikify.cli` 안전 명령 트리거
- 실행 중 자동화 상태 조회와 중지
- `once`, `daily`, `interval` 예약 실행
- Drive Wikify `.env` 운영 설정 조회/수정
- OpenClaw webhook 자동화 트리거
- 전체 Google Drive 수집 상태 요약
- 신규 지식 digest draft
- GLM 기반 wiki chat
- Paperclip bridge 상태 확인

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
- `OPENCLAW_WEBHOOK_URL`: OpenClaw webhook endpoint
- `OPENCLAW_API_KEY`: OpenClaw webhook bearer token
- `PAPERCLIP_URL`: Paperclip 상태 확인 URL, 기본 `http://127.0.0.1:3000`
- `PAPERCLIP_API_KEY`: Paperclip bridge bearer token 후보
