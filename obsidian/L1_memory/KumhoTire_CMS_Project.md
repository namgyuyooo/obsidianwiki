---
type: l1_memory
project: KumhoTire_CMS_Project
updated: 2026-04-21
---

# 금호타이어 CMS — L1 Memory Snapshot

## 한줄 요약
배포된 타이어 검사 시각화·측정 로직을 현장 데이터로 재검증·보정 중. 공장 데이터 해상도 상승 시 성능 불안정성 남아 있음. (금호타이어 X-ray와 별개 workstream)

## 프로젝트 유형
운영 전환형 / 배포 후 현장 적합성 보정 단계

## 현재 상태 (What's happening now)
- 2026-04-15 배포 후 FTP 기존 데이터 기준 테스트 완료
- 공장 데이터(고해상도) 환경에서 결과가 맞지 않는 피드백 수신
- 학습 당시 300×300 고정 crop 사용 → 고해상도 환경 동적 조정 중이나 불안정

## 핵심 결정사항
- 시각화 개선: PL1H 추가, CENTER_LINE 추가, HBW1/2 개선, 폰트 크기 수정 (2025-12 배포)
- FTP 기준 테스트 데이터로 배포 검증 반복하는 운영 방식 채택
- 해상도 이슈는 모델/입력 구조 수정 여부까지 포함해 검토

## 핵심 수치 / 파일
- 실패 케이스: `0012026071460101Z1`
- 학습 crop 크기: 300×300 고정
- 주요 파일: `20251218_배포시각화_result.zip`, `result.zip`, `*_overlay.png`

## 미해결 이슈 / 확인 필요
- 공장 데이터 고해상도 대응을 위한 최종 모델 수정 방향 확정 필요
- `0012026071460101Z1` 실패 케이스 해결 여부
- CMS가 금호타이어 첫제품 검사의 하위 workstream인지 독립 과제인지

## 주의사항 (Gotchas)
- 금호타이어 X-ray 채널과 고객은 같지만 완전히 별개 workstream으로 관리할 것
- 연구소 데이터 vs 공장 데이터 해상도 차이가 핵심 — 테스트 환경 확인 필수
- crop 크기 고정 학습 이력 있으므로 고해상도 입력 시 모델 동작 주의

## 드릴다운
- [[Wiki/KumhoTire_CMS_Project/hub]]
- [[Wiki/KumhoTire_CMS_Project/Evidence_Log]]
- [[Wiki/KumhoTire_CMS_Project/Risks]]
