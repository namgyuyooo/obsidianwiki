---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "RTM_YNG final pdf, pptx, and early HPP_final"
tags:
  - drive
  - project
  - rtm
  - hpp
---

# HPP

- [[Wiki/Common/RTM_YNG_HPP_Status]]

## Project Overview

- HPPK 4대 AI 도입을 통한 생산성 개선 프로젝트 추진 계획 및 기술 판단 보고서 성격을 갖는다.
- 핵심 과제는 `E-ring 누락`, `Doctor GAP 측정`, `Print 출력 검사`, `Printer 외관 검사`의 4대 라인업이다.
- 초기 `HPP_final`은 Doctor GAP 중심의 기술검토 의견보고서였고, 최종본으로 가면서 4대 과제를 포괄하는 프로그램형 제안으로 확장됐다.

## Performance

| 항목 | 기준 |
| --- | --- |
| Accuracy | `0.9487` |
| Precision | `0.9` |
| Recall | `1` |
| F1-score | `0.9474` |

## Operating Detail

- 대응 `pptx`에는 추진 마일스톤이 더 선명하다.
  - `2025.11.21` 초기 미팅
  - `2025.12.04` 현장 촬영/광학 검토
  - `2025.12.31` AI 파이프라인 개발
  - `2026.01.28` 2단계 완료
- 데이터 규모도 `pptx`에 더 많이 남아 있다.
  - 정상 제품 `90개`
  - 불량 시료 `15종`
  - 출력물 검사 `정상 21장 / 불량 18장`

## Roadmap / Value

- Quick Win
- Process Governance
- Quality Assurance
- ROI
- 단계별 제조 DX 확장

## Budget

| 항목 | 기준 |
| --- | --- |
| 후속 제안 예산 | `약 2.5억 원` |

## Milestones

| 시점 | 내용 |
| --- | --- |
| `2025.11.21` | 초기 미팅 |
| `2025.12.04` | 현장 촬영/광학 검토 |
| `2025.12.31` | AI 파이프라인 개발 |
| `2026.01.28` | 2단계 완료 |

## Document Status

- Primary:
  - `[RTM]HPP_PoC 결과 보고서_최종.pdf`
- Secondary:
  - `[RTM]HPP_PoC 결과 보고서_최종.pptx`
  - `[RTM] PoC 결과 보고HPP_final.pptx`

## Version Notes

- 초기 `HPP_final`은 Doctor GAP 자동화 가능성과 테스트 영상, 라벨링 데이터, ROI 체류시간 기반 판단 논리 같은 기술검토 성격이 강하다.
- 최종본으로 가면서 E-ring, GAP, 출력물 검사, 외관 검사를 포함한 4대 프로그램 제안으로 커졌다.
- PDF와 최종 `pptx`는 큰 수치가 일치하지만, `pptx`가 마일스톤과 데이터 수량을 더 많이 보존하고 있다.

## Risks

- 초기 `HPP_final`은 Doctor GAP 중심 `450`개 라벨링 데이터 기반 검토본이라, 최종 4대 과제 통합 보고서와 비교할 때 범위 차이를 성능 충돌로 오해할 수 있다.
- 평가셋과 데이터 수량은 버전별로 분리해서 다뤄야 한다.

## Open Questions

- `HPP_final` 외 추가 중간본이 더 있는가
- PDF 축약 과정에서 빠진 운영 리스크나 전제조건이 있는가
- 최종 예산 약 `2.5억`의 세부 구성은 어디까지 분해 가능한가

## Connected Evidence

- [[RTM_YNG_Project_Index_2026-04-21]]
- [[RTM_YNG_Project_Knowledge_Base_2026-04-21]]
- [[RTM_YNG_Sources_2026-04-21]]
- [[RTM_YNG_Evidence_Log_2026-04-21]]
- [[RTM_YNG_Change_Log_2026-04-21]]
- [[RTM_YNG_Conflict_Register_2026-04-21]]
