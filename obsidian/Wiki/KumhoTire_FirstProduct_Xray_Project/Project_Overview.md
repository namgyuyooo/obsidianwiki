---
type: overview
created: 2026-04-21
updated: 2026-04-30
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Project Overview

## 운영 요약
- 참조 기준 문서: [[Wiki/KumhoTire_FirstProduct_Xray_Project/Reference_Register]]
- 현재 상태: 최신 실행 상태는 [[Wiki/KumhoTire_FirstProduct_Xray_Project/hub]]의 `실행 현황판`과 `현재 막힘 / 충돌` 기준으로 우선 확인합니다.
- 실무 포인트: 이 문서는 프로젝트 목적, 범위, 현재 단계, 주요 판단을 빠르게 파악하는 기준 문서입니다.
- 상태 기준: [[Wiki/KumhoTire_FirstProduct_Xray_Project/Status]]
- 다음 반영: [[Wiki/KumhoTire_FirstProduct_Xray_Project/Action_Items]], [[Wiki/KumhoTire_FirstProduct_Xray_Project/Decisions]], [[Wiki/KumhoTire_FirstProduct_Xray_Project/Risks]]와 정합성을 맞추며 갱신합니다.

## 현재 상태
- 상태 요약: 허브 및 L1_memory 기준으로 현행화 필요
- 단계: 제안 / 수행 / 검수 / 운영 중 해당 단계 명확화 필요
- 마지막 의미 있는 변화: 2026-04-30 운영형 문서 구조 반영

## 프로젝트 범위
- 고객/대상: 확인된 고객사와 운영 범위를 유지
- 핵심 산출물: 실제 보고서, 제안서, 납품물, 검수물 기준으로 정리
- 연결 근거: [[Wiki/KumhoTire_FirstProduct_Xray_Project/Sources]], [[Wiki/KumhoTire_FirstProduct_Xray_Project/Evidence_Log]]

## 핵심 판단
- 현재 확정 판단: [[Wiki/KumhoTire_FirstProduct_Xray_Project/Decisions]] 기준으로 정리
- 남은 판단 포인트: [[Wiki/KumhoTire_FirstProduct_Xray_Project/Conflict_Register]]와 [[Wiki/KumhoTire_FirstProduct_Xray_Project/Risks]] 기준으로 추적

## 다음 액션 연결
- 상태 레지스터: [[Wiki/KumhoTire_FirstProduct_Xray_Project/Status]]
- 실행 항목: [[Wiki/KumhoTire_FirstProduct_Xray_Project/Action_Items]]
- 리스크 점검: [[Wiki/KumhoTire_FirstProduct_Xray_Project/Risks]]
- 변경 이력: [[Wiki/KumhoTire_FirstProduct_Xray_Project/Change_Log]]

## 기존 정리 메모
금호타이어 첫제품 / X-ray 프로젝트는 공개 Slack 기준으로 제안-검증 단계에서 실제 현장 적용 단계로 넘어가는 흔적이 뚜렷한 후보다. 2026년 4월 초 경과보고 발표자료와 사용자 매뉴얼, 산출물 목록 파일이 확인되고, 같은 시기 채널 메시지에는 현장 점검, 고객 화상회의, 액션 아이템, X-RAY 하드웨어 현장 납품 일정이 남아 있다.

이 프로젝트의 특징은 POC 당시 기대 수준과 실제 현장 과제 요구 수준 사이의 간극이 메시지에서 반복적으로 드러난다는 점이다. 따라서 제안형 프로젝트이면서 동시에 운영 전환 리스크가 큰 프로젝트로 보는 편이 적절하다.

## 한 줄 요약

- 금호타이어 첫제품 / X-ray 프로젝트는 POC 결과를 실제 현장 설치와 운영으로 전환하는 단계의 프로젝트다.

## 프로젝트 성격

- 유형: 제안-검증에서 운영 전환으로 넘어가는 현장형 프로젝트
- 고객: 금호타이어
- 주요 키워드:
  - 첫제품 검사
  - X-ray 검사
  - 현장 점검
  - 데모 피드백 반영
  - 하드웨어 현장 납품

## 현재까지 확인된 실제 정보

- 결과/설명 문서:
  - 경과보고 발표자료
  - 사용자 매뉴얼
  - 산출물 목록
- 현장 운영 메시지:
  - 4/10 내부 방향 정리
  - 4/14 현장 점검 및 고객 화상회의
  - 4/20 현장 미팅과 다음 주 납품 계획
- 후속 개발 메시지:
  - 차주 1차 납품용 AI 모듈 완료 및 공유
  - `RealAIGateway` 기반 연동 방식과 출력 항목(`img_idx`) 확장 논의
  - 화면 확대/축소, 2장 대신 1장 크게 보기 등 작업자 UI 피드백 수집
  - Mold 번호 검증, 일부 검사 항목 제외/재정의 논의
- 상태 해석:
  - 고객 피드백을 반영한 뒤 실제 설치/납품으로 이어지는 단계 전환이 확인된다.

## 핵심 엔티티

- 고객:
  - 금호타이어
- 주제:
  - 첫제품 검사
  - X-ray 검사
  - AI 검사 시스템
- 주요 문서:
  - 경과보고
  - 사용자 매뉴얼
  - 산출물 목록

## 핵심 결정

- 라이브 화면 수정 기능을 추가하는 방향
- Engine 활용 방향은 유지
- 데모에서 사용자 의견을 충분히 수집한 뒤 실제 솔루션에 반영/설치
- 차주 1차 납품용 AI 모듈을 기준으로 현장 설치를 진행
- UI는 현장 작업자 가독성과 단일 이미지 집중 확인 흐름에 맞게 조정

## 현재 상태

- POC/중간보고 단계는 이미 지나갔고
- 4월 중순에는 현장 점검과 고객 협의가 진행됐으며
- 4월 20일 기준 다음 주 하드웨어 현장 납품 계획이 잡혀 있다
- 4월 16일 이후에는 작업자 피드백을 받아 화면 가독성, 확대/축소, 표시 방식 수정이 핵심 후속 과제가 된다
- 4월 말 전후에는 AI 모듈 완료 공유와 함께 실제 1차 납품 기준 인터페이스/출력 구조가 구체화된다

## 위키에 남겨야 할 포인트

- 이 프로젝트의 핵심은 모델 성능 자체보다 `POC 기준`과 `실제 과제 기준`의 차이다.
- 운영 전환 시점의 현장 요구사항과 UI/프로세스 수정 요청을 같이 봐야 한다.
- 향후 비슷한 현장 전환형 프로젝트의 리스크 프레임으로 재사용 가능하다.
- 특히 검사 기준 자체가 고정된 것이 아니라 현장 피드백을 통해 `제외 항목`, `Mold 번호 확인`, `출력 형태`가 계속 조정된다는 점이 중요하다.

## 확인 필요

- 실제 납품 이후 안정화가 어떻게 진행됐는지
- 경과보고 자료의 성능 기준과 고객 수용 기준이 정확히 어떻게 달랐는지
