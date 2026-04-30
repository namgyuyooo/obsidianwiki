# Slack Collection Operating Model

이 문서는 Obsidian wiki 자동화 계층에서 Slack을 어떻게 수집하고, 어떤 경계로 위키에 승격하는지 정의한다.

## 목적

- Codex 세션에 의존하지 않는 Slack 자체 수집 경로를 둔다.
- Slack 메시지/스레드/파일 메타데이터를 먼저 raw evidence로 보존한다.
- 그 다음 필요한 사실만 `Sources.md`, `Evidence_Log.md`, `Conflict_Register.md`, `Change_Log.md`로 승격한다.

## 원칙

- Slack 수집은 `read-only`다.
- Slack 원문과 위키 결론을 한 번에 합치지 않는다.
- 읽지 않은 첨부파일 본문은 확정 사실처럼 쓰지 않는다.
- 비공개 채널 범위는 최소화한다.
- 기본 경로는 Slack API 토큰 기반 증분 수집이다.

## 시스템 구성

- 설정:
  - `automation/drive_wikify/config/.env`
- 수집기:
  - `automation/drive_wikify/src/drive_wikify/slack_collector.py`
- CLI:
  - `drive_wikify.cli slack-channels`
  - `drive_wikify.cli slack-collect`
- API:
  - `GET /api/slack/status`
  - `GET /api/slack/channels`
  - `POST /api/slack/collect`
- 운영 연결:
  - `automation/wiki_api/server.mjs`
  - `automation/wiki_frontend/index.html`

## 필수 설정

- `SLACK_BOT_TOKEN` 또는 `SLACK_USER_TOKEN`
- `SLACK_CHANNEL_TYPES`
- `SLACK_CHANNELS`
- `SLACK_EXPORT_ROOT`
- `SLACK_STATE_PATH`
- `SLACK_HISTORY_LIMIT`
- `SLACK_OLDEST_DAYS`
- `SLACK_INCLUDE_THREADS`
- `SLACK_INCLUDE_FILES`

## 실행 흐름

1. `slack-channels`로 접근 가능한 채널 목록을 확인한다.
2. 사용자가 채널을 선택하면 `slack-collect`로 raw export를 만든다.
3. raw export는 `obsidian/raw/exports/slack/YYYY-MM-DD/...json`에 저장한다.
4. 증분 기준은 `automation/wiki_api/runtime/slack_collection_state.json`에 저장한다.
5. filtered export 생성 후, 분기된 `wiki_target` 기준으로 `Sources.md`, `Evidence_Log.md`, `Conflict_Register.md`, `Change_Log.md`에 append 승격한다.

## 권장 사용 패턴

### 1. 채널 탐색

```bash
PYTHONPATH=automation/drive_wikify/src python3 -m drive_wikify.cli slack-channels --json
```

### 2. 특정 채널 수집

```bash
PYTHONPATH=automation/drive_wikify/src python3 -m drive_wikify.cli slack-collect \
  --channel sales_team \
  --channel pjt_zeus_ai바우처 \
  --json
```

### 3. 미리보기

```bash
PYTHONPATH=automation/drive_wikify/src python3 -m drive_wikify.cli slack-collect \
  --channel sales_team \
  --dry-run \
  --json
```

## 위키 승격 규칙

- 채널/메시지 묶음은 먼저 `Sources.md` 후보가 된다.
- 핵심 문장, 수치, 결정, 일정, 담당, 링크는 `Evidence_Log.md` 후보가 된다.
- 버전 차이, 일정 충돌, 상충 메시지는 `Conflict_Register.md` 후보가 된다.
- 실제 위키 반영 행위만 `Change_Log.md`에 남긴다.

## 아직 안 한 것

- Slack export zip/json 전용 파서
- 채널별 증분 수집 스케줄 UI
- GLM 필터 실패 원인별 운영 알림 고도화
