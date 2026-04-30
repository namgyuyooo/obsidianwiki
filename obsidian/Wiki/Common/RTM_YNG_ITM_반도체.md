---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "RTM_YNG ITM pdf"
tags:
  - drive
  - project
  - rtm
  - itm
---

# ITM 반도체

- [[Wiki/Common/RTM_YNG_ITM_반도체_Status]]

## Project Overview

- 문서는 `ITM반도체 전자담배 외관불량 탐지 POC`와 제품군 확장 대응 방안을 다룬다.
- 핵심 질문은 도입 이후 신규 Line-up이 추가될 때, 기존 자동화 설비와 기존 모델을 활용해 확장이 가능한가이다.
- 대표 제안은 신규 제품군 추가 시 기존 모델에 학습데이터를 추가해 업그레이드하는 방식이 가능하다는 쪽으로 정리된다.

## Expansion Strategy

### 1안

- `Hubble engine` 도입을 통해 ITM이 직접 모델을 업그레이드하는 방식
- 라이선스 기반으로 신규 제품군이 생길 때마다 직접 대응 가능
- 유지보수를 위한 교육과 간단 지원을 포함하는 방향

### 2안

- 신규 Line-up 추가 시마다 RTM 연구원이 직접 모델 업그레이드를 수행하는 방식
- `Man-day` 기준 또는 쿠폰형 확장 계약 형태가 제안된다

## Technical Notes

- Scratch, Dent 불량은 기존 클래스 유지 상태에서 신규 제품마다 약 `500장` 이상 라벨링을 통해 재학습하는 구조로 제시된다.
- GAP, 단차 불량은 패턴(`⊔`, `⋀`, `⦘`, `−`)별로 신규 클래스를 추가해 제품 확장 시 대응하는 구조로 설명된다.
- 즉, 외관 불량과 GAP/단차는 같은 확장이라도 클래스 추가 여부가 다르다.

## Document Status

- Primary:
  - `250805_ITM_반도체.pdf`
- Secondary:
  - `250805_ITM_반도체.pptx`
- Hold:
  - 결과 zip
  - 이미지 시트
  - NDA

## Risks

- 신규 제품 확장 시 필요한 라벨링 물량과 재학습 비용이 실제 운영 비용으로 얼마나 커지는지 아직 수치화되지 않았다.
- `Hubble engine` 자체 운영 방식과 RTM 대응형 방식의 비용/책임 분기점이 문서에서 완전히 닫혀 있지는 않다.

## Open Questions

- 신규 제품군 1개 추가 시 실제 투입 라벨링/재학습 공수는 얼마나 되는가
- ITM이 자체 업그레이드를 수행할 때 필요한 교육 범위와 운영 난이도는 어느 정도인가
- RTM 대응형 계약과 라이선스형 계약 중 어떤 모델이 실제로 채택되었는가

## Connected Evidence

- [[RTM_YNG_Project_Index_2026-04-21]]
- [[RTM_YNG_Drive_Discovery_2026-04-21]]
- [[RTM_YNG_Project_Knowledge_Base_2026-04-21]]
