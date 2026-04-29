---
type: knowledge
created: 2026-04-29
updated: 2026-04-29
source: "Paperclip public docs plus local Drive Wikify automation design"
---

# Paperclip Wiki Control Plane Plan

Paperclip은 이 위키의 저장소나 검색엔진을 대체하지 않는다.
이 위키에서는 Paperclip을 본 위키와 GLM 챗이 활용하는 `context bridge + agent control plane`으로 두고, 실제 지식 저장과 근거 보존은 계속 `obsidian/Wiki/`, `obsidian/L1_memory/`, `automation/drive_wikify/`가 담당한다.

## 적용 판단

Paperclip의 강점은 아래에 있다.

- agent 역할, goal, task, budget, heartbeat 관리
- Codex, OpenClaw, shell process, HTTP agent를 같은 보드에서 관리
- 작업 승인, 실행 이력, 비용 추적, run transcript 확인

위키 운영에 바로 맞는 지점:

- GLM 챗이 참고할 수 있는 agent/template/task 상태 컨텍스트
- 하루 종일 도는 Drive 수집 job의 상태판
- `rclone-copy`, `build-manifest`, `run`, `validate` 같은 명령 트리거
- OpenClaw/Codex/GLM 역할 분리
- 실패한 batch의 재시도와 hold 검토
- 신규 지식 주입 후 처리 결과 승인

맞지 않는 지점:

- 원본 Google Drive를 직접 삭제하거나 정리하는 주체
- Obsidian wiki 파일 구조를 대체하는 CMS
- LLM이 모든 문서를 즉석에서 다시 읽는 검색 시스템

## Paperclip 안의 권장 조직

Company:

- `RTM Wiki Operations`

Goals:

- `Drive evidence를 보수적으로 수집하고 위키에 근거 보존형으로 반영`
- `신규 지식 주입 시 프로젝트 판정, 충돌 등록, L1 memory 갱신`
- `위키 검색/조회/챗 인터페이스를 안정적으로 유지`

Agents:

- `Drive Collector`
  - adapter: `process`
  - command: `drive_wikify.cli rclone-copy`, `build-manifest`
  - write target: `automation/drive_wikify/runtime/`
- `Wiki Ingest Operator`
  - adapter: `codex_local` 또는 `openclaw`
  - command: `drive_wikify.cli run`
  - write target: `obsidian/Wiki/`, `obsidian/L1_memory/`
- `GLM Triage Agent`
  - adapter: `http`
  - role: metadata triage, duplicate clustering, digest review
- `Validator`
  - adapter: `process` 또는 `codex_local`
  - role: sources/evidence/conflict/change log 누락 점검
- `Frontend Operator`
  - adapter: `codex_local`
  - role: local dashboard, API contract, UI regression 점검

## 연결 방식

Paperclip은 아래 실행 표면만 호출한다.

- `automation/drive_wikify/src/drive_wikify/cli.py`
- `automation/wiki_frontend/`
- 향후 `automation/wiki_api/`

직접 접근 금지:

- Google Drive remote delete
- `rclone sync`, `rclone delete`, `rclone purge`
- `DRIVE_DELETE_SOURCE=true`

## 안전 게이트

Paperclip task가 위키에 write하기 전 반드시 확인할 것:

- `DRIVE_DELETE_SOURCE=false`
- 처리 대상이 local mirror 또는 wiki repo인지 확인
- 신규 프로젝트 생성 시 `Sources`, `Evidence_Log`, `Change_Log`, `Conflict_Register`, `L1_memory` 생성 여부 확인
- GLM digest가 단정한 값과 원문 evidence가 충돌하면 `hold_for_review`
- 원본 문서 추출 실패 시 파일 존재만으로 지식 반영하지 않음

## 1차 도입 순서

1. Paperclip은 별도 프로세스로 설치하고, 이 repo를 `cwd`로 지정한다.
2. `process` adapter로 `rclone-copy --dry-run`, `build-manifest`, `run`을 각각 task template화한다.
3. `codex_local` agent에는 `AGENTS.md`와 Drive Wikify 문서를 instructions로 연결한다.
4. GLM API는 HTTP adapter 또는 별도 local API를 통해 digest/triage만 맡긴다.
5. 위키 프론트엔드는 Paperclip 보드보다 더 세밀한 `wiki operator UI`로 둔다.

## 결론

Paperclip은 이 시스템의 `위키/GLM 컨텍스트 브리지이자 상위 작업 관리판`이다.
위키 프론트엔드는 `로컬 지식 운영 화면`이고, `drive_wikify`는 실제 실행기다.
따라서 전체 구조는 아래처럼 나눈다.

```text
Paperclip
  -> agents, goals, heartbeat, task audit, GLM context hints

Wiki Frontend
  -> search, read, trigger, ingest, digest, local chat

Drive Wikify Automation
  -> rclone copy, manifest, extraction, wiki write, local mirror cleanup

Obsidian Wiki
  -> source-preserving long-term knowledge base
```

## 2026-04-29 v1 Frontend Context Bridge

`automation/wiki_api/`와 `automation/wiki_frontend/`에서 Paperclip을 전용 실행 화면이 아니라 위키/GLM 컨텍스트 브리지로 재정의했다.

- `GET /api/paperclip/status`는 `PAPERCLIP_URL` reachability, agent template, task queue, event log를 함께 반환한다.
- `GET /api/paperclip/templates`는 Drive Collector, Manifest Builder, Wiki Ingest Operator, OpenClaw Orchestrator, Validator 템플릿을 반환한다.
- `POST /api/paperclip/tasks`는 선택 템플릿으로 local Paperclip task를 큐에 추가한다.
- `POST /api/paperclip/trigger`는 task를 생성한 뒤 `rclone-copy --dry-run`, `build-manifest`, `run`, `openclaw`, `validate` 중 템플릿 명령을 실행한다.
- frontend의 Paperclip 탭은 bridge 상태, 컨텍스트 task composer, agent templates, task queue, append-only event log를 표시한다.
- GLM 챗은 Paperclip 상태, 템플릿, 최근 task를 운영 힌트로 받되 이를 확정된 실행 결과처럼 과장하지 않는다.
- 모든 task payload에는 `driveDeleteSource=false`, `remoteDeleteAllowed=false`를 고정한다.

다음 구현에서 붙일 것:

- Paperclip company id 설정
- 외부 Paperclip task create API 스키마 확정 후 local queue와 실제 Paperclip task 동기화
- task별 승인 게이트
- heartbeat / long-running task progress stream
