---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Precia

Precia는 PSK 계정에서 가장 전형적인 `현장 적용형 비전 과제` 성격을 가진다. milestone, 배포, 데이터 요구량, threshold 일반화 한계가 반복적으로 나온다.

## 핵심 사실

- 2026년 3월 기준 milestone은 `FEASIBILITY 확인(3월)`, `PHASE1(~5월)`로 정리된다.
- Sobel 필터 로직 적용은 차주 목요일 배포로 관리된다.
- 데이터 요구량은 segmentation 기준 `클래스별 최소 100장`, anomaly 기준 `최소 10장`으로 구분된다.

## 주요 리스크

- 동일 threshold를 다른 장비와 wafer에 그대로 적용하면 측정이 제대로 되지 않는다는 메시지가 직접 확인된다.
- 즉 Precia의 핵심 리스크는 단순 모델 정확도보다 `장비별/조건별 일반화 한계`다.
- 일부 메시지에서는 milestone이 애초에 명확하지 않았다는 뉘앙스도 있어, 일정 자체도 완전히 고정된 상태는 아니었던 것으로 보인다.

## 위키 해석

- Precia는 `수치`, `일정`, `배포`, `데이터 부족`, `일반화 한계`가 동시에 움직이는 과제다.
- 따라서 향후 이 문서는 `Milestone`, `Data Requirements`, `Threshold Strategy`, `Release History` 하위 섹션으로 더 세분화할 수 있다.
- PSK 전체 위키에서 Precia는 “현장 확산 전에 어떤 리스크를 체크해야 하는가”를 보여주는 대표 사례다.

## 연결 문서

- [[Wiki/PSK_Project/Project_Overview]]
- [[Wiki/PSK_Project/KPI]]
- [[Wiki/PSK_Project/Risks]]
- [[Wiki/PSK_Project/Conflict_Register]]
