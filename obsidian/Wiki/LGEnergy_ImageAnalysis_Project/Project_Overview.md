---
type: overview
created: 2026-04-21
updated: 2026-04-30
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Project Overview

## 운영 요약
- 참조 기준 문서: [[Wiki/LGEnergy_ImageAnalysis_Project/Reference_Register]]
- 현재 상태: 최신 실행 상태는 [[Wiki/LGEnergy_ImageAnalysis_Project/hub]]의 `실행 현황판`과 `현재 막힘 / 충돌` 기준으로 우선 확인합니다.
- 실무 포인트: 이 문서는 프로젝트 목적, 범위, 현재 단계, 주요 판단을 빠르게 파악하는 기준 문서입니다.
- 상태 기준: [[Wiki/LGEnergy_ImageAnalysis_Project/Status]]
- 다음 반영: [[Wiki/LGEnergy_ImageAnalysis_Project/Action_Items]], [[Wiki/LGEnergy_ImageAnalysis_Project/Decisions]], [[Wiki/LGEnergy_ImageAnalysis_Project/Risks]]와 정합성을 맞추며 갱신합니다.

## 현재 상태
- 상태 요약: 허브 및 L1_memory 기준으로 현행화 필요
- 단계: 제안 / 수행 / 검수 / 운영 중 해당 단계 명확화 필요
- 마지막 의미 있는 변화: 2026-04-30 운영형 문서 구조 반영

## 프로젝트 범위
- 고객/대상: 확인된 고객사와 운영 범위를 유지
- 핵심 산출물: 실제 보고서, 제안서, 납품물, 검수물 기준으로 정리
- 연결 근거: [[Wiki/LGEnergy_ImageAnalysis_Project/Sources]], [[Wiki/LGEnergy_ImageAnalysis_Project/Evidence_Log]]

## 핵심 판단
- 현재 확정 판단: [[Wiki/LGEnergy_ImageAnalysis_Project/Decisions]] 기준으로 정리
- 남은 판단 포인트: [[Wiki/LGEnergy_ImageAnalysis_Project/Conflict_Register]]와 [[Wiki/LGEnergy_ImageAnalysis_Project/Risks]] 기준으로 추적

## 다음 액션 연결
- 상태 레지스터: [[Wiki/LGEnergy_ImageAnalysis_Project/Status]]
- 실행 항목: [[Wiki/LGEnergy_ImageAnalysis_Project/Action_Items]]
- 리스크 점검: [[Wiki/LGEnergy_ImageAnalysis_Project/Risks]]
- 변경 이력: [[Wiki/LGEnergy_ImageAnalysis_Project/Change_Log]]

## 기존 정리 메모
LG엔솔 이미지분석 프로젝트는 Li 석출 정량화와 XRM 분석 과제를 함께 다루는 분석형 프로젝트로 보인다. 공개 Slack 메시지에서는 샘플 이미지 경로, 측정/분석 시작 요청, 기능 범위, 배포 및 인프라 요구사항이 비교적 구체적으로 정리되어 있다.

## 한 줄 요약

- LG엔솔 이미지분석은 계약 문서보다 `과제 범위`, `분석 대상`, `배포/인프라 조건`이 먼저 드러나는 기술 검토형 프로젝트다.

## 프로젝트 성격

- 유형: 이미지분석 과제 검토 및 요구사항 정리 프로젝트
- 고객: LG엔솔
- 주요 키워드:
  - Li 석출 정량화
  - XRM 분석
  - 샘플 이미지
  - AWS / 내부망
  - Python / Docker / Message Queue

## 현재까지 확인된 실제 정보

- 과제 범위:
  - Li 석출 정량화 과제
  - XRM 분석 과제
  - 내부 메시지 기준 총 3개의 세부 과제가 존재하며, 각 건에 대해 추론 프로그램이 필요하다고 설명된다
