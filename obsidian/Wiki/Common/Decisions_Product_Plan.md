---
type: knowledge
created: 2026-05-01
updated: 2026-05-01
source: "Decisions product redesign planning session"
---

# Decisions Product Plan

## 한줄 결론

`Decisions`는 승인 로그함이 아니라, 흩어진 intake 위키를 가장 낮은 엔트로피의 canonical workspace로 재배치하는 통합 control plane이어야 한다.

## 기획 관점

이 문서는 미사여구보다 운영 효율을 우선한다.
기준은 단순하다.

- 같은 일을 여러 위키가 설명하면 실패다.
- 사용자가 어디에 반영해야 할지 망설이면 실패다.
- LLM이 제안은 잘하지만 검증과 반영 루프가 약하면 실패다.
- `Decisions`가 위키 엔트로피를 줄이지 못하면 존재 이유가 없다.

## 제품 미션

사용자가 Slack, Google Drive, 지식주입, filesystem에서 들어온 재료를 보고 아래 질문에 1분 안에 답하게 만든다.

1. 이건 기존 프로젝트에 합쳐야 하는가
2. 새 canonical project로 승격해야 하는가
3. account/common/shared로 보내야 하는가
4. 아직 보류해야 하는가
5. 그 판단을 반영하면 어떤 문서가 바뀌는가

## Non-Goals

- 모든 intake를 자동 병합하는 것
- 승인 로그를 길게 보관하는 것
- 사용자가 원문을 안 보고도 무조건 LLM 제안만 믿게 만드는 것
- 위키를 더 많이 생성하는 것 자체

## 최우선 제품 원칙

### 1. Canonical first

- 어떤 intake가 들어와도 먼저 `대표 공간`을 정한다.
- merge는 대표 공간이 정해진 뒤의 실행 방식일 뿐이다.

### 2. Entropy down

- `Decisions`의 모든 기능은 위키 수, 후보 수, 사용자 망설임을 줄여야 한다.
- 줄이지 못하면 제거한다.

### 3. Human final, LLM first draft

- LLM은 권고안을 만든다.
- 사용자는 채택, 수정 채택, 반려를 결정한다.
- 시스템은 그 선택을 다음 판단의 bias로 학습한다.

### 4. No silent write

- 사용자가 승인하지 않은 canonical 변경은 자동 반영하지 않는다.
- 특히 project 승격, project 병합, account rollup은 모두 explicit approval 대상이다.

### 5. Reflection loop

- 판단이 끝나면 문서 반영으로 닫혀야 한다.
- `Status`, `hub`, `Reference_Register`, `Project_Overview`, `Change_Log`, `L1_memory` 중 무엇이 바뀌는지 보여줘야 한다.

## 예상 핵심 기능

### F1. Intake clustering

- Slack/Drive/지식주입/filesystem 기반 항목을 고객, 과제, 오너, 일정, 산출물, 문서 키워드 기준으로 묶는다.
- 목표:
  - `이것들은 같은 일 같다`를 자동 제안

### F2. Canonical workspace recommendation

- 묶인 후보에 대해 아래 중 하나를 추천한다.
  - `merge_into_existing_project`
  - `promote_to_new_project`
  - `keep_separate_project`
  - `roll_up_to_account`
  - `promote_to_common`
  - `promote_to_shared`
  - `hold_for_review`
  - `do_not_merge`

### F3. Why panel

- 추천만 보여주지 말고 이유를 구조화해 보여준다.
- 예:
  - 고객명 일치
  - 계약 단위 불일치
  - 산출물 독립
  - 일정 분리
  - 기존 허브 연결 강도 높음

### F4. Impact preview

- 사용자가 승인하면 바뀔 문서를 먼저 보여준다.
- 최소 대상:
  - `hub.md`
  - `Status.md`
  - `Reference_Register.md`
  - `Project_Overview.md`
  - `Change_Log.md`
  - `obsidian/L1_memory/{Project}.md`

### F5. New project promotion wizard

- 기존 프로젝트에 합치는 대신 새 canonical project로 승격해야 할 때:
  - project name 초안
  - project/account/common/shared 분류
  - 초기 허브/상태/참조 문서 생성
  - L1_memory 생성
  - 기존 provisional intake와 연결 링크 남김

### F6. Merge guardrail

- 자동 병합을 쉽게 누르게 하지 않는다.
- 아래 중 하나라도 크면 merge보다 hold를 우선 제안한다.
  - 계약 경계 불명확
  - 일정 충돌
  - 서로 다른 오너
  - 다른 산출물 체계
  - 원문 근거 부족

### F7. User override capture

