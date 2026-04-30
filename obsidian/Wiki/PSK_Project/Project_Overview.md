---
type: overview
created: 2026-04-21
updated: 2026-04-30
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Project Overview

## 운영 요약
- 현재 상태: 최신 실행 상태는 [[Wiki/PSK_Project/hub]]의 `실행 현황판`과 `현재 막힘 / 충돌` 기준으로 우선 확인합니다.
- 실무 포인트: 이 문서는 프로젝트 목적, 범위, 현재 단계, 주요 판단을 빠르게 파악하는 기준 문서입니다.
- 상태 기준: [[Wiki/PSK_Project/Status]]
- 다음 반영: [[Wiki/PSK_Project/Action_Items]], [[Wiki/PSK_Project/Decisions]], [[Wiki/PSK_Project/Risks]]와 정합성을 맞추며 갱신합니다.

## 현재 상태
- 상태 요약: 허브 및 L1_memory 기준으로 현행화 필요
- 단계: 제안 / 수행 / 검수 / 운영 중 해당 단계 명확화 필요
- 마지막 의미 있는 변화: 2026-04-30 운영형 문서 구조 반영

## 프로젝트 범위
- 고객/대상: 확인된 고객사와 운영 범위를 유지
- 핵심 산출물: 실제 보고서, 제안서, 납품물, 검수물 기준으로 정리
- 연결 근거: [[Wiki/PSK_Project/Sources]], [[Wiki/PSK_Project/Evidence_Log]]

## 핵심 판단
- 현재 확정 판단: [[Wiki/PSK_Project/Decisions]] 기준으로 정리
- 남은 판단 포인트: [[Wiki/PSK_Project/Conflict_Register]]와 [[Wiki/PSK_Project/Risks]] 기준으로 추적

## 다음 액션 연결
- 상태 레지스터: [[Wiki/PSK_Project/Status]]
- 실행 항목: [[Wiki/PSK_Project/Action_Items]]
- 리스크 점검: [[Wiki/PSK_Project/Risks]]
- 변경 이력: [[Wiki/PSK_Project/Change_Log]]

## 기존 정리 메모
## Update - 2026-04-21

### 범위
- 본 문서는 공개 Slack 기준 최근 2년(2024-04-21 ~ 2026-04-21)의 PSK 관련 증적을 구조화한 개요다.
- 본 수집에는 PSK 본 프로젝트 외에 PSKH, PSK EHM, PSK PE Agent, PSK Precia, 공동기술개발 계약, 견적/납품 흐름이 함께 포함된다.

### 핵심 워크스트림
- 공동기술개발 계약 및 공수 산정
- EHM 설치, 버전, 견적, 납품
- PE Agent 데모, 소개서, 사용자 가이드, 피드백 수집
- Precia Vision 과제의 milestone, 배포, threshold 리스크, 추가 데이터 요청
- 온도예측task 초기 논의와 IR 센서 요구사항 청취

### 최근 2년 흐름 요약
- 2024년 하반기에는 PSK/PSKH 공동기술개발, EHM 교육, 방문 내역, 견적/발주/세금계산서 흐름이 명확하게 보인다.
- 2025년에는 KPI, PE Agent 피드백 양식, POC 발표자료, EHM essential 요구사항 정리 등 제품화/제안서 준비 흐름이 강화된다.
- 2026년에는 공동기술개발 계약 항목 조정, PE Agent 사업계획서 수치화, Precia milestone 운영, EHM 견적 및 납품 명시가 집중된다.

### 확인된 핵심 수치와 운영 기준
- 2024년 12월 기준 PSKH 공동기술개발은 총 `2억원` 규모로 언급되며, 이 중 `1억원`은 이미 9월 세금계산서 발행 완료, 나머지 `1억원`은 연내 발행 필요로 정리된다.
- 2024년 12월 말에는 PSK 발주 건 기준 `5천만원(VAT 별도)` 세금계산서 발행 메시지가 확인된다.
- 2026년 PE Agent 사업계획서 보완 과정에서는 서버 예산이 `29,000천원 x 2대 = 58,000천원`으로 제시된다.
- 같은 시기 서버 최소 사양은 `GPU VRAM 32GB+`, `RAM 256GB+`, `SSD 4TB+`로 정리된다.
- 추가 견적 검토 메시지에서는 서버 단가가 `RAM 512GB 기준 17,000,000원`, `RAM 256GB 기준 13,400,000원`으로 비교된다.
- 2026년 4월 EHM 관련 발주 메시지에서는 `PO No. 4500391911`, `수량 1ea`, `납기일 2026-05-20`이 직접 확인된다.

### 현재 상태
- 계약/공수 영역은 실무 운영 채널과 공수 산정 시트가 연결되어 있고, 항목별 금액 방어 논리가 핵심 이슈다.
- EHM 영역은 버전 명시, 설치/패치, 납기, 발주서/PO 처리, export 이슈 대응이 중요하다.
- PE Agent 영역은 고객 설명 자료, 데모 운영, 피드백 반영, 서버 사양 수치 정리가 핵심이다.
- Precia 영역은 실사용 데이터 추가 확보와 threshold 일반화 한계가 핵심 리스크다.
- 온도예측task 영역은 아직 상견례와 요구사항 청취 수준으로, 독립 과제라기보다 PSK 하위 탐색 workstream으로 보는 편이 안전하다.

### 협업 운영 구조
- 2026년 초 기준 PSK-RTM 주간회의는 지속적으로 운영되며, 회의록 양식 개편과 업무관리툴 전환 논의가 병행된다.
- PE Agent 관련 자료는 PSK 직원이 직접 확인할 수 있도록 Confluence 내 PSK 공간에 정리하는 방향이 명시된다.
- 2025년 7월부터는 PEE팀이 개별 개발하던 PE Agent와 RTM 쪽 개발 목표를 더 가깝게 맞추는 방향의 협의가 진행된다.

### 위키 관점에서 중요한 해석
- PSK는 단일 제안 프로젝트가 아니라 `공동기술개발 계약`, `EHM 납품/운영`, `PE Agent 제품화`, `Precia 현장 적용`이 동시에 움직이는 장기 고객 계정이다.
- 따라서 문서 구조도 단일 개요만으로는 부족하고, 향후 `PSKH`, `PE Agent`, `Precia`, `EHM 납품`, `온도예측task` 하위 문서로 분기할 여지가 크다.
- 특히 비용 항목 방어, 서버 사양/단가, 장비별 threshold 한계처럼 숫자와 근거가 함께 움직이는 항목은 일반 회의 메모보다 상위 위키 페이지로 승격할 가치가 높다.

### 운영 환경
- Slack Canvas `PSK 판교 CentOS Usage Overview`에는 PSK/PSKH 관련 분석 앱, 대시보드, 포트, 배포 경로, owner가 명시되어 있다.
- 확인된 항목:
  - health-score-analysis `8511`
  - health-score-trend `8512`
  - within-lot-seq-analysis `8513`
  - TS Offline App `8515`
  - LLTMPM `8517`
  - Overlay `8518`
  - HS Dashboard (Milano) `8601`
  - HS Dashboard (Ecolite) `8602`

### 연결 문서
- [[Sources]]
- [[Evidence_Log]]
- [[Decisions]]
- [[Risks]]
- [[Change_Log]]
- [[Conflict_Register]]
- [[KPI]]
- [[Action_Items]]
