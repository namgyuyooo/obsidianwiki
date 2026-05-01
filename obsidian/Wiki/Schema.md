---
type: schema
created: 2026-04-20
updated: 2026-05-01
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
- 허브(hub) 페이지는 해당 네임스페이스의 하위 페이지 목록뿐 아니라, 실무 추진 현황과 증적을 관리하는 운영 현황판이어야 합니다.
- 모든 페이지는 적어도 하나의 들어오는 링크와 나가는 링크를 갖도록 노력합니다.
- 민감한 자격증명(비밀번호, 토큰 등)은 wiki에 저장하지 않습니다.
- 개인 기록은 RTM 업무 위키에 저장하지 않습니다. 개인/업무가 섞인 이벤트는 업무상 필요한 사실만 프로젝트 문서에 남기고 개인 맥락은 별도 개인 공간에 둡니다.
- 개인 위키를 운영할 경우 이 저장소 내부 하위 폴더가 아니라 별도 vault/repository/service로 분리합니다.
- 업무 위키와 개인 위키는 구조와 운영 규칙은 닮을 수 있지만 raw source root, persistent wiki root, L1 memory root, automation runtime, connector/auth context는 분리합니다.

## Space Type Schema

- `project`: 독립 실행 단위. 증적, 액션, 결정, 리스크, L1 메모리를 함께 관리합니다.
- `account`: 고객/계정 단위 상위 공간. 여러 프로젝트의 관계, 상업 상태, 계정 차원의 막힘과 다음 접점을 관리합니다.
- `common`: 운영 규칙, 자동화, 인덱스, 제도, 공통 운영 자산을 관리합니다.
- `shared`: 프로젝트에서 승격된 재사용 자산을 관리합니다.

모든 top-level 폴더를 같은 템플릿으로 맞추지 않습니다. 공간 유형에 따라 허브 역할과 필수 문서가 달라집니다.

## Repository Layers

- 이 저장소는 아래 3층 구조를 기준으로 운영합니다.
  - Raw sources: `obsidian/raw/`
  - Persistent wiki: `obsidian/Wiki/`
  - Schema and operating rules: `AGENTS.md`, `[[Wiki/Schema]]`, `[[Wiki/Common/Wiki_Ingest_Operating_Model]]`
- 개인용 twin vault를 만들더라도 동일한 3층 구조를 별도 루트에서 독립적으로 복제하는 방식을 기본값으로 합니다.
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
- 프로젝트 인제스트는 아래 4층 구조를 기본으로 운영합니다.
  - 참조 보존 계층: 링크, URL, Drive 분류 경로, Slack 링크, 웹 링크, 로컬 경로, 파일명 fallback, 재수집 식별자를 보존합니다.
  - 원문 보존 계층: 실제로 읽은 문장, 수치, 결정사항, 충돌, 출처 위치를 보존합니다.
  - 정제 지식 계층: Project Overview, KPI, Risks, Decisions 등 재사용 가능한 지식을 정리합니다.
  - 이력/변경 관리 계층: 날짜별 변경, 충돌, 확정 여부, 버전 변화를 기록합니다.
- 수집 경로별로 생성된 `Slack_*`, Drive 기반, filesystem 기반, 지식주입 기반 공간은 일단 provisional intake view로 보고, 기존 위키와의 통합/분리 판단을 `Decisions.md`에서 검토합니다.
- `Decisions.md`의 핵심 목적은 개별 판단을 남기는 것뿐 아니라, 흩어진 위키를 대표 공간 기준으로 통합·정제하는 것입니다.
- 이 검토 결과는 `기존 project 편입`, `새 canonical project 승격`, `account/common/shared 이동`, `보류` 중 하나로 끝나야 합니다.
- 결론 문서만 만들지 말고, 근거가 된 evidence와 참조 레지스터도 반드시 함께 남깁니다.
- 해석과 원문 근거를 분리합니다.
- 모든 수치에는 문서명과 날짜를 함께 남깁니다.
- 상충되는 정보는 하나로 뭉개지 말고 충돌 상태로 기록합니다.
- 기존 문서는 덮어쓰지 말고 날짜형 업데이트 블록으로 append 하는 방식을 우선합니다.
- 인제스트나 대규모 정리 작업 뒤에는 `[[Wiki/index]]`와 `[[Wiki/log]]`도 함께 갱신합니다.

## Hub Operating Standard