- 사용자가 LLM 제안을 뒤집을 수 있어야 한다.
- 뒤집은 이유는 구조화해 저장한다.
- 예:
  - `같은 고객이지만 별도 수주건`
  - `기술은 같지만 예산/오너/납기 분리`

### F8. Decision memory

- 반복되는 판정 패턴을 누적한다.
- 예:
  - `Slack_*` 고객 미팅 메모는 대체로 기존 project 후속 증거
  - Drive 제출본과 발표본은 보통 기존 project 내 representative doc chain

### F9. Validation inbox

- 단순 approve/reject 대신 아래 상태를 운영한다.
  - `바로 반영 가능`
  - `근거 더 필요`
  - `사용자 확인 필요`
  - `새 project 승격 검토`
  - `account rollup 검토`

### F10. Post-decision audit

- 판단 이후 실제로 엔트로피가 줄었는지 측정한다.
- 예:
  - 중복 project 수 감소
  - orphan intake 수 감소
  - unresolved hold 체류 시간 감소

## UX 시나리오

### 시나리오 1. Slack 후속 메모를 기존 프로젝트에 편입

- 입력:
  - `Slack_고객A_Project`
  - 기존 `고객A_Project`
- 시스템 판단:
  - 고객, 실행 단위, 산출물 일치
  - Slack 공간은 후속 증거 view
- 권고:
  - `merge_into_existing_project`
- 사용자 행동:
  - 승인
- 반영:
  - 기존 project `Reference_Register`, `Evidence_Log`, `Status`, `Change_Log` 갱신
  - Slack 공간은 intake provenance link 유지
- 성공 조건:
  - 사용자가 어디에 반영할지 10초 안에 판단

### 시나리오 2. Drive 폴더를 새 canonical project로 승격

- 입력:
  - 같은 고객 계정 아래 신규 제안 폴더
- 시스템 판단:
  - 고객은 같지만 예산, 일정, 오너, 산출물이 독립
- 권고:
  - `promote_to_new_project`
- 사용자 행동:
  - project 명칭 수정 후 승인
- 반영:
  - 새 project space 생성
  - `hub`, `Status`, `Reference_Register`, `Project_Overview`, `Change_Log`, `L1_memory` 초기화
  - account hub에서 링크 추가
- 성공 조건:
  - 기존 프로젝트에 억지로 합치지 않음

### 시나리오 3. Filesystem 업로드는 보류

- 입력:
  - 테스트 업로드 PDF/HTML 묶음
- 시스템 판단:
  - 고객 식별 불충분
  - 중복 가능성 높음
- 권고:
  - `hold_for_review`
- 사용자 행동:
  - 승인 대신 추가 근거 요청
- 반영:
  - `Action_Items`에 재판정 조건 추가
- 성공 조건:
  - 문맥 부족 상태에서 project 폭증을 막음

### 시나리오 4. 공통 자산으로 승격

- 입력:
  - 여러 프로젝트에서 반복되는 정부과제 표현/표/레퍼런스 문장
- 시스템 판단:
  - 고객 경계보다 재사용 가치가 큼
- 권고:
  - `promote_to_shared`
- 사용자 행동:
  - 승인
- 반영:
  - `Shared/` 또는 `Common/` 문서 생성/갱신
  - 원 프로젝트에는 승격 provenance link만 남김
- 성공 조건:
  - 같은 자산을 여러 project가 복제하지 않음

### 시나리오 5. Account rollup

- 입력:
  - 한 고객사 아래 3개 intake가 모두 관계 영업 단계
- 시스템 판단:
  - 아직 개별 project보다 account coordination 가치가 큼
- 권고:
  - `roll_up_to_account`
- 사용자 행동:
  - 승인
- 반영:
  - account hub에 활성 후보와 next touchpoint 갱신
- 성공 조건:
  - premature project creation 감소

### 시나리오 6. 사용자가 LLM 제안을 뒤집음

- 입력:
  - 시스템은 merge 제안
- 사용자 판단:
  - 실제로는 다른 법인/다른 계약
- 권고 처리:
  - `keep_separate_project`
- 반영:
  - 사용자 override 사유 저장
  - 이후 비슷한 후보에 같은 warning 강화
- 성공 조건:
  - 시스템이 틀려도 운영 품질이 나빠지지 않음

## 검증 질문

1. 사용자는 `어디로 보내야 하는지`를 더 빨리 결정하는가
2. provisional intake가 canonical project를 오염시키지 않는가
3. 새 project 승격이 과소/과대 생성되지 않는가
4. 승인 후 실제 위키 반영 문서가 누락되지 않는가
5. 사용자 override가 다음 제안 품질을 높이는가

