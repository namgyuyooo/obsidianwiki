---
type: log
created: 2026-04-29
updated: 2026-04-30
source: "Slack thread + local report config"
---

# Conflict Register

## Open Conflicts
- 상충 수치, 버전 불일치, 고객/내부 판단 불일치, 범위 미확정을 이 문서에 등록합니다.
- 해소 전까지 허브 상단 `현재 막힘 / 충돌`과 연동해 가시화합니다.

## 처리 원칙
- 충돌이 상태에 영향을 주면 [[Wiki/Sawnics_ManufacturingAI_Project/Status]]의 blocker와 history에도 반영
- 확정되면 [[Wiki/Sawnics_ManufacturingAI_Project/Decisions]]로 승격
- 실행이 필요하면 [[Wiki/Sawnics_ManufacturingAI_Project/Action_Items]]로 연결
- 리스크가 커지면 [[Wiki/Sawnics_ManufacturingAI_Project/Risks]]로 승격

## 기존 정리 메모
## 2026-04-29

### 항목: PoC 성과 vs 양산형 제안 메시지
- 충돌 내용:
  - IDT 영역은 `13 / 13` 전건 탐지로 매우 강한 결과
  - Metal과 Non Metal은 각각 `4 / 5`로 미탐이 남아 있음
- 관련 증적:
  - [[Evidence_Log#Evidence 06]]
  - [[Evidence_Log#Evidence 07]]
- 현재 판단:
  - 제안 메시지는 `특정 영역에서 강한 가능성 입증 + 후속 개선 필요`로 쓰는 편이 안전함
- 연결 페이지:
  - [[KPI]]
  - [[Risks]]

### 항목: 지원사업 맥락 확인 수준
- 충돌 내용:
  - Slack 첨부명 기준으로는 `제조AI특화 스마트공장 구축사업 사업계획서 제출 안내문`이 분명함
  - 하지만 본문을 직접 읽지 못해 일정, 자격, 평가기준, 제출 형식은 확정되지 않음
- 관련 증적:
  - [[Evidence_Log#Evidence 02]]
  - [[Sources]]
- 현재 판단:
  - 사업명과 제출 준비 맥락까지만 사실로 두고, 세부 요건은 미확인 상태로 관리
- 연결 페이지:
  - [[Action_Items]]
  - [[Next_Meeting_Prep]]

### 항목: 쏘닉스 과제 범위
- 충돌 내용:
  - 현재 PoC는 `IDT 소자 품질 검사` 중심으로 정리됨
  - 내부 질의에서는 `어떤 과제일까요?`가 바로 나와 과제 범위가 팀 내에 완전히 합의된 상태는 아님
- 관련 증적:
  - [[Evidence_Log#Evidence 03]]
  - [[Project_Overview]]
- 현재 판단:
  - 미팅 전까지는 `IDT 검사 PoC 기반의 스마트공장/제조AI 과제 후보` 수준으로 표현
- 연결 페이지:
  - [[Risks]]
  - [[Next_Meeting_Prep]]
