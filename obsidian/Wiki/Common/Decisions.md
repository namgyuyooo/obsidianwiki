---
type: knowledge
created: 2026-04-30
updated: 2026-05-01
source: "decision queue + wiki integration review redesign"
---

# Decisions

## 운영 원칙
- 이 문서는 Common 공간의 승인 로그 보관함이 아니라, 분산 intake 위키를 어떤 canonical space로 정제할지 판단하는 운영 문서입니다.
- Slack, Google Drive, 지식주입, filesystem 수집은 각각 별도 project-like space를 만들 수 있으므로, 생성 직후부터 `합칠지`, `유지할지`, `account/common/shared로 보낼지` 검토해야 합니다.
- LLM은 통합 제안을 낼 수 있지만, 사용자 선택이 있으면 그 결정을 우선 기록합니다.
- raw approval event와 automation audit는 runtime/audit 또는 `Change_Log.md`에 두고, 여기에는 durable한 판단만 남깁니다.

## 통합 검토 기준
- 같은 고객, 같은 과제, 같은 실행 단위라면 intake 경로가 달라도 기존 canonical project 편입을 우선 검토합니다.
- 고객은 같아도 차수, 계약, 예산, 오너, 산출물 경계가 다르면 별도 프로젝트 유지 가능성을 검토합니다.
- 프로젝트보다 계정 관계가 핵심이면 `account` rollup을 우선 검토합니다.
- 반복 재사용 가치가 크고 개별 고객 경계가 약하면 `shared` 또는 `common` 승격을 검토합니다.

## 확정된 운영 결정
### 2026-04-30 | Filesystem intake small test는 canonical project로 바로 승격하지 않음
- intake 유형: filesystem
- 결정:
  - `chat_uploads` 기반 `Filesystem Wiki Intake Small Test`는 프로젝트 지식으로 바로 승격하지 않고 `Common` 검토 결정으로 처리합니다.
- 이유:
  - 카드가 다루는 파일은 테스트 업로드 성격이 강하고, `아사히카세히 롤투롤 진행 중`이라는 한 줄만으로 특정 프로젝트 허브에 넣기엔 맥락이 부족합니다.
  - 동일 내용의 HTML 2개는 중복 가능성이 크고, 카드 생성 이후 `chat_uploads` 디렉토리에 신규 PDF가 추가되어 초기 inventory 자체가 최신 상태가 아닙니다.
- LLM 권고:
  - 최신 inventory와 본문 추출 전까지는 별도 canonical project 생성 보류
- 사용자 확정:
  - approve
- 영향:
  - 이 건은 Decision Queue에서는 종료합니다.
  - 후속 판단은 `최신 inventory 재실행`과 `신규 PDF 본문 추출`이 끝난 뒤 다시 프로젝트 라우팅 여부를 판단합니다.

## 확인 대기 결정
### Filesystem intake 재판정 조건
- 특정 프로젝트 편입 여부는 `chat_uploads` 전체 최신 스냅샷과 PDF 추출 결과가 나온 뒤 재판정합니다.
- 재판정 시 확인 항목:
  - 실제 고객/프로젝트 식별 가능 여부
  - 기존 `[[Wiki/아사히카세히_Project/hub]]` 또는 관련 space와의 중복 여부
  - raw source가 단발성 테스트인지 지속 수집 파이프라인인지

## 운영 메모
- 참조 카드: `paperclip-1777533572075-filesystem-wiki-intake`
- 관련 근거: `automation/wiki_api/runtime/chat_uploads`
- 후속 실행 큐는 [[Wiki/Common/Action_Items]]에서 관리합니다.
- 통합 검토 기준 문서: [[Wiki/Common/Wiki_Integration_Review_Model]]
- 제품 기획/시나리오/검증 문서: [[Wiki/Common/Decisions_Product_Plan]]
