---
type: schema
created: 2026-04-20
updated: 2026-04-29
source: ""
---

# Wiki Schema

이 파일은 이 Obsidian 위키에서 사용하는 규칙과 스키마를 정의합니다.

- 모든 페이지는 YAML 프런트매터(frontmatter)를 포함해야 합니다.
  - `type`: entity, project, process, knowledge, hub, schema, index, log 중 하나입니다.
  - `created`: ISO 8601 형식(YYYY-MM-DD)의 생성일입니다.
  - `updated`: ISO 8601 형식의 마지막 업데이트일입니다.
  - `source`: 원본 자료나 참고 링크를 기록합니다.
- 링크는 `[[Wiki/Namespace/Page]]` 형식으로 작성합니다.
- 허브(hub) 페이지는 해당 네임스페이스의 하위 페이지 목록을 포함합니다.
- 모든 페이지는 적어도 하나의 들어오는 링크와 나가는 링크를 갖도록 노력합니다.
- 민감한 자격증명(비밀번호, 토큰 등)은 wiki에 저장하지 않습니다.
- 개인 기록은 RTM 업무 위키에 저장하지 않습니다. 개인/업무가 섞인 이벤트는 업무상 필요한 사실만 프로젝트 문서에 남기고 개인 맥락은 별도 개인 공간에 둡니다.

## Repository Layers

- 이 저장소는 아래 3층 구조를 기준으로 운영합니다.
  - Raw sources: `obsidian/raw/`
  - Persistent wiki: `obsidian/Wiki/`
  - Schema and operating rules: `AGENTS.md`, `[[Wiki/Schema]]`, `[[Wiki/Common/Wiki_Ingest_Operating_Model]]`
- Raw sources는 원본 보존 계층이며, LLM이 읽을 수는 있어도 수정하지 않는 것을 기본값으로 합니다.
- Persistent wiki는 LLM이 유지보수하는 지식 계층입니다.
- Schema 계층은 LLM의 작업 방식과 문서 규칙을 고정하는 운영 문서입니다.

## Required Global Files

- `[[Wiki/index]]`는 내용 중심 인덱스입니다.
  - 허브, 프로젝트, 공통 지식, 핵심 운영 문서를 카테고리별로 연결합니다.
  - 새 프로젝트나 핵심 페이지가 생기면 함께 갱신합니다.
- `[[Wiki/log]]`는 시간 순 운영 로그입니다.
  - ingest, query 결과 문서화, lint, 구조 변경을 append-only로 기록합니다.
  - 각 엔트리는 날짜와 작업 종류를 제목에 포함합니다.

## Ingest Operating Principles

- 위키는 구조만 관리하지 말고 실제 내용도 관리합니다.
- 프로젝트 인제스트는 아래 3층 구조를 기본으로 운영합니다.
  - 원문 보존 계층: 실제로 읽은 문장, 수치, 결정사항, 충돌, 출처 위치를 보존합니다.
  - 정제 지식 계층: Project Overview, KPI, Risks, Decisions 등 재사용 가능한 지식을 정리합니다.
  - 이력/변경 관리 계층: 날짜별 변경, 충돌, 확정 여부, 버전 변화를 기록합니다.
- 결론 문서만 만들지 말고, 근거가 된 evidence도 반드시 함께 남깁니다.
- 해석과 원문 근거를 분리합니다.
- 모든 수치에는 문서명과 날짜를 함께 남깁니다.
- 상충되는 정보는 하나로 뭉개지 말고 충돌 상태로 기록합니다.
- 기존 문서는 덮어쓰지 말고 날짜형 업데이트 블록으로 append 하는 방식을 우선합니다.
- 인제스트나 대규모 정리 작업 뒤에는 `[[Wiki/index]]`와 `[[Wiki/log]]`도 함께 갱신합니다.

## Required Evidence Documents

- 각 프로젝트에는 아래 문서를 기본 관리 대상으로 둡니다.
  - `Sources.md`
  - `Evidence_Log.md`
  - `Change_Log.md`
  - `Conflict_Register.md`
- 문서 단위 원문 메모가 필요하면 `Document Notes/` 아래에 `YYYY-MM-DD_문서명.md` 형식으로 저장합니다.
- `Sources.md`는 문서 메타데이터와 연결 문서를 관리합니다.
- `Evidence_Log.md`는 핵심 문장, 수치, 산식, 결정 이유, 제약 조건의 발췌를 보관합니다.
- `Conflict_Register.md`는 상충 수치, 상충 주장, 미확정 판단을 보관합니다.
- `Change_Log.md`는 위키 구조 변경, 복구 이력, 핵심 업데이트를 기록합니다.
- `Evidence Log.md`, `Conflict Register.md`, `Change Log.md` 같은 space 방식 파일명은 새로 만들지 않습니다.

## Event Capture and Promotion

- 새 업무 이벤트는 바로 결론 문서로 정리하지 않고 아래 순서로 승격합니다.
  - 원본 이벤트 캡처
  - `Sources.md`에 출처 등록
  - `Evidence_Log.md`에 사실, 원문, 수치, 결정사항 추출
  - 충돌 또는 미확정 값은 `Conflict_Register.md`에 등록
  - 실제 문서 수정은 `Change_Log.md`에 기록
  - 프로젝트 상태가 바뀌면 `obsidian/L1_memory/{ProjectName}.md` 갱신

## Update Block Convention

- 기존 본문을 대체하는 방식보다 아래와 같은 날짜형 append 블록을 우선합니다.

```markdown
## Update - 2026-04-21
- Source: [[Sources]]
- Summary:
  - 새 문서 인제스트 결과 KPI 가정이 추가됨
- Evidence:
  - "유지보수 평균소요시간 4시간, 목표 30% 감소"
- Impact:
  - [[KPI]], [[Conflict_Register]] 갱신 필요
- Status:
  - 확인 필요
```

## Content Preservation Rules

- 요약만 저장하지 않습니다.
- 원문 전체를 복붙하지 않더라도, 맥락을 잃지 않을 정도의 발췌는 반드시 남깁니다.
- 수치 원문, 계산식, 결정 이유, 제약 조건은 가능한 한 원문 표현을 유지합니다.
- 출처 위치를 알 수 있다면 페이지, 섹션, 슬라이드 번호까지 남깁니다.
- 파일명과 본문 제목이 어긋나거나 문서 내용이 섞인 경우, 복구 사실을 `Change_Log.md`에 기록합니다.