- 모든 `hub.md`는 단순 인덱스나 관리 이력이 아니라 프로젝트/고객사/운영 단위의 실무 추진 현황판입니다.
- 허브는 기본적으로 `지금 무엇을 봐야 하는지`와 `다음에 무엇을 해야 하는지`를 빠르게 보여줘야 합니다.
- 허브에는 아래 섹션을 우선 포함합니다.
  - `## 운영 메모`: 메모만 읽어도 현재 진행상황, 실무 맥락, 다음 확인 항목을 파악할 수 있게 합니다.
  - `## 실행 현황판`: 현재 상태, 단계, 마지막 의미 있는 갱신, 오너/대상, 다음 액션을 짧게 표시합니다.
  - `## 현재 막힘 / 충돌`: 미확정 값, 고객 확인 필요, 내부 판단 대기, 일정 위험 등 실무 막힘을 보이게 둡니다.
  - `## 다음 액션`: 바로 실행할 일과 확인 질문을 남깁니다.
  - `## 최근 업데이트`: 언제 무엇을 했고, 그 일이 실무적으로 어떤 의미인지 표로 남깁니다.
  - `## 증적/근거 링크`: 추진내용을 뒷받침하는 Reference_Register, Evidence_Log, 원문 문서를 연결합니다.
  - `## 운영 링크`: Status, Reference_Register, Overview, Action_Items, Risks, Decisions, Conflict_Register, Change_Log로 이동할 수 있게 합니다.
- `운영 메모`는 아래 4줄을 우선 유지합니다.
  - `한줄 요약`: 지금 이 프로젝트/고객사/운영 단위가 어떤 상태인지 한 문장으로 씁니다.
  - `진행 맥락`: 왜 이 일이 진행 중이고 어디까지 왔는지 씁니다.
  - `실무 판단`: 업무상 무엇을 판단해야 하는지, 무엇이 아직 미확정인지 씁니다.
  - `다음 확인`: 다음 액션, 확인 대상, 담당/고객/산출물/리스크를 씁니다.
- 최근 업데이트 표는 아래 관점을 기준으로 남깁니다.
  - `일시`: ISO 8601 시각 또는 YYYY-MM-DD 날짜입니다.
  - `추진내용`: 실제 수행한 업무, 승격, 정리, 검토, 수집, 결정 준비 내용입니다.
  - `실무 의미`: 고객 프로젝트 운영상 무엇이 바뀌었는지, 다음 판단에 어떤 영향을 주는지입니다.
  - `연결 증적`: 근거 문서, 원문 파일, Evidence_Log, Sources 링크입니다.
  - `다음 액션`: 누가 무엇을 확인하거나 실행해야 하는지입니다.
- `Change_Log.md`는 위키 구조/내용 변경 이력이고, 허브의 운영 메모와 일시별 추진내용은 실제 실무 추진 상태를 보는 현황판입니다. 둘은 목적이 다르므로 둘 다 유지합니다.
- “허브 표준화”, “위키 정리”, “문서 목록 전환”처럼 위키 내부 관리 행위만 설명하는 문장은 허브의 핵심 진행기록으로 쓰지 않습니다. 그런 내용은 필요하면 `Change_Log.md`에만 남깁니다.
- 허브에는 확정되지 않은 대화나 임시 추론을 최종 사실처럼 쓰지 않습니다. 다만 미확정 내용이 모두 conflict는 아닙니다. 실무 질문, 후속 확인, 구조 해석은 `Status.md`, `Action_Items.md`, `Risks.md`, `Decisions.md`, `hub.md`로 보내고, 명시적 상충값만 `Conflict_Register.md`에 둡니다.

### Space Type별 허브 기준

- `project` 허브
  - `운영 메모`, `실행 현황판`, `현재 막힘 / 충돌`, `다음 액션`, `최근 업데이트`, `운영 링크`를 기본 포함합니다.
  - `Status.md`, `Reference_Register.md`, `Project_Overview.md`, `Sources.md`, `Evidence_Log.md`, `Conflict_Register.md`, `Change_Log.md`, `Decisions.md`, `Action_Items.md`, `Risks.md`를 기본 운영 대상으로 둡니다.
- `account` 허브
  - 계정 현재 상태, 활성 프로젝트, 공통 리스크, 다음 접점, 프로젝트 관계 링크를 기본 포함합니다.
  - 계정 공간은 여러 프로젝트를 조정하는 상위 현황판이며, 모든 증적 문서를 자체 보유할 필요는 없습니다.
- `common` 허브
  - 운영 모델, 자동화 진입점, 승격 큐, 거버넌스 상태, 자주 쓰는 공통 문서를 보이게 둡니다.
- `shared` 허브
  - 재사용 가능한 자산 목록, 소비 대상 프로젝트/공통 문서, 승격 출처를 중심으로 관리합니다.

## Required Evidence Documents

- 각 프로젝트에는 아래 문서를 기본 관리 대상으로 둡니다.
  - `Status.md`
  - `Reference_Register.md`
  - `Sources.md`
  - `Evidence_Log.md`
  - `Change_Log.md`
  - `Conflict_Register.md`
