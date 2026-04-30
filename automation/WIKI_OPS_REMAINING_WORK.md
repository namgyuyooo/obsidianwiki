# Wiki Ops 남은 작업

이 문서는 현재 구현 상태에서 제품화까지 남은 작업을 운영 관점으로 정리합니다. 원칙은 `Mission Control -> 표적 수집 -> 위키화 -> 결정 큐 -> 프로젝트 추진` 흐름을 줄이지 않고 선명하게 만드는 것입니다.

## P0. 수집 성공 경험

- 진행 중: Docker 환경에서 `rclone-copy` 실제 실행을 시작했습니다. 기본 30분 수집 창과 local mirror 재개 전략을 사용합니다.
- 확인됨: `rclone-copy` 진행 로그가 `/api/automation/status`에 기록되고, 대상 크기/파일 수를 스캔하고 있습니다.
- 구현됨: 수집 완료 후 `build-manifest -> run -> refresh-global`을 한 번에 이어 실행하는 `continue-after-collection` API와 Pipeline 버튼을 추가했습니다.
- 구현됨: 다음 rclone copy부터는 `ALLOWED_FILE_TYPES` 기준 ordered `--filter`로 문서 확장자만 include하고 나머지는 exclude해 전체 Drive 대용량 파일 복사를 피합니다.
- 구현됨: `xlsx/xls/csv`도 수집 대상과 extractor에 포함했습니다.
- 구현됨: `--check-first`를 제거해 전체 체크가 끝나기 전에도 발견 즉시 전송/진행 피드백이 나오게 했습니다.
- 현재 manifest/run output이 비어 있으면 Mission Control과 Pipeline에서 즉시 원인을 보여줘야 합니다.
- rclone copy 진행률, 현재 복사 파일, 전송량, 최근 오류를 UI에 실시간으로 표시해야 합니다.
- Drive의 `Github`, `GitHub`, `github`, `Obsidian_wiki`, `obsidianwiki` 경로는 자기참조 수집 방지를 위해 계속 제외합니다.
- 기본 Drive 경로는 최상위입니다.

## P1. Paperclip Agent 실행 연결

- 현재 Paperclip Agent는 Chat, 지식승격, 자동화 완료 후 `agent_suggested` 작업을 생성합니다.
- 구현됨: 기존 `agent_suggested`/`queued` 작업을 ID로 승인 실행하는 API와 Paperclip Studio 버튼을 추가했습니다.
- 구현됨: Paperclip 결과 Markdown/검증 결과는 확정 위키에 바로 쓰지 않고 Decision Queue 검토 항목으로 보냅니다.
- Paperclip Studio는 스킬 조회 화면이고, 실제 제품 흐름에서는 GLM Chat과 위키화 과정의 백그라운드 에이전트로 작동해야 합니다.

## P2. Decision Queue 확정 반영

- 지식승격, 충돌, 결정 필요 자료, GLM draft는 확정 위키에 바로 들어가면 안 됩니다.
- 승인, 수정 후 승인, 보류, 폐기, 추가 조사 상태를 Hub, Decisions, Risks, Action_Items에 append-only 방식으로 반영하는 실제 write path를 더 촘촘히 검증해야 합니다.

## P3. LLM 사용 최소화 로그

- GLM 호출 로그는 추가됐지만, `local-rule`, `manual`, `hybrid` 실행 로그는 아직 전 기능에 일관되게 연결되지 않았습니다.
- 구현됨: 자동화 명령 완료 시 `automation:<command>`를 `local-rule` provider로 usage log에 기록합니다.
- Wiki 검색, 기본 Spotlite, Drive 후보 점수화, 상태/태그/coverage는 GLM 없이 동작해야 합니다.
- GLM은 Chat, 브리핑, Paperclip 산출물, 자연어 위키 관리 diff 생성에 집중시킵니다.

## P4. Project Command Center 고도화

- 프로젝트별 `CEO Brief`, `PM Action Plan`, `Customer Follow-up`, `Risk Review`는 사용자가 버튼을 눌렀을 때만 GLM draft를 생성합니다.
- Hub는 위키 변경 이력이 아니라 실제 운영/실무 추진내용을 일자 기준으로 보여야 합니다.
- 프로젝트 메모만 봐도 현재 추진 상태와 다음 액션을 이해할 수 있어야 합니다.

## P5. Docker 이식성

- 구현됨: `Dockerfile`, `docker-compose.yml`, Docker용 env 예시, rclone/GLM/OpenClaw/Paperclip 인증키 외부 config 마운트.
- 검증됨: Docker Desktop 환경에서 `docker compose up --build`, API healthcheck, rclone remote 인식, `rclone-copy --dry-run`을 확인했습니다.
- 인증키는 `docker/config`에 넣을 수 있지만 git에는 올리지 않습니다.
