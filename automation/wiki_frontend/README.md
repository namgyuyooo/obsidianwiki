# Wiki Frontend

로컬 Obsidian 위키 운영을 위한 콘솔형 프론트엔드 초안이다.

## 목적

- 자동화 명령 트리거
- 자동화 실행 중/에러 상태 표시와 중지
- 예약 기반 자동 실행
- OpenClaw 자동화 호출
- 전체 Google Drive 수집 상태 바
- 운영 설정 조회/수정
- 위키 검색, 근거 Markdown 선택, 선택 근거 GLM 정리
- 신규 지식 주입과 LLM digest preview
- 처리 결과 확인
- GLM 기반 업무 운영 chat
- Paperclip task/control plane 전용 작업대
- 운영 스킬 카탈로그와 runtime MD draft 생성

## 현재 상태

이 디렉터리는 v0 frontend다.
`automation/wiki_api/` 서버와 연결되면 실제 wiki search, automation trigger, GLM chat을 호출하고, 서버가 없으면 mock fallback으로 동작한다.

## 위키 검색

- `검색`은 GLM을 호출하지 않고 Markdown 근거 목록만 빠르게 반환한다.
- 사용자가 체크한 Markdown만 `선택 근거 GLM 정리`로 보낸다.
- GLM 정리는 선택된 path의 원문 excerpt만 근거로 사용한다.

## GLM 챗

- GLM 챗은 위키 검색 결과를 설명하지 않고, 위키를 근거 저장소로 사용해 실제 업무 상태를 정리한다.
- 기본 응답 관점은 현재 업무상태, 진행/완료, 리스크/충돌, 다음 액션, 근거다.
- `위키 검색 결과`, `스니펫`, `메타데이터` 같은 메타 설명을 피하고 프로젝트 자체를 바로 다룬다.

## 열기

권장 실행:

```bash
node automation/wiki_api/server.mjs
```

그 다음 브라우저에서 아래 주소를 연다.

```text
http://127.0.0.1:8787
```

## Paperclip 탭

- `Agent Templates`: Drive Collector, Manifest Builder, Wiki Ingest Operator, OpenClaw Orchestrator, Validator 템플릿을 표시한다.
- `Task 생성`: 템플릿을 골라 local queue에 추가하거나 즉시 실행한다.
- `Task Queue`: 최근 Paperclip task 상태를 보여준다.
- `Event Log`: task 생성/완료 이벤트를 append-only로 남긴다.

## 자동화 운영

- 사이드바에 최신 자동화 상태, 실행 중 명령, stderr/stdout 요약을 표시한다.
- `현재 작업 중지`는 실행 중인 로컬 `drive_wikify.cli` 프로세스에 `SIGTERM`을 보낸다.
- 예약 실행은 `once`, `daily`, `interval` 모드를 지원하고 `automation/wiki_api/runtime/schedules.json`에 저장한다.
- 예약 실행도 수동 실행과 같은 안전 allowlist를 사용한다.

## 운영 스킬

- 적용 완료: `보고서 작성용 MD 생성`, `코딩 작업 스킬`, `근거 검증 스킬`
- 후보 표시: Graphify, Documents, Presentations, GitHub MCP, Playwright MCP, Filesystem/Fetch MCP, Sequential Thinking MCP
- UI에서 생성한 초안은 `automation/wiki_api/runtime/skill_outputs/*.md`에 저장한다.
- MCP 설치는 권한 경계가 생기므로 별도 승인 후 진행한다.

## 다음 단계

- Paperclip 외부 API 스키마가 확정되면 local queue를 실제 Paperclip task create 호출과 연결
- write preview와 승인 단계 구현

## 안전 원칙

- 원본 Google Drive 삭제 기능은 만들지 않는다.
- 자동 정리는 `local mirror` 파일에만 적용한다.
- destructive command는 UI command palette에 노출하지 않는다.
- `운영 설정`에서 수정 가능한 값은 allowlist로 제한한다.
- `DRIVE_DELETE_SOURCE`는 화면에서 잠겨 있으며 API에서도 수정할 수 없다.
- OpenClaw 호출은 전용 override가 없으면 GLM API URL/key를 재사용하며 Drive 원본 삭제 명령을 포함하지 않는다.
