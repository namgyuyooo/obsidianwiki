---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
tags:
  - slack
  - evidence
  - proposal-project
---

# Proposal Project Evidence Map

제안, 견적, 요구사항 확인, PoC 결과발표를 중심으로 움직이는 제안-전환형 프로젝트를 위한 증적맵이다. 고객과 내부 논리의 차이, 목표 수치, 범위 조정 흔적을 잡는 데 적합하다.

## 핵심 판별 기준

- `제안서`, `견적서`, `요구사항 문서`, `PoC 결과발표`, `최종리뷰` 중 2종 이상이 존재한다.
- 메시지에서 일정/범위/수치 변경 또는 고객 요구사항이 함께 드러난다.
- 아직 계약 전이거나, 계약 전환 직전의 흔적이 많다.

## Proposal Candidates

| 후보 | 대표 채널 | 핵심 파일 | 현재 판단 | 우선 읽을 증적 |
| --- | --- | --- | --- | --- |
| 현대모비스 | `#pjt_현대모비스` | `요구사항 확인 gdoc`, `제작사양서.xlsx`, `견적서.pdf` | 최우선 | 요구사항, 제작 범위, 납기/계약 충돌 |
| 금호타이어 첫제품 X-ray | `#pjt_금호타이어_첫제품x-ray` | `경과보고.pptx`, `사용자 매뉴얼.pdf`, `산출물.xlsx` | 최우선 | POC 결과와 실제 과제 요구 수준 차이 |
| 메카로 수요예측 | `#pjt_메카로-수요예측` | `단계별 프로젝트 수행 제안서.pdf`, `판매계획 데이터 자산화 프로젝트 제안.pdf`, `PoC 결과발표.pptx` | 높음 | 제안 구조, 근거자료, PoC 결과 |
| 한국알박 | `#pjt_한국알박` | `PoC 제안서.pdf`, `견적서.pdf`, `최종리뷰 gdoc` | 높음 | 제안 버전 변화, 견적 방어 논리, 최종 리뷰 |
| LG엔솔 이미지분석 | `#pjt_lg엔솔이미지분석` | 계약 초안/성능 목표 관련 파일 추적 중 | 보강 필요 | 성능 목표와 계약 초안 정합성 |

## 증적 수집 순서

1. 제안서와 견적서를 먼저 확보한다.
2. 요구사항 문서 또는 회의록에서 고객 요청과 내부 해석을 분리한다.
3. PoC 결과발표나 최종리뷰가 있으면 Change Log와 Conflict Register까지 함께 만든다.

## 권장 위키 페이지

- `[[Project Overview]]`
- `[[Sources]]`
- `[[Evidence Log]]`
- `[[Decisions]]`
- `[[Risks]]`
- `[[Conflict Register]]`

## 리스크 포인트

- 제안 수치와 실제 계약 수치가 달라질 수 있다.
- PoC에서 가능한 수준과 실제 요구 성능이 혼동될 수 있다.
- 최종본 파일과 작업 중간본 파일이 함께 남아 버전 충돌이 날 수 있다.

## 연결 문서

- [[Wiki/Common/Evidence_Candidate_Map]]
- [[Wiki/Common/Project_Candidate_Register]]
