---
type: overview
created: 2026-04-21
updated: 2026-04-30
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Project Overview

## 운영 요약
- 참조 기준 문서: [[Wiki/DaehanCable_ProcessInnovation_Project/Reference_Register]]
- 현재 상태: 최신 실행 상태는 [[Wiki/DaehanCable_ProcessInnovation_Project/hub]]의 `실행 현황판`과 `현재 막힘 / 충돌` 기준으로 우선 확인합니다.
- 실무 포인트: 이 문서는 프로젝트 목적, 범위, 현재 단계, 주요 판단을 빠르게 파악하는 기준 문서입니다.
- 상태 기준: [[Wiki/DaehanCable_ProcessInnovation_Project/Status]]
- 다음 반영: [[Wiki/DaehanCable_ProcessInnovation_Project/Action_Items]], [[Wiki/DaehanCable_ProcessInnovation_Project/Decisions]], [[Wiki/DaehanCable_ProcessInnovation_Project/Risks]]와 정합성을 맞추며 갱신합니다.

## 현재 상태
- 상태 요약: 허브 및 L1_memory 기준으로 현행화 필요
- 단계: 제안 / 수행 / 검수 / 운영 중 해당 단계 명확화 필요
- 마지막 의미 있는 변화: 2026-04-30 운영형 문서 구조 반영

## 프로젝트 범위
- 고객/대상: 확인된 고객사와 운영 범위를 유지
- 핵심 산출물: 실제 보고서, 제안서, 납품물, 검수물 기준으로 정리
- 연결 근거: [[Wiki/DaehanCable_ProcessInnovation_Project/Sources]], [[Wiki/DaehanCable_ProcessInnovation_Project/Evidence_Log]]

## 핵심 판단
- 현재 확정 판단: [[Wiki/DaehanCable_ProcessInnovation_Project/Decisions]] 기준으로 정리
- 남은 판단 포인트: [[Wiki/DaehanCable_ProcessInnovation_Project/Conflict_Register]]와 [[Wiki/DaehanCable_ProcessInnovation_Project/Risks]] 기준으로 추적

## 다음 액션 연결
- 상태 레지스터: [[Wiki/DaehanCable_ProcessInnovation_Project/Status]]
- 실행 항목: [[Wiki/DaehanCable_ProcessInnovation_Project/Action_Items]]
- 리스크 점검: [[Wiki/DaehanCable_ProcessInnovation_Project/Risks]]
- 변경 이력: [[Wiki/DaehanCable_ProcessInnovation_Project/Change_Log]]

## 기존 정리 메모
대한전선 공정혁신과제는 공개 Slack 기준으로 센서/SCADA 기반 설비 데이터 분석과 케이블 외관검사 솔루션 제안이 결합된 과제형 프로젝트다. 채널명 자체에 `공정혁신과제`와 `호반혁신기술공모전`이 포함되어 있고, 실제 메시지에서도 `SCR 압연 설비 이상 탐지`, `SCADA`, `Monit`, `불량 샘플 이미지`, `외관검사 솔루션 구축 제안`이 함께 등장한다.

이 프로젝트의 핵심은 단일 모델 개발보다 “어떤 데이터를 어떤 단위로 믿고 분석할 것인가”에 있다. 예를 들어 `압연 2번은 RPM, 12번은 Hz`처럼 데이터 단위 불일치가 직접 논의되고, SCADA/Monit 상관관계 분석 기준까지 메시지에 남아 있다. 따라서 제안형 프로젝트이면서 동시에 데이터 정의 리스크가 큰 분석형 과제로 보는 편이 적절하다.

## 한 줄 요약

- 대한전선 공정혁신과제는 센서/SCADA 데이터 분석과 외관검사 샘플을 결합해 설비 이상 탐지와 검사 솔루션을 제안한 프로젝트다.

## 프로젝트 성격

- 유형: 데이터 분석 + 제안형 과제 프로젝트
- 고객: 대한전선
- 주요 키워드:
  - 공정혁신과제
  - SCADA
  - Monit
  - SCR 압연 설비 이상 탐지
  - 외관검사 솔루션

## 현재까지 확인된 실제 정보

- 채널은 과거 `hubble-pjt-대한전선-...`에서 현재 `pjt-대한전선-...`으로 이름이 변경됐다.
- 주요 파일:
  - `대한전선 불량이미지.zip`
  - `압연 2_Daily.csv`
  - `압연 12_Daily.csv`
  - `ADV user guide.pdf`
- 메시지 맥락:
  - 넥스버를 통해 케이블 외관검사 솔루션 구축을 제안하는 과정에서 불량 샘플 이미지가 공유됨
  - SCADA/Monit 기반 `SCR 공정 압연설비 #2/#12` 데이터 분석 요청이 병행됨
  - 데이터 단위 불일치(`2번 RPM`, `12번 Hz`)와 특정 시간대/설비별 frequency 이상치 해석이 논의됨
  - 상관관계 분석 기준(`r > .9`, `r > 0.8`)을 고객 질의용으로 정리하는 흔적이 있음

## 핵심 엔티티

- 고객:
  - 대한전선
- 주제:
  - 공정혁신과제
  - 호반혁신기술공모전
  - SCR 압연 설비
  - SCADA/Monit
  - 외관검사 솔루션
- 주요 파일:
  - `대한전선 불량이미지.zip`
  - `압연 2_Daily.csv`
  - `압연 12_Daily.csv`
  - `ADV user guide.pdf`

## 핵심 결정

- 과제는 센서 데이터 분석과 외관검사 샘플 검토를 병행하는 방식으로 진행됐다.
- 데이터 해석 전에 단위와 설정값을 통일 확인해야 한다는 방향이 명확히 잡혀 있다.
- 고객 질의 대응을 위해 상관관계 분석과 이상치 해석을 정리해 전달하는 방식이 사용됐다.

## 현재 상태

- 2024년 3월 기준 데이터와 불량 샘플이 이미 공유된 상태다.
- 그러나 메시지 내용상 추가 촬영 가능 여부, 데이터 단위 확인, 해석 재정리가 계속 필요했다.
- 따라서 현재 위키 분류는 “분석 기반 제안 단계” 또는 “데이터 검증이 핵심인 과제 초기 단계”가 적절하다.

## 위키에 남겨야 할 포인트

- 이 프로젝트는 분석 모델보다 `데이터 단위/설정값/센서 정의`가 핵심 리스크라는 점이 중요하다.
- 외관검사 솔루션 제안과 설비 이상 탐지 분석이 한 과제 안에서 결합될 수 있다는 사례로 재사용 가치가 높다.
- 고객 대응 시 “분석 결과”보다 먼저 “데이터 해석 조건”을 맞춰야 한다는 프레임을 남겨둘 만하다.

## 확인 필요

- 외관검사 솔루션과 설비 이상 탐지가 단일 제안서 안에 묶였는지
- `ADV user guide.pdf`의 역할이 장비 운영 가이드인지 분석 참고 자료인지
- 이후 고객 피드백과 추가 데이터 확보가 실제로 진행됐는지
