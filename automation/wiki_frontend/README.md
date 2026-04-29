# Wiki Frontend

로컬 Obsidian 위키 운영을 위한 콘솔형 프론트엔드 초안이다.

## 목적

- 자동화 명령 트리거
- 자동화 실행 중/에러 상태 표시와 중지
- 예약 기반 자동 실행
- OpenClaw 자동화 호출
- 전체 Google Drive 수집 상태 바
- 사용자가 순서대로 실행할 수 있는 `수집 파이프라인` 탭
- 위키 직접 조회와 Obsidian식 그래프맵
- 운영 설정 조회/수정
- 위키 검색, 근거 Markdown 선택, 선택 근거 GLM 정리
- 신규 지식 주입과 한국어 LLM 다이제스트 preview
- 처리 결과 확인
- GPT/Claude식 프로젝트별 GLM 업무 운영 chat
- Paperclip 기반 위키/GLM 컨텍스트 브리지
- 운영 스킬 카탈로그와 runtime MD draft 생성

## 현재 상태

이 디렉터리는 v0 frontend다.
`automation/wiki_api/` 서버와 연결되면 실제 wiki search, automation trigger, GLM chat을 호출하고, 서버가 없으면 mock fallback으로 동작한다.

## 위키 검색

- `검색`은 GLM을 호출하지 않고 Markdown 근거 목록만 빠르게 반환한다.
- 사용자가 체크한 Markdown만 `선택 근거 GLM 정리`로 보낸다.
- GLM 정리는 선택된 path의 원문 excerpt만 근거로 사용한다.

## 위키 탭

- `GET /api/wiki/index`로 `obsidian/Wiki/`와 `obsidian/L1_memory/`의 Markdown 목록을 직접 조회한다.
- 좌측 문서 목록에서 제목, 경로, frontmatter type 기준으로 필터링할 수 있다.
- 중앙 뷰어는 Markdown을 읽기 쉬운 HTML preview로 렌더링한다.
- 우측 그래프맵은 `[[wikilink]]`와 `.md` 링크를 기반으로 노드/링크를 시각화한다.

## 지식 주입

- 지식 주입 다이제스트는 한국어 출력을 기본으로 한다.
- GLM 프롬프트는 한국어 JSON 키와 한국어 설명을 요구한다.
- GLM 실패 또는 미연결 fallback도 `판정`, `출처 초안`, `핵심 근거 후보`, `충돌 후보`, `다음 액션` 형식의 한국어 초안으로 표시한다.
- GLM이 내부 분석문이나 비한국어 형식으로 응답하면 한국어 local digest로 자동 대체한다.

## GLM 챗

- GLM 챗은 위키 검색 결과를 설명하지 않고, 위키를 근거 저장소로 사용해 실제 업무 상태를 정리한다.
- 기본 응답 관점은 현재 업무상태, 진행/완료, 리스크/충돌, 다음 액션, 근거다.
- `위키 검색 결과`, `스니펫`, `메타데이터` 같은 메타 설명을 피하고 프로젝트 자체를 바로 다룬다.
- Paperclip 상태, agent template, 최근 task는 GLM 챗의 운영 힌트로 들어가며 별도 실행 결과처럼 과장하지 않는다.
- 화면은 좌측 프로젝트 목록, 중앙 대화, 우측 지침/메모리 패널 구조다.
- 전역 지침은 모든 GLM 챗에 공통 적용하고, 프로젝트별 지침은 해당 프로젝트만의 특수 규칙으로 분리한다.
- 프로젝트별 지침, 메모리, 대화 이력은 `automation/wiki_api/runtime/chat_projects.json`에 저장된다.
- 전역 지침은 `automation/wiki_api/runtime/chat_global_settings.json`과 `obsidian/L1_memory/GLM_Global_Instructions.md`에 저장된다.
- 같은 내용은 `obsidian/L1_memory/GLM_Chat_Projects/*.md`에 보조 지식으로 자동 동기화된다.
- 대화내역은 결정된 지식이 아닐 수 있으므로 GLM과 위키에서는 `auxiliary_not_decision`으로 취급한다.
- 대화 중 날짜, 테스트, 결정, 변경, 선호, 규칙처럼 기억할 만한 문장은 자동 프로젝트 메모리 후보로 저장한다.
- GLM 호출은 기본적으로 `GLM_THINKING_TYPE=enabled`, `GLM_THINKING_BUDGET_TOKENS=8192`를 사용해 깊게 검토하도록 유도한다.
- 채팅 중에는 `전송 중 -> GLM 추론중 -> 저장 중 -> 대기/실패` 상태를 표시하고, 추론 중 다음 메시지 입력을 잠근다.
- 같은 프로젝트에서 서버가 이미 추론 중이면 중복 요청은 `409 busy`로 막고 UI에 실패/재시도 상태를 보여준다.

## 수집 파이프라인

- 사용자는 `rclone copy 미리보기 -> manifest 생성 -> 위키화 실행 -> 커버리지 확인` 순서만 따라가면 된다.
- `전체 흐름 미리보기`는 dry-run 기준으로 하루 종일 돌릴 작업을 안전하게 점검하는 용도다.
- Drive 경로 기본값은 `gdrive: 최상위`이며, `RCLONE_REMOTE_PATH`를 비우면 전체 Drive 대상이 된다.
- 실행 로그와 중지 버튼은 이 탭에 모아 두고, 사이드바에는 어디서든 볼 수 있는 간단한 실행 상태만 유지한다.

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

- Paperclip은 본 위키와 GLM 챗이 사용할 컨텍스트 브리지다.
- `Agent Templates`: Drive Collector, Manifest Builder, Wiki Ingest Operator, OpenClaw Orchestrator, Validator 템플릿을 표시한다.
- `컨텍스트 Task 생성`: 템플릿을 골라 local queue에 추가하거나 즉시 실행한다.
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