## 검증 KPI

- `time_to_decision`
  - 카드 열람부터 승인/보류까지 걸린 시간
- `wrong_merge_rate`
  - 승인 후 되돌려야 했던 merge 비율
- `premature_project_rate`
  - 나중에 account/common/기존 project로 흡수된 신규 project 비율
- `reflection_completion_rate`
  - 승인 후 필수 문서 반영까지 완료된 비율
- `hold_resolution_time`
  - 보류 카드가 다음 판단으로 닫히기까지 걸린 시간
- `user_override_rate`
  - LLM 권고와 다른 선택 비율

## 검증 방법

### V1. 시나리오 리허설

- 실제 Decision Queue 리스트에서 위 6개 시나리오와 유사한 카드를 골라 검증한다.
- 각 시나리오에서 시스템 권고, 사용자 선택, 반영 문서가 맞는지 확인한다.

### V2. Shadow mode

- 실제 운영에서는 당분간 auto-apply 없이 추천만 띄운다.
- 사용자는 수동으로 결정하고 결과를 기록한다.

### V3. Diff audit

- 승인 전/후 위키 diff를 비교한다.
- `중복 감소`, `링크 강화`, `잘못된 승격 방지`가 실제로 일어나는지 본다.

### V4. Operator interview

- 사용자가 가장 헷갈린 순간을 기록한다.
- 특히 아래 질문에 답 못 하면 UX 실패다.
  - `왜 이걸 merge하라고 하지?`
  - `왜 새 project로 올리라는 거지?`
  - `승인하면 어디가 바뀌지?`

## 반영 루프

### Step 1. 기획 검증

- 시나리오별 예상 권고와 실제 사용자 판단을 비교

### Step 2. 제품 검증

- Decisions 화면에서 필요한 정보가 빠짐없이 보이는지 확인

### Step 3. 운영 검증

- 승인 후 문서 반영 누락 여부 확인

### Step 4. 규칙 반영

- 자주 반복되는 override 사유를 `Wiki_Integration_Review_Model`과 `Decisions` 템플릿에 반영

### Step 5. 모델 반영

- LLM ranking prompt와 recommendation priority를 조정

## 전면 개편 실행 리스트

### P0 완료

1. 카드 상단에 `권고 판정 + 이유 + 영향 문서`를 한 번에 표시
2. `새 canonical project 승격` 액션을 1급 버튼으로 노출
3. 승인 전 `반영 문서 미리보기` 제공
4. 사용자 override 사유 구조화 저장
5. 승인 후 `reflection completion` 체크리스트 표시
6. `Validation inbox` 상태를 `바로 반영 가능 / 근거 더 필요 / 사용자 확인 필요 / 새 project 승격 검토 / account rollup 검토`로 노출
7. `선택 전략` 기준으로 영향 문서, 요약, 체크리스트를 즉시 재계산

### P1 진행 중

1. `Review queue`를 `검증 inbox -> 전략별 리스트 -> 실행 대기열` 구조로 재편
2. 카드보다 리스트 운영이 우선 보이도록 필터와 집계 상태를 상단 rail에 유지
3. 실제 pending 카드만 기준으로 시나리오 리허설을 수행
4. `common/shared/hold_for_review`를 전략 lane과 반영 경로에 포함
5. pending 카드의 재판정 SLA와 stale queue 표식을 운영 리스트에서 노출
6. 승인 후 반영 문서 수, 대표 경로, `before/after` preview를 `diff audit` 리스트에서 바로 확인

### P2 다음 작업

1. `account/common/shared` routing을 추천 로직 수준에서도 더 정교하게 끌어올림
2. project/common/shared 승격 wizard를 실제 생성 검증과 연결
3. stale 카드의 자동 재추천 우선순위와 reviewer ownership을 붙임
4. diff audit에서 문서별 before/after 비교까지 드릴다운 제공

## Kill Criteria

아래 중 하나면 현재 설계를 버리거나 크게 수정해야 한다.

- 사용자가 여전히 `어디에 반영할지` 직접 문서 열어가며 찾아야 한다.
- 신규 project 승격이 늘었는데 later merge도 같이 늘어난다.
- LLM 권고를 신뢰할 수 없어 대부분 수동 판단으로 되돌아간다.
- 승인 후 실제 문서 반영 누락이 자주 생긴다.

## 연결 문서

- [[Wiki/Common/Decisions]]
- [[Wiki/Common/Wiki_Integration_Review_Model]]
- [[Wiki/Common/Wiki_Frontend_Product_Plan]]
- [[Wiki/Common/Paperclip_UX_UI_User_Intent_Analysis]]
- [[Wiki/log]]