- 목표 수치:
  - Li 석출 정량화는 면적비 측정 평균 절대오차 `MAE 2% 이내`
  - XRM 분석은 defect 검출 및 물리량 측정 정확도 `95% 이상`
  - CT 이미지 분석은 물리량 측정 정확도 `99.5% 이상` 초안이 언급되며, 후속 메시지에서는 `95%`로 조정 의견도 나온다
- 데이터/분석:
  - XRM 샘플 이미지 존재
  - 측정 부분 시작 요청 존재
- 배포/인프라 요구:
  - RTM 서버 혹은 AWS 사용 가능성
  - LG엔솔 내부망에서 AWS URL 접근 가능 여부
  - AWS 업로드 허용 여부
  - Python 버전, Docker 지원 여부
  - Message Queue 설치/운영 가능 여부
  - 서버 동시 사용자 수, 업로드 파일 규모, 세션 유지 방식, 파일 삭제 정책까지 함께 검토된다
- 환경 제약 추가:
  - AWS 사용 자체는 가능하나 `LG엔솔 이미지가 AWS로 올라가는 것은 불가`하다는 메시지가 확인된다.
  - 채널 생성 시점 메시지에서는 `계약 절차 진행 중이며, 계약 완료 후 kickoff 예정`이라고 명시된다.
  - 이후 메시지에서는 이미지 반출이 어려우므로 사내 개발 서버 활용 방향으로 진행하겠다는 합의가 확인된다.
  - 주간회의를 `매주 목요일 오전 10시`로 운영하자는 메시지도 있어, 계약 전후 실무 협의 체계가 빠르게 세팅된 것으로 보인다.
  - Li 요구사항 중 `ppt/pdf에서 이미지 추출 사용` 기능은 부적절하다고 판단해 제외하는 흐름이 확인된다.
- 상태 해석:
  - 이 프로젝트는 아직 계약 확정형보다 기술 요구사항 정리와 환경 확인 단계에 가깝다.
  - 다만 계약 초안 검토, 성능 목표 조정, 사내 서버 방향 합의까지 나온 상태라 초기 검토를 넘어 착수 준비 단계로 보는 편이 맞다.

## 핵심 엔티티

- 고객:
  - LG엔솔
- 과제:
  - Li 석출 정량화
  - XRM 분석
- 환경:
  - VISION_NAS
  - RTM 서버
  - AWS
  - 내부망
  - Python
  - Docker
  - Message Queue

## 현재 상태

- 관련 자료와 데이터 경로는 확보되기 시작한 상태다
- 분석 요구사항과 인프라 조건이 동시에 수집되고 있다
- 따라서 본격 구현 전 기술 검토/환경 협의 단계로 판단된다
- 다만 성능 목표 초안과 계약 절차 메시지가 있어, 순수 탐색을 넘어 계약 직전의 요구사항 정렬 단계로 보는 편이 더 정확하다
- 운영 측면에서는 ClickUp space와 주간회의 리듬까지 잡히고 있어, 실제 수행 관리 구조도 빠르게 형성되고 있다

## 위키에 남겨야 할 포인트

- LG엔솔은 계약/견적보다 기술 요구사항과 운영 환경 제약이 먼저 중요한 프로젝트다.
- 이미지분석 과제는 데이터 경로, 배포 방식, 서버 정책을 함께 기록해야 한다.
- 향후 분석형 고객 프로젝트의 환경 요구사항 템플릿으로 재사용 가치가 높다.
- 성능 목표 수치 자체도 고정값이라기보다 협의 중 조정 가능한 목표라는 점을 함께 남겨야 한다.
- 클라우드 사용 가능성과 고객 데이터 반출 허용 여부가 별도 조건이라는 점을 명확히 남겨야 한다.

## 확인 필요

- 계약 초안과 성능 목표 수치가 실제로 어떤 문서로 정리됐는지
- Li 과제와 XRM 과제가 하나의 프로젝트인지, 병렬 과제인지
- 3개 세부 과제의 최종 범위 정의와 개발 우선순위
