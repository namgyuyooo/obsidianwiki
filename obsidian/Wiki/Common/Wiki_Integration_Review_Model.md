---
type: knowledge
created: 2026-05-01
updated: 2026-05-01
source: "Decisions redesign for scattered wiki integration"
---

# Wiki Integration Review Model

이 문서는 `Decisions.md`를 흩어진 위키의 통합·정제 게이트로 쓰기 위한 운영 기준입니다.

## 핵심 목적

- Slack, Google Drive, 지식주입, filesystem 수집은 서비스 특성상 각각 별도 project-like space를 만들 수 있습니다.
- 하지만 사용자의 핵심 니즈는 수집 경로별 공간을 계속 늘리는 것이 아니라, 같은 일은 같은 canonical wiki로 합치고 다른 일만 분리하는 것입니다.
- 따라서 `Decisions.md`는 승인 로그보다 먼저 `대표 공간 선정 + 중복 후보 검토 + 후속 반영` 문서여야 합니다.

## 기본 원칙

- 새 intake는 기본적으로 provisional입니다.
- 새 intake가 들어오면 먼저 기존 `project`, `account`, `common`, `shared` 공간과 비교합니다.
- 자동 병합보다 `어디를 대표 공간으로 볼지`를 먼저 확정합니다.
- LLM은 추천안을 제안할 수 있고, 사용자는 그중 선택하거나 별도 판단을 내릴 수 있습니다.
- 사용자 확정 전까지는 `LLM 권고`와 `확정 결정`을 구분해서 기록합니다.
- 검토 결과는 기존 공간 편입뿐 아니라 `새 canonical project 승격`도 포함해야 합니다.

## Intake별 해석

### Slack
- 고객 대화, 회의 메모, 파일 첨부, 영업 신호 때문에 project-like 문서가 쉽게 생깁니다.
- 우선 검토:
  - 기존 고객 프로젝트의 후속 증거인지
  - 영업/제안/운영 중 어느 단계인지
  - `account` 롤업이 더 적절한지

### Google Drive
- 같은 과제의 초안/발표본/제출본/보관본 때문에 중복 space가 생기기 쉽습니다.
- 우선 검토:
  - 대표본과 비교본 관계인지
  - 같은 과제의 차수/버전인지
  - 기존 프로젝트 증거 보강인지

### 지식주입
- 사용자가 붙여 넣은 메모, 채팅 요약, 외부 설명은 맥락 부족 상태로 들어오기 쉽습니다.
- 우선 검토:
  - 실제 프로젝트를 식별할 근거가 충분한지
  - `common/shared` 운영 지식으로 보내는 편이 맞는지
  - raw source 재확보가 필요한지

### Filesystem
- 테스트 업로드, 임시 내보내기, 로컬 스냅샷 때문에 canonical 판단이 가장 위험할 수 있습니다.
- 우선 검토:
  - 장기 source인지 임시 업로드인지
  - 파일 묶음이 단일 프로젝트를 설명하는지
  - 기존 project와 연결 가능한 식별자나 문맥이 충분한지

## Decisions에서 내려야 할 판정

- `merge_into_existing_project`
  - 기존 프로젝트가 canonical이고 새 intake는 증거/보조 공간으로 편입
- `promote_to_new_project`
  - 기존 공간에 흡수하면 문맥이 손상되므로 별도 canonical project를 생성/승격
- `keep_separate_project`
  - 고객은 같아도 차수, 예산, 계약, 오너, 산출물이 달라 별도 프로젝트 유지
- `roll_up_to_account`
  - 개별 프로젝트보다 계정 관계/상업 흐름 관리가 우선
- `promote_to_common`
  - 특정 프로젝트보다 운영 규칙, 자동화, 공통 지식 성격이 강함
- `promote_to_shared`
  - 여러 프로젝트에서 재사용할 자산으로 승격
- `hold_for_review`
  - 근거 부족, source 미완전, 식별 불충분으로 보류
- `do_not_merge`
  - 유사해 보여도 합치면 문맥 손실이나 오판 위험이 큼

## 검토 기준

- 고객명, 법인명, 브랜드명, 프로젝트명 일치도
- 일정, 차수, 계약, 예산, 오너, 산출물 경계
- 근거 문서의 출처 안정성
- 기존 허브/Status/Reference_Register와의 연결 강도
- 같은 실행 단위인지, 같은 계정의 다른 건인지
- 통합 시 얻는 이점과 문맥 손실 위험
- 새 project로 승격했을 때 허브/상태/L1_memory를 독립 운영할 실무 가치가 충분한지

## 권장 기록 형식

`Decisions.md`에는 아래를 남깁니다.

- intake 유형
- 후보 공간
- 검토 질문
- LLM 권고
- 사용자 선택
- 연결 근거
- 후속으로 갱신할 문서

## 후속 반영 문서

- 대표 공간이 정해지면 `hub.md`, `Status.md`, `Project_Overview.md`, `Reference_Register.md`, `Change_Log.md`, `L1_memory`를 함께 점검합니다.
- 병합 보류라도 `Action_Items.md`나 `Risks.md`에 다음 확인 조건을 남깁니다.
- raw approval/audit event는 runtime/audit 또는 `Change_Log.md`에 남기고, `Decisions.md`에는 운영 판단만 남깁니다.

## 연결 문서

- [[Wiki/Schema]]
- [[Wiki/Common/Wiki_Ingest_Operating_Model]]
- [[Wiki/Common/Wiki_Ingest_Templates]]
- [[Wiki/Common/Decisions]]