- `Status.md`는 현재 상태, 단계, 헬스, 담당, 막힘, 다음 게이트, 상태 변경 이력을 관리하는 프로젝트 상태 레지스터입니다.
- `Reference_Register.md`는 링크 우선 참조 레지스터입니다. Slack 링크, 웹 링크, Google Drive 링크, 로컬 경로를 우선 기록하고, 안정적인 링크를 남기기 어렵다면 반드시 파일명 또는 경로 fallback을 남깁니다.
- 임시 mirror/cache 경로는 장기 참조값으로 쓰지 않고, `channel id`, `last_export_path`, `collection state path`, `Shared Drive 이름`, `상위 폴더 경로`, `file id` 같은 재수집 식별자를 남깁니다.
- 문서 단위 원문 메모가 필요하면 `Document Notes/` 아래에 `YYYY-MM-DD_문서명.md` 형식으로 저장합니다.
- `Reference_Register.md`는 요약된 참조 항목, 설명 위치, 관련 문서, URL/경로/fallback 파일명을 관리합니다.
- `Sources.md`는 상세한 출처 메타데이터나 레거시 원문 관리가 필요한 경우에만 보조적으로 사용합니다.
- `Evidence_Log.md`는 핵심 문장, 수치, 산식, 결정 이유, 제약 조건의 발췌를 보관합니다.
- `Conflict_Register.md`는 상충 수치, 상충 주장, 버전 불일치처럼 동시에 current truth로 둘 수 없는 항목을 보관합니다.
- `Change_Log.md`는 위키 구조 변경, 복구 이력, 핵심 업데이트를 기록합니다.
- `Decisions.md`는 대표 위키 선정, intake별 중복 후보 검토, 병합/분리/보류 판단, 후속 반영 문서를 기록하는 통합 검토 레지스터입니다.
- `Evidence Log.md`, `Conflict Register.md`, `Change Log.md` 같은 space 방식 파일명은 새로 만들지 않습니다.
- 다만 `Conflict_Register.md`는 실제 상충값, 상충 주장, 버전 불일치처럼 충돌이 명시적인 경우에 우선 사용합니다.
- 단순한 `검토 필요`, `정합성 확인`, `허브/상태/액션 업데이트 필요`는 conflict보다 `Action_Items.md`, `Decisions.md`, `Risks.md`, `Status.md`, `hub.md` 업데이트로 먼저 흡수합니다.
- 프로젝트 경계, 차수 연결, 범위 해석, 미팅 질문, 구조 메모 같은 약한 항목은 conflict가 아니라 운영 문서의 문제입니다.
- 승인 로그, 위키 승격 로그, 병합 메타데이터는 `Conflict_Register.md`에 남기지 않습니다.

프로젝트가 아닌 `account`, `common`, `shared` 공간에는 위 문서 세트를 강제로 만들지 않습니다. 다만 특정 운영 흐름상 필요한 경우 명시적으로 추가할 수 있습니다.

## Event Capture and Promotion

- 새 업무 이벤트는 바로 결론 문서로 정리하지 않고 아래 순서로 승격합니다.
  - 원본 이벤트 캡처
  - `Reference_Register.md`에 링크/경로/fallback 파일명 기준 참조 등록
  - 필요 시 `Sources.md`에 상세 출처 메모 등록
  - `Evidence_Log.md`에 사실, 원문, 수치, 결정사항 추출
  - 충돌 또는 미확정 값은 성격을 먼저 구분한 뒤, 명시적 상충값만 `Conflict_Register.md`에 등록
  - 실제 문서 수정은 `Change_Log.md`에 기록
  - 프로젝트 상태가 바뀌면 `obsidian/L1_memory/{ProjectName}.md` 갱신

## Practical Decision View

- 위키는 “무엇이 있었나”만 남기지 말고 “그래서 지금 무엇을 판단해야 하나”를 남겨야 합니다.
- 특히 `Decisions.md`는 “어느 위키 공간을 canonical로 볼 것인가”를 먼저 판단하는 문서여야 합니다.
- 프로젝트 허브 상단만 읽어도 아래 다섯 가지가 보여야 합니다.
  - 지금 상태
  - 마지막 의미 있는 변화
  - 막힌 지점 또는 충돌
  - 다음 액션
  - 그 액션을 뒷받침하는 근거 링크
- 에이전트는 가능하면 수동적으로 `충돌 후보`만 던지지 말고, 실무적으로 왜 문제인지와 무엇을 업데이트하면 좋은지 먼저 제안합니다.
- 제안 형식은 가능하면 `문제 요약 -> 실무 영향 -> 권고 업데이트 -> 수정할 위키 문서` 순서를 따릅니다.
- 사용자가 막지 않았다면 제안만 하지 말고 적절한 위키 문서를 직접 수정하는 쪽을 우선합니다.

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

- 모든 내용을 위키에 다 담으려 하지 않습니다.
- 요약은 남기되, 어디에 설명되어 있는지, 관련 문서명이 무엇인지, URL/경로가 무엇인지, 링크가 어려우면 어떤 파일명을 찾아야 하는지를 함께 남깁니다.
- 원문 전체를 복붙하지 않더라도, 맥락을 잃지 않을 정도의 발췌는 반드시 남깁니다.
- 수치 원문, 계산식, 결정 이유, 제약 조건은 가능한 한 원문 표현을 유지합니다.
- 출처 위치를 알 수 있다면 페이지, 섹션, 슬라이드 번호까지 남깁니다.
- 파일명과 본문 제목이 어긋나거나 문서 내용이 섞인 경우, 복구 사실을 `Change_Log.md`에 기록합니다.
