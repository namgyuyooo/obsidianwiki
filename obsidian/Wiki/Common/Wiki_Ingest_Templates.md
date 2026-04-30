---
type: knowledge
created: 2026-04-21
updated: 2026-04-30
source: "2026-04-21 ingest redesign discussion; 2026-04-30 practical operations redesign"
---

# Wiki Ingest Templates

## project hub.md

```markdown
---
type: project
created: 2026-04-30
updated: 2026-04-30
source: ""
---

# Project Name Hub

- [[Wiki/index]]

## 운영 메모
- 한줄 요약:
- 진행 맥락:
- 실무 판단:
- 다음 확인:

## 실행 현황판
- 현재 상태:
- 현재 단계:
- 마지막 의미 있는 갱신:
- 현재 오너/대상:
- 다음 액션:

## 현재 막힘 / 충돌
- 확인 필요:
- 충돌 수치/주장:
- 대기 중인 외부 입력:

## 다음 액션
- [ ] 액션 1
- [ ] 액션 2
- [ ] 미팅 전 확인 질문

## 최근 업데이트
| 일시 | 추진내용 | 실무 의미 | 연결 증적 | 다음 액션 |
| --- | --- | --- | --- | --- |
| 2026-04-30 | 초기 운영 현황판 구성 | 허브 상단에서 상태/막힘/다음 액션을 바로 보게 됨 | [[Wiki/Project_Name/Sources]], [[Wiki/Project_Name/Evidence_Log]] | 실제 진행 내용으로 갱신 |

## 증적/근거 링크
- [[Wiki/Project_Name/Sources]]
- [[Wiki/Project_Name/Evidence_Log]]
- [[Wiki/Project_Name/Conflict_Register]]

## 운영 링크
- [[Wiki/Project_Name/Status]]
- [[Wiki/Project_Name/Project_Overview]]
- [[Wiki/Project_Name/Action_Items]]
- [[Wiki/Project_Name/Risks]]
- [[Wiki/Project_Name/Decisions]]
- [[Wiki/Project_Name/Conflict_Register]]
- [[Wiki/Project_Name/Change_Log]]
```

## Status.md

```markdown
---
type: status
created: 2026-04-30
updated: 2026-04-30
source: ""
---

# Status

## Current Status
- 상태 라벨:
- 현재 단계:
- 헬스:
- 현재 오너/대상:

## Current Focus
- 이번 주 핵심 포인트:
- 가장 가까운 게이트/마일스톤:
- 외부 확인 필요:

## Blockers
- 막힘:
- 충돌:
- 대기 중 입력:

## Next Update Rules
- 상태가 바뀌면 hub, Action_Items, Risks, L1_memory를 함께 갱신
- 확정 판단은 Decisions로, 충돌은 Conflict_Register로 연결

## Status History
| 일시 | 상태 변경 | 실무 의미 | 연결 문서 |
| --- | --- | --- | --- |
| 2026-04-30 | 초기 상태 레지스터 생성 | 프로젝트 상태를 별도 문서로 추적 시작 | [[Wiki/Project_Name/hub]], [[Wiki/Project_Name/Action_Items]] |
```

## account hub.md

```markdown
---
type: hub
created: 2026-04-30
updated: 2026-04-30
source: ""
---

# Account Name Hub

- [[Wiki/index]]

## 계정 운영 메모
- 한줄 요약:
- 진행 맥락:
- 실무 판단:
- 다음 확인:

## 활성 프로젝트
- [[Wiki/Account_Project_A/hub]]
- [[Wiki/Account_Project_B/hub]]

## 계정 차원 막힘 / 에스컬레이션
- 확인 필요:
- 공통 리스크:
- 내부/외부 에스컬레이션:

## 다음 접점
- 다음 미팅/연락:
- 준비할 자료:
- 확인 질문:

## 프로젝트 관계 링크
- [[Wiki/Account_Name/Project_Relationships]]
```

## common/shared hub.md

```markdown
---
type: hub
created: 2026-04-30
updated: 2026-04-30
source: ""
---

# Space Name Hub

- [[Wiki/index]]

## 운영 메모
- 한줄 요약:
- 진행 맥락:
- 실무 판단:
- 다음 확인:

## 활성 운영 모델 또는 재사용 자산
- 문서/자산 1
- 문서/자산 2

## 승격 / 정비 큐
- 보강 필요 자산:
- 프로젝트에서 승격할 후보:
- 재검토 필요 문서:

## 자동화 / 거버넌스 진입점
- 관련 운영 문서 1
- 관련 운영 문서 2

## 핵심 링크
- [[Wiki/index]]
```

## Sources.md

