---
type: knowledge
created: 2026-04-27
updated: 2026-04-27
source: "Validation worksheet for re-running Trust my Tech 2nd project through the RTM government RnD template stack"
tags:
  - validation
  - rtm
  - thales
  - trust-my-tech
  - government-rnd
---

# Trust my Tech 2차 검증 워크시트

## 목적

- 이미 작성 완료된 `Trust my Tech 2차` 과제를 검증용 샘플로 다시 돌려, 현재 구축한 정부과제 템플릿과 문체 자산의 재현력을 점검한다.
- 목표는 새 과제를 다시 쓰는 것이 아니라, `현재 템플릿이 얼마나 원본 문체와 구조를 복원하는지`, `충돌값을 숨기지 않고 보존하는지`, `보안형 제조 AI 문맥을 제대로 유지하는지`를 확인하는 것이다.

## 검증 기준본

- 대표본:
  - `(kr)별첨1-9. (탈레스) Trust my Tech 프로그램 사업계획서_vf.pdf`
- 비교본:
  - `별첨1-9. (탈레스) Trust my Tech 프로그램 사업계획서.pdf`
  - `별첨1-11. Trust my Tech 프로그램 사업계획서(인건비 제외)_250509.pdf`

## 현재 기준 요약

- 대표 신청 주체: `고려대 세종산학협력단`
- 대표본 과제번호: `20446514`
- 대표본 예산: 정부지원 `100백만원`, 총사업비 `143백만원`
- 대표 제품 축: `TS Agent`
- 핵심 문맥: `온프레미스`, `역할 기반 접근통제`, `접근 로그`, `감사 추적`, `글로벌 협업 확장`

## 왜 검증용으로 적합한가

- 이미 작성 완료본이 있어 `재생성 초안`과 원본을 직접 비교할 수 있다.
- `vf` 대표본과 `인건비 제외본` 간 과제번호/예산/솔루션 축 충돌이 남아 있어, 현재 위키 체계가 충돌을 감추지 않는지 확인하기 좋다.
- 일반 제조 AI 문체가 아니라 `보안형 제조 현장 + 온프레미스 + 통제력` 문맥이 강해, 템플릿의 범용성과 한계를 동시에 점검할 수 있다.

## 검증 절차

### 1. 재생성 입력값 고정

- 사업명: `Trust my Tech 프로그램`
- 수요기업/협업축: `탈레스`
- 대상 맥락: `보안 민감 제조현장`
- 핵심 문제:
  - 외부 클라우드 사용 제약
  - 민감 문서 및 운영 데이터 보호 필요
  - 유지보수/운영 의사결정의 통제 가능성 요구
- 핵심 솔루션 축:
  - `TS Agent`
  - `On-Premise`
  - `역할 기반 접근통제`
  - `접근 로그 및 감사 추적`

### 2. 재생성 템플릿

- 기본 템플릿:
  - [[Wiki/Common/RTM_Government_RnD_Complete_Template]]
- 보강 자산:
  - [[Wiki/Common/Government_RnD_Writing_Style_Guide]]
  - [[Wiki/Common/Government_RnD_HWP_Expression_Bank]]
  - [[Wiki/Common/RTM_Government_RnD_Appeal_Bank]]

### 3. 비교 항목

| 비교 축 | 원본에서 확인할 것 | 재생성본에서 봐야 할 것 |
|---|---|---|
| 문체 | 계획형 문장, 보안형 톤, 통제력 강조 | 홍보형 과장을 줄이고 같은 톤 유지 여부 |
| 구조 | 문제 -> 보안 요구 -> On-Prem -> 사업화/확장 | 같은 흐름으로 재생성되는지 |
| 핵심 표현 | `온프레미스`, `접근통제`, `접근 로그`, `감사 추적` | 빠짐없이 살아 있는지 |
| 충돌 보존 | `vf` vs `인건비 제외본` 과제번호/예산 차이 | 한 값으로 평탄화하지 않는지 |
| 제품 축 | `TS Agent` 중심 서술 | 다른 제품 축으로 오염되지 않는지 |
| 확장 논리 | 글로벌 협업/해외 고객 제안 | 사업화/확산 문단에 유지되는지 |

## 예상 검증 포인트

### 잘 재현되어야 하는 것

- `보안이 중요한 제조 현장`이라는 첫 문장 톤
- `On-Premise 배포`를 기술 선택이 아니라 운영 제약 대응으로 설명하는 방식
- `접근 통제`, `로그`, `감사 추적`을 별도 보안 장치로 강조하는 구조
- `글로벌 협업 확장`을 단순 매출보다 후속 확장 논리로 넣는 방식

### 쉽게 틀어질 수 있는 것

- `TS Agent`가 `Hubble` 또는 일반 제조 AI 서술로 섞이는 문제
- `vf`와 `인건비 제외본` 수치가 한 문장으로 합쳐지는 문제
- 보안형 제안인데 일반 운영형 정부과제 문체로 평탄화되는 문제
- 수요기업/협업기관 맥락보다 알티엠 일반 회사소개가 앞에 튀는 문제

## 판정 기준

### 통과

- 원본 핵심 축이 `보안형 제조 AI`, `On-Premise`, `통제 가능성`으로 유지됨
- 충돌값이 숨겨지지 않고 별도 표기됨
- 재생성본이 원본과 구조적으로 유사하되 과도한 복붙 없이 재서술됨

### 보완 필요

- 보안 표현은 남았지만 사업화/확장 문맥이 약함
- 알티엠 어필은 충분하지만 탈레스 맥락 반영이 약함
- 일반 정부과제 문체는 맞지만 Trust my Tech 고유성은 약함

### 실패

- 과제번호/예산 충돌이 사라짐
- 제품 축이 `TS Agent`에서 다른 솔루션으로 이동함
- 보안형 제조 제안서가 일반 공정개선형 문체로 바뀜

## 권장 후속 산출물

- `Trust my Tech 재생성 초안` 1개
- `원본 vs 재생성 차이표` 1개
- `템플릿 보완 포인트` 1개

## 현재 생성된 산출물

- [[Wiki/Common/RTM_YNG_탈레스_Trust_my_Tech_Body_Draft_2026-04-27]]
- [[Wiki/Common/RTM_YNG_탈레스_Trust_my_Tech_Regenerated_Draft_2026-04-27]]
- [[Wiki/Common/RTM_YNG_탈레스_Trust_my_Tech_Regeneration_Comparison_2026-04-27]]

## 연결 문서

- [[Wiki/Common/RTM_YNG_탈레스_Trust_my_Tech]]
- [[Wiki/Common/RTM_GovRnD_2026_TMT2차]]
- [[Wiki/Common/RTM_Government_RnD_Complete_Template]]
- [[Wiki/Common/RTM_YNG_Conflict_Register_2026-04-21]]
- [[Wiki/Common/RTM_YNG_Change_Log_2026-04-21]]
