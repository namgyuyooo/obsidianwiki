---
type: l1_memory
project: DaehanCable_ProcessInnovation_Project
updated: 2026-04-30
---

# 대한전선 공정혁신과제 — L1 Memory Snapshot

## 한줄 요약
SCR 압연 설비 이상탐지(SCADA/Monit)와 케이블 외관검사 솔루션을 결합한 데이터 분석+제안형 과제. 데이터 단위 불일치가 핵심 리스크.

## 프로젝트 유형
데이터 분석 + 제안형 / 분석 기반 제안 단계

## 현재 상태
- 불량 샘플 이미지·센서 CSV 이미 공유된 상태 (2024-03 기준)
- 데이터 단위 확인(압연 2번=RPM, 12번=Hz), 이상치 해석 작업 필요
- 상관관계 분석 기준(r>.9, r>0.8)을 고객 질의 대응용으로 정리 중

## 이번 주 실무 포인트
- 불량 샘플 이미지·센서 CSV 이미 공유된 상태 (2024-03 기준)
- 데이터 단위 확인(압연 2번=RPM, 12번=Hz), 이상치 해석 작업 필요
- 상관관계 분석 기준(r>.9, r>0.8)을 고객 질의 대응용으로 정리 중

## 핵심 결정사항
- 설비 이상 탐지 + 외관검사 솔루션 병행 수행
- 분석 전 데이터 단위/설정값 통일 확인이 필수 선행 조건
- 상관관계 분석과 이상치 해석을 고객 질의 대응 자료로 정리

## 핵심 수치 / 파일
- 주요 파일: `대한전선 불량이미지.zip`, `압연 2_Daily.csv`, `압연 12_Daily.csv`, `ADV user guide.pdf`
- 분석 기준: r>.9 (강한 상관), r>0.8 (중간 상관)
- 채널 히스토리: `hubble-pjt-대한전선-...` → `pjt-대한전선-...` 이름 변경됨

## 미해결 이슈
- 외관검사 솔루션과 설비 이상 탐지가 단일 제안서로 묶였는지
- `ADV user guide.pdf` 역할 (장비 운영 가이드 vs 분석 참고 자료)
- 이후 고객 피드백과 추가 데이터 확보 진행 여부

## 다음 액션 / 미팅 전 확인
- 외관검사 솔루션과 설비 이상 탐지가 단일 제안서로 묶였는지
- `ADV user guide.pdf` 역할 (장비 운영 가이드 vs 분석 참고 자료)
- 이후 고객 피드백과 추가 데이터 확보 진행 여부
- 허브 실행 현황판과 `Action_Items.md`를 함께 갱신

## 주의사항 (Gotchas)
- 모델보다 데이터 단위/정의 선행 정리가 핵심 — 이것 없이 분석 결과 제시하면 고객 반박받음
- 호반혁신기술공모전 연계 과제이므로 공모 일정·형식 요구 별도 확인 필요

## 드릴다운
- [[Wiki/DaehanCable_ProcessInnovation_Project/Reference_Register]]
- [[Wiki/DaehanCable_ProcessInnovation_Project/Status]]
- [[Wiki/DaehanCable_ProcessInnovation_Project/hub]]
- [[Wiki/DaehanCable_ProcessInnovation_Project/Evidence_Log]]
- [[Wiki/DaehanCable_ProcessInnovation_Project/Decisions]]
