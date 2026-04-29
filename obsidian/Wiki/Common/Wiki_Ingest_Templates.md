---
type: knowledge
created: 2026-04-21
updated: 2026-04-29
source: "2026-04-21 ingest redesign discussion"
---

# Wiki Ingest Templates

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
- 연결 페이지: [[Project Overview]], [[KPI]], [[Revenue Model]]
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
- 연결 페이지: [[Project Overview]], [[KPI]]
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
  - [[Project Overview]]
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
  - [[Project Overview]]
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
