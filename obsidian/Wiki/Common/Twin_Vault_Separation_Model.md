---
type: knowledge
created: 2026-05-01
updated: 2026-05-01
source: "2026-05-01 personal/work separation design request"
---

# Twin Vault Separation Model

- [[Wiki/index]]
- [[Wiki/Common/hub]]
- [[Wiki/Schema]]

업무 위키와 개인 위키를 완전히 분리하되, 구조와 운영 로직은 거의 동일하게 유지하기 위한 기준 문서입니다.

## 한줄 원칙

- 업무와 개인은 `같은 규칙을 쓰는 쌍둥이 시스템`으로 운영하되 `같은 저장소/같은 소스 루트/같은 서비스 컨텍스트` 안에 섞지 않습니다.

## 목표

- 업무 기록은 업무 위키에만 남긴다.
- 개인 기록은 개인 위키에만 남긴다.
- 두 위키는 계층 구조, 문서 이름, 운영 절차, 인제스트 규칙을 최대한 동일하게 유지한다.
- 에이전트가 어느 쪽 위키를 다루더라도 비슷한 판단 로직으로 동작하게 만든다.

## 분리 경계

### 1. 저장소 / 폴더

- 업무 위키와 개인 위키는 별도 repository 또는 최소 별도 vault root를 사용합니다.
- 한 저장소 안에 `obsidian/Wiki/Work/`, `obsidian/Wiki/Personal/`처럼 섞어 넣는 방식을 기본값으로 쓰지 않습니다.
- 각 위키는 아래 루트를 독립적으로 가집니다.
  - `raw/`
  - `Wiki/`
  - `L1_memory/`
  - automation runtime/state/cache

### 2. 소스

- raw source root를 공유하지 않습니다.
- 업무 소스는 업무용 Slack/Drive/메일/로컬 문서만 연결합니다.
- 개인 소스는 개인용 메모/캘린더/문서/링크만 연결합니다.
- 한 이벤트가 두 영역에 걸치면 source도 나눠서 취급합니다.

### 3. 서비스 / 계정 / 인증

- 가능하면 Slack, Drive, 메일, 캘린더, 자동화 계정도 업무와 개인을 분리합니다.
- connector/auth context를 공유하면 잘못된 인제스트와 오염 가능성이 커지므로 기본값은 분리입니다.
- automation runtime path, state file, queue, export path도 업무/개인별로 따로 둡니다.

## 동일하게 유지할 뼈대

두 위키는 아래 항목을 가능한 한 동일하게 맞춥니다.

- 계층 구조
  - `raw/`
  - `Wiki/`
  - `L1_memory/`
- 운영 문서
  - `AGENTS.md`
  - `Wiki/Schema.md`
  - `Wiki/Common/Wiki_Ingest_Operating_Model.md`
  - `Wiki/Common/Wiki_Ingest_Templates.md`
- 운영 개념
  - `project / account / common / shared`
  - `Reference_Register`, `Evidence_Log`, `Raw_Evidence_Index`, `Status`, `Change_Log`, `Conflict_Register`
  - hub 상단의 `운영 메모 / 실행 현황판 / 현재 막힘 / 다음 액션`
- L1 메모리 구조
  - 한줄 요약
  - 현재 상태
  - 핵심 결정
  - 미해결 이슈
  - 다음 액션

## 공유하면 안 되는 것

- 실제 프로젝트/개인 콘텐츠 본문
- 참조 링크와 원문 증적
- L1 메모리 내용
- 자동화 큐와 런타임 상태
- cross-vault wikilink

공통으로 공유해도 되는 것은 운영 규칙, 템플릿, 프롬프트 계약, 자동화 설계 문서 같은 스키마 계층입니다.

## 이벤트 라우팅 규칙

### 업무 이벤트

- 업무용 프로젝트/계정/common 문서로 바로 승격합니다.
- 개인 해석이나 감정 메모는 남기지 않습니다.

### 개인 이벤트

- 개인 위키에서만 관리합니다.
- 이 저장소에는 남기지 않습니다.

### 혼합 이벤트

- 업무 위키에는 업무상 필요한 사실, 일정, 결정, 리스크만 남깁니다.
- 개인 위키에는 개인 판단, 감정, 사적 맥락, 개인 액션을 남깁니다.
- 서로를 wikilink로 직접 연결하지 말고, 필요하면 각 위키에서 자기 문맥으로 다시 서술합니다.

## 운영 권장안

### 권장 1

- 업무 위키와 개인 위키를 아예 다른 Obsidian vault로 운영합니다.

### 권장 2

- Git repository도 분리합니다.

### 권장 3

- 공통 뼈대는 템플릿 repo, 스크립트, 수동 동기화 중 하나로 맞춥니다.

### 권장 4

- 콘텐츠 동기화가 아니라 `운영 문서 동기화`만 허용합니다.

## 이 저장소에서의 적용

- 이 저장소는 업무 전용 canonical wiki입니다.
- 따라서 개인 폴더, 개인 프로젝트, 개인 L1 메모리를 이 저장소 안에 만들지 않습니다.
- 개인 위키가 필요하면 별도 sibling vault를 만들고, 이 문서를 그쪽에도 복제해 twin contract로 사용합니다.
- bootstrap and contract pin:
  - `wiki-core.lock.json`
  - `automation/wiki_core/bootstrap_twin_vaults.mjs`
  - sibling targets: `../wiki-core`, `../obsidianwiki-personal`

## 드릴다운

- [[Wiki/Schema]]
- [[Wiki/Common/Wiki_Ingest_Operating_Model]]
- [[Wiki/Common/Wiki_Ingest_Templates]]
