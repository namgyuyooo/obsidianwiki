---
type: l1_memory
project: KumhoTire_FirstProduct_Xray_Project
updated: 2026-04-21
---

# 금호타이어 첫제품/X-ray — L1 Memory Snapshot

## 한줄 요약
POC 검증 완료 후 현장 설치·납품으로 전환 중. 2026-04 말 1차 하드웨어 납품 계획. 검사 기준 자체가 현장 피드백으로 계속 조정됨. (CMS와 별개 workstream)

## 프로젝트 유형
POC → 운영 전환형 / 현장 납품 단계

## 현재 상태 (What's happening now)
- 2026-04-14: 현장 점검 + 고객 화상회의 완료
- 2026-04-20 기준: 다음 주 하드웨어 현장 납품 계획 확정
- 1차 납품용 AI 모듈 완료 후 공유 단계
- UI 피드백: 화면 확대/축소, 2장→1장 크게 보기, 작업자 가독성 개선 요청 수렴 중

## 핵심 결정사항
- 라이브 화면 수정 기능 추가 방향 확정
- Engine 활용 방향 유지
- UI는 현장 작업자 가독성·단일 이미지 집중 흐름으로 조정
- 차주 1차 납품용 AI 모듈 기준으로 현장 설치 진행

## 핵심 수치 / 파일
- 인터페이스: `RealAIGateway` 기반, 출력 항목 `img_idx` 확장 논의
- 문서: 경과보고 발표자료, 사용자 매뉴얼, 산출물 목록
- 조정 중인 항목: Mold 번호 검증, 일부 검사 항목 제외/재정의

## 미해결 이슈 / 확인 필요
- 실제 납품 이후 안정화 진행 상황
- 경과보고 성능 기준 vs 고객 수용 기준 차이
- 검사 항목 제외/재정의 최종 확정 범위

## 주의사항 (Gotchas)
- POC 기준 ≠ 실제 현장 과제 기준 — 이 간극이 반복 등장하는 프로젝트
- 검사 기준 고정 아님: 제외 항목, Mold 번호, 출력 형태가 피드백마다 변동
- 금호타이어 CMS와 고객 동일하나 채널/workstream 완전 분리

## 드릴다운
- [[Wiki/KumhoTire_FirstProduct_Xray_Project/hub]]
- [[Wiki/KumhoTire_FirstProduct_Xray_Project/Evidence_Log]]
- [[Wiki/KumhoTire_FirstProduct_Xray_Project/Decisions]]