```markdown
# Sources

## 2026-04-20
### Primary
- 문서명: 2026년 연구개발계획서 최종본 v2.1
- 유형: 제안서
- 형식: pdf
- 날짜: 2026-02-27
- 상태: 읽음
- Shared Drive: 2026년도 전자부품산업기술개발
- 상위 폴더: RTM / 2026 제안
- 전체 폴더 경로: 2026년도 전자부품산업기술개발 / RTM / 2026 제안
- 선정 근거: `최종본` 표기, 높은 버전, 최근 수정, KPI/예산/일정 포함
- 파서/열람 방식: Drive fetch
- 연결 페이지: [[Project_Overview]], [[KPI]], [[Revenue Model]]
- 비고: 대표본 기준 문서

### Secondary
- 문서명: 2026년 연구개발계획서 발표본 v2.0
- 유형: 발표자료
- 형식: pptx
- 날짜: 2026-02-25
- 상태: 읽음
- Shared Drive: 2026년도 전자부품산업기술개발
- 상위 폴더: RTM / 2026 제안
- 전체 폴더 경로: 2026년도 전자부품산업기술개발 / RTM / 2026 제안
- 선정 근거: 대표본 직전 버전 비교용
- 파서/열람 방식: Drive fetch
- 연결 페이지: [[Project_Overview]], [[KPI]]
- 비고: KPI 문구 일부 상이

### Hold
- 문서명: 2026년 연구개발계획서 초안 v1.4
- 유형: 제안서
- 형식: hwpx
- 날짜: 2026-02-18
- 상태: 보류
- Shared Drive: 산업현장문제해결형산업AI에이전트기술개발(R&D)
- 상위 폴더: Shared / Draft
- 전체 폴더 경로: 산업현장문제해결형산업AI에이전트기술개발(R&D) / Shared / Draft
- 선정 근거: 관련성은 있으나 대표성 부족
- 파서/열람 방식: rhwp `info` + `dump`
- 연결 페이지: [[Sources]]
- 비고: 초기 가정 확인용
```

## Evidence_Log.md

```markdown
# Evidence Log

## 2026-04-20 / 연구개발계획서 초안
### Evidence 01
- Source: 2026년 연구개발계획서 초안
- Topic: KPI / MTTR
- Type: 수치
- Original:
  > 유지보수 평균소요시간 4시간, 목표 30% 감소
- Interpretation:
  - 기준 MTTR는 4시간으로 보임
  - 목표치는 약 2.8시간 수준으로 해석 가능
- Source Location:
  - 본문 KPI 섹션
- Linked Pages:
  - [[KPI]]
  - [[Conflict_Register]]

### Evidence 02
- Source: 2026년 연구개발계획서 초안
- Topic: 기대효과 / 경제효과
- Type: 수치
- Original:
  > 목표: 1.5시간
- Interpretation:
  - KPI 파트와 수치 충돌 가능성 존재
- Source Location:
  - 기대효과 섹션
- Linked Pages:
  - [[KPI]]
  - [[Conflict_Register]]
```

## Conflict_Register.md

```markdown
# Conflict Register

## 2026-04-20
### 항목: MTTR 목표
- 충돌 내용:
  - 문서 A: 4시간 대비 30% 감소
  - 문서 B: 목표 1.5시간
- 관련 출처:
  - [[Sources]]
  - [[Evidence_Log]]
- 현재 판단:
  - 공식 제출 수치 단일화 필요
- 상태:
  - 확인 필요
- 연결 페이지:
  - [[KPI]]
  - [[Project_Overview]]
```

## Change_Log.md

```markdown
# Change Log

## 2026-04-20
- Hub 구조 최초 정리
- Market / Revenue / GTM / KPI 문서 분리
- Market_Analysis 파일의 내용 꼬임 복구
- Revenue Model에 5개년 매출표 예시 추가
```

## Action_Items.md

```markdown
# Action Items

## Open
- [ ] 고객 확인 필요 KPI 단일화
- [ ] 다음 미팅 전 예산표 기준본 재확인

## Waiting
- [ ] 외부 회신 대기

## Done
- [x] 대표본/비교본 1차 구분 완료
```

## Decisions.md

```markdown
# Decisions

## 2026-04-20
- 결정:
  - 대표본은 2026년 연구개발계획서 최종본 v2.1을 기준으로 사용
- 근거:
  - 최종본 표기
  - 최신 수정일
  - KPI/예산/일정 완결성 보유
- 연결 근거:
  - [[Sources]]
  - [[Evidence_Log]]
- 후속 영향:
  - 비교본 차이는 [[Conflict_Register]]와 [[Change_Log]]에 반영
```

## Risks.md

```markdown
# Risks

## Open Risks
- 리스크:
  - KPI 수치가 문서 섹션별로 다르게 표현됨
- 영향:
  - 제안서/보고서 본문 단일화 실패 가능성
- 대응:
  - 고객/내부 기준본 재확인
- 연결 근거:
  - [[Evidence_Log]]
  - [[Conflict_Register]]
```

## 날짜형 Append 블록

```markdown
## Update - 2026-04-21
- Source: [[Sources]]
- New Evidence:
  - "고객사 3개 라인 적용 시 연간 절감액 1.2억 원"
- Interpretation:
  - 파일럿 기준 ROI 논리 강화 가능
- Impacted Pages:
  - [[Revenue Model]]
  - [[Project_Overview]]
  - [[Risks]]
- Status:
  - 초안
```

## 문서 메모 템플릿

```markdown
# 2026-04-21_회의록

- 문서명: 4월 21일 실무회의
- 문서 유형: 회의록
- 날짜: 2026-04-21
- 참석자:
- 핵심 의사결정:
- 보류사항:
- 액션아이템:
- 충돌 가능 항목:
- 연결 페이지:
```

## 연결 문서

- [[Wiki/Schema]]
- [[Wiki/Common/Wiki_Ingest_Operating_Model]]
- [[Wiki/Common/Wiki_Ingest_Prompt_Set]]
