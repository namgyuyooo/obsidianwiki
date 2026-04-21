---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "2026-04-21 ingest redesign discussion"
---

# Wiki Ingest Operating Model

프로젝트 위키 인제스트는 앞으로 아래 3층 구조로 운영합니다.

## 1. 원문 보존 계층

문서에서 실제로 읽은 내용을 보존하는 층입니다.

- 보관 대상
  - 문서명
  - 날짜
  - 문서 유형
  - 핵심 발췌
  - 수치 원문
  - 결정사항 원문
  - 충돌 원문
  - 출처 위치
- 추천 문서
  - `Sources.md`
  - `Evidence Log.md`
  - `Document Notes/문서명.md`

## 2. 정제 지식 계층

원문을 프로젝트 실행과 재사용에 맞게 구조화하는 층입니다.

- 대표 문서
  - `Project Overview.md`
  - `KPI.md`
  - `Decisions.md`
  - `Risks.md`
  - `Market Analysis.md`
  - `Revenue Model.md`
  - `Equipment.md`
  - `Architecture.md`

## 3. 이력 및 변경 관리 계층

무엇이 언제 어떻게 바뀌었는지 추적하는 층입니다.

- 보관 대상
  - 날짜형 업데이트 블록
  - 충돌 등록
  - 이전 안 대비 변경사항
  - 확정/미확정 구분
- 추천 문서
  - `Change Log.md`
  - `Conflict Register.md`
  - 기존 문서 하단 업데이트 블록

## 운영 원칙

- 위키는 구조만 관리하지 말고 실제 내용도 관리합니다.
- 로컬 위키만 보지 말고 연결된 Google Drive도 함께 탐색합니다.
- Drive 탐색은 접근 가능한 모든 Drive와 Shared Drive를 샅샅이 확인하는 것을 기본값으로 합니다.
- 문서 탐색 시 파일명뿐 아니라 상위 폴더명도 함께 판단합니다.
- 파일명보다 폴더명이 더 강한 맥락을 줄 수 있으므로 Shared Drive 이름, 상위 폴더명, 상상위 폴더명을 함께 기록합니다.
- 상위 폴더명에 `RTM`이 포함되면 1차 분석 후보로 포함합니다.
- `RTM`이 없더라도 파일명 또는 문서 내용이 프로젝트 핵심 키워드와 강하게 일치하면 후보에 포함합니다.
- `hwp`와 `hwpx`는 예외 없이 조사 대상에 포함합니다.
- `hwp`와 `hwpx`는 필요 시 `rhwp` 기반 점검 절차를 사용해 파일 정보, 구조 덤프, 페이지 구조, SVG 렌더 결과를 확인합니다.
- 요약만 저장하지 않고, 핵심 문장과 근거를 함께 남깁니다.
- 해석과 원문 근거를 분리합니다.
- 숫자는 반드시 문서명과 날짜를 함께 기록합니다.
- 상충되는 수치는 둘 다 남기고 충돌 상태를 유지합니다.
- 기존 문서를 덮어쓰지 말고 날짜형 업데이트 블록으로 append 합니다.
- 나중에 사업계획서, 제안서, 보고서, 발표자료, 영문 문서로 전환 가능한 구조를 우선합니다.

## 사업계획서 계열 대표본 선별 원칙

- 사업계획서, 제안서, 투자자료, 보고서, 발표자료를 읽을 때는 먼저 관련 후보 문서를 수집합니다.
- 관련 후보 수집은 특정 폴더에 한정하지 않고 접근 가능한 모든 Drive를 대상으로 합니다.
- 같은 계열 문서가 여러 개 있으면 `Primary`, `Secondary`, `Hold`로 구분합니다.
- 대표본 선정 시 아래 순서를 함께 봅니다.
  - 상위 폴더에 `RTM` 포함 여부
  - Shared Drive 이름과 폴더 계층 맥락
  - 파일명에 `vf`, `최종`, `최종본`, `final`, `final본`, `확정`, `제출본`, `발표본` 포함 여부
  - 파일명 마지막 버전번호
  - 마지막 수정일
  - 프로젝트 핵심 키워드 일치도
  - 문서 유형 적합성
  - 문서 내용의 완결성
- 파일명, 버전번호, 수정일 중 하나만으로 대표본을 확정하지 않습니다.
- `hwp`와 `hwpx`를 형식상 이유로 후보군에서 제외하지 않습니다.
- 대표본을 먼저 읽고, 비교본을 읽어 변경사항을 `Change Log`와 `Conflict Register`에 기록합니다.

## 추천 프로젝트 구조

```text
Wiki/
├── Common/
│   ├── 기술개념/
│   ├── 공정개념/
│   ├── KPI_Templates/
│   └── 평가기준/
├── Shared/
│   ├── 고객유형/
│   ├── 사업화전략/
│   └── 문장자산/
└── Project_X/
    ├── Hub.md
    ├── Project Overview.md
    ├── KPI.md
    ├── Decisions.md
    ├── Risks.md
    ├── Sources.md
    ├── Evidence Log.md
    ├── Change Log.md
    ├── Conflict Register.md
    ├── Market Analysis.md
    ├── Target Customer.md
    ├── Revenue Model.md
    ├── Go-to-Market Strategy.md
    ├── Architecture.md
    ├── Equipment.md
    └── Document Notes/
```

## 연결 문서

- [[Wiki/Schema]]
- [[Wiki/Common/Wiki_Ingest_Templates]]
- [[Wiki/Common/Wiki_Ingest_Prompt_Set]]
