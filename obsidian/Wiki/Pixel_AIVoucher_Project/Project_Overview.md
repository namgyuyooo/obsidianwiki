---
type: overview
created: 2026-04-21
updated: 2026-04-30
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Project Overview

## 운영 요약
- 참조 기준 문서: [[Wiki/Pixel_AIVoucher_Project/Reference_Register]]
- 현재 상태: 최신 실행 상태는 [[Wiki/Pixel_AIVoucher_Project/hub]]의 `실행 현황판`과 `현재 막힘 / 충돌` 기준으로 우선 확인합니다.
- 실무 포인트: 이 문서는 프로젝트 목적, 범위, 현재 단계, 주요 판단을 빠르게 파악하는 기준 문서입니다.
- 상태 기준: [[Wiki/Pixel_AIVoucher_Project/Status]]
- 다음 반영: [[Wiki/Pixel_AIVoucher_Project/Action_Items]], [[Wiki/Pixel_AIVoucher_Project/Decisions]], [[Wiki/Pixel_AIVoucher_Project/Risks]]와 정합성을 맞추며 갱신합니다.

## 현재 상태
- 상태 요약: 허브 및 L1_memory 기준으로 현행화 필요
- 단계: 제안 / 수행 / 검수 / 운영 중 해당 단계 명확화 필요
- 마지막 의미 있는 변화: 2026-04-30 운영형 문서 구조 반영

## 프로젝트 범위
- 고객/대상: 확인된 고객사와 운영 범위를 유지
- 핵심 산출물: 실제 보고서, 제안서, 납품물, 검수물 기준으로 정리
- 연결 근거: [[Wiki/Pixel_AIVoucher_Project/Sources]], [[Wiki/Pixel_AIVoucher_Project/Evidence_Log]]

## 핵심 판단
- 현재 확정 판단: [[Wiki/Pixel_AIVoucher_Project/Decisions]] 기준으로 정리
- 남은 판단 포인트: [[Wiki/Pixel_AIVoucher_Project/Conflict_Register]]와 [[Wiki/Pixel_AIVoucher_Project/Risks]] 기준으로 추적

## 다음 액션 연결
- 상태 레지스터: [[Wiki/Pixel_AIVoucher_Project/Status]]
- 실행 항목: [[Wiki/Pixel_AIVoucher_Project/Action_Items]]
- 리스크 점검: [[Wiki/Pixel_AIVoucher_Project/Risks]]
- 변경 이력: [[Wiki/Pixel_AIVoucher_Project/Change_Log]]

## 기존 정리 메모
픽셀 AI바우처 프로젝트는 공개 Slack 기준으로 패키지/이미지 검사 영역의 AI바우처를 수행한 뒤, 이후 PIXEL과 DMT를 어떤 구조로 협력할지 재정의하는 프로젝트다. 재탐색 결과 `중간보고`, `비즈니스 협력 모델안`, `픽셀 v2 자료`, 중간보고 회의록이 확인되어 이제는 독립 프로젝트로 분리해두는 편이 타당하다.

핵심은 다양한 패키지 도메인(`FCBOC`, `FCCSP`, `SIP`, `CSP`, `FCBGA`)을 어떤 분류 체계로 정리할지, 그리고 실제 라인 투입 시 결과를 `XML`과 `NAS` 중심으로 반영할지에 있다. 따라서 이 프로젝트는 단순 모델 학습보다 `도메인 정의 + 운영 반영 구조 + 후속 협력 모델`의 결합 프로젝트로 보는 편이 맞다.

## 한 줄 요약

- 픽셀 AI바우처 프로젝트는 패키지 이미지 검사 AI바우처 수행 이후 PIXEL/DMT 협력 구조를 재정의하는 프로젝트다.

## 프로젝트 성격

- 유형: AI바우처 + 후속 협업 구조 설계형 프로젝트
- 고객/협업 대상: PIXEL
- 주요 키워드:
  - AI바우처
  - 중간보고
  - 협력 모델안
  - 패키지 도메인
  - XML/NAS 반영

## 현재까지 확인된 실제 정보

- 주요 파일:
  - `중간보고_(일반분과)_..._픽셀_알티엠.pptx`
  - `240827_픽셀AI바우처 중간보고 관련 내용.gdoc`
  - `241015_픽셀_v2.pdf`
  - `RTM-PIXEL 2025 비즈니스 협력 모델안_241031.pptx`
  - `dmt 판정기준정리.xlsx`
- 메시지 맥락:
  - AI바우처 중간보고 일정과 관련 회의록 정리 흔적 확인
  - AI바우처 종료 이후 PIXEL과 DMT를 개별 협력 모델로 가져가자는 방향 공유
  - 실제 라인 투입을 고려해 프론트 최소화, XML 업데이트, NAS 저장 구조를 논의
  - 패키지별 데이터 범위와 도메인 정리가 핵심 논의 포인트로 반복됨
  - 현장에서는 별도 프론트보다 결과 XML 갱신만으로 충분한지 검토하는 흐름이 있었다
  - DMT와 함께 테스트 셋업, BC 이미지 제외, 단계적 IVS 확대 가능성도 언급됐다
  - DMT 보조 채널에서는 XML 구조 해석, `_DL.xml` 인식, NAS 경로, CSV 결과 공유, 원격 접속 환경 등 실제 운영/배포 절차가 더 구체적으로 정리된다

## 핵심 엔티티

- 고객/협업 대상:
  - PIXEL
  - DMT
- 주제:
  - 패키지 이미지 검사
  - XML 업데이트
  - NAS 저장
  - 협력 모델
  - 패키지 도메인 정의
  - BC 이미지 제외
  - IVS 확장

## 핵심 결정

- AI바우처 종료 이후 PIXEL과 DMT는 개별 협력 모델로 정리하는 방향이 제시됐다.
- 실제 라인 적용을 고려해 프론트는 최소화하고 XML/NAS 중심 반영 구조를 검토했다.
- 데이터 도메인과 패키지 유형을 먼저 정리한 뒤 모델 고도화에 들어가는 접근이 사용됐다.
- 패키지 도메인 차이가 커서 하나의 모델 일반화보다 도메인별 분류 체계 정리가 우선 과제로 보인다.

## 현재 상태

- 2024년 하반기 기준 AI바우처 수행과 중간보고는 완료된 흐름이 보인다.
- 이후 2025 협력 모델안으로 후속 사업 구조를 다시 설계하는 단계로 넘어간다.
- 현재 위키 분류는 “종료된 AI바우처 + 후속 협업 설계 단계”가 적절하다.

## 위키에 남겨야 할 포인트

- 픽셀은 더 이상 단순 이미지 샘플 채널이 아니라 중간보고와 후속 사업 설계가 함께 있는 프로젝트다.
- 핵심은 성능보다 `패키지 도메인 정의`와 `결과 반영 방식(XML/NAS)`이다.
- DMT는 지금 기준으로는 픽셀 구현/연동을 보조하는 채널로 해석하는 편이 안전하다.
- 특히 DMT 채널은 독립 고객 프로젝트보다 픽셀 후속 구현과 검증을 담당하는 운영 workstream 성격이 강하다.
- 이 프로젝트는 향후 패키지 검사 프로젝트에서 `도메인 맵 먼저, 모델 고도화는 그 다음`이라는 템플릿으로 재사용 가능하다.

## 확인 필요

- 최종 결과보고 문서 추가 존재 여부
- PIXEL과 DMT 개별 협력 모델의 실제 계약/개발 전환 여부
- 패키지 도메인 분류 체계의 최종본
