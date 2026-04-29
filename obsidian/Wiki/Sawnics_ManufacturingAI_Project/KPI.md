---
type: kpi
created: 2026-04-29
updated: 2026-04-29
source: "/Users/rtm/Documents/GitHub/commonWork/1.POC/쏘닉스/sawnics_poc_report_config.json"
---

# KPI

## Update - 2026-04-29

### 데이터 규모
- 총 이미지: 50장
- 정상: 30장
- 불량: 20장

### 탐지 성과
- IDT: `13 / 13`
- Metal: `4 / 5`
- Non Metal: `4 / 5`

### 미탐 케이스
- Metal 미탐: `D_3310`
- Non Metal 미탐: `D_2324`

### 파이프라인 기준선
- 입력 구조: 4패널 2x2 원본에서 좌상단 ROI 크롭
- 처리 흐름: `원본 이미지 -> ROI 크롭 -> 영역 분할 -> SAM3 Text Prompting -> 후처리`
- IDT 세분화: 11개 박스 단위 크롭

### 제안용 해석 포인트
- 강점 KPI:
  - IDT 영역 전건 탐지
  - 불량 자동 검출 가능성 실증
- 보완 KPI:
  - Metal/Non Metal 각 1건 미탐
  - 더 높은 해상도 입력 또는 threshold 세분화 필요
  - 샘플 부족 패턴에 대한 합성/재학습 필요
