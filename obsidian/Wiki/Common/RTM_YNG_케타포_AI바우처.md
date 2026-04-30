---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "RTM_YNG primary and secondary pdf comparison"
tags:
  - drive
  - project
  - rtm
  - ketapo
---

# 케타포 AI바우처

- [[Wiki/Common/RTM_YNG_케타포_AI바우처_Reference_Register]]

- [[Wiki/Common/RTM_YNG_케타포_AI바우처_Status]]

## Project Overview

- 주관기관은 `㈜케이타운포유`, 참여기관은 `㈜알티엠`이다.
- 수행기간은 `2026년 5월 ~ 2026년 11월 30일`이다.
- 과제는 글로벌 K-POP 팬덤 커머스의 발주, CS, 물류 운영 최적화를 위한 멀티에이전트 개발로 정리된다.

## Solution Structure

- 발주 예측 에이전트
- CS 자동화 액션 에이전트
- 패킹 알고리즘 에이전트
- 커머스 모니터링 에이전트
- 중앙 오케스트레이터

## KPI

| 항목 | 대표본 기준 |
| --- | --- |
| 수요예측 오차 | `P80 APE <= 20%` |

## Version Snapshot

| 버전 | 상태 | 현재 판단 |
| --- | --- | --- |
| `0.3` | 초안 | 템플릿 흔적이 많고 front matter 완결성이 약함 |
| `0.5` | 중간본 | 구조와 메타정보 정리 |
| `최종취합` | 대표본 | 주관/참여기관, 기간, KPI, 기대성과가 가장 완결적 |

## Value Structure

- 매출, 수출, 응답 대기시간 단축, CS 반복문의 자동화 비율이 기대성과 축으로 제시된다.
- PoC 기반으로 `CS FAQ 봇`, `발주 예측 모델`, `빈패킹 회귀 모델`을 거쳐 장기적으로 자율 CS/자율 발주/강화학습 기반 빈패킹으로 확장하는 로드맵이 있다.

## Document Status

- Primary:
  - `AI바우처_사업계획서(26)_케타포_최종취합.pdf`
- Secondary:
  - `AI바우처_사업계획서(26)_케타포_0.3.pdf`
  - `AI바우처_사업계획서(26)_케타포_0.5_한세민팀장님공유용.pdf`

## Version Notes

- `0.3 -> 0.5 -> 최종취합` 흐름이 명확하다.
- `0.3`은 템플릿 흔적과 초안성이 강하다.
- `0.5`는 구조와 메타정보가 정리된 중간본이다.
- `최종취합`은 주관/참여기관, 수행기간, 멀티에이전트 구조, KPI, 기대성과가 가장 완결적으로 제시된 대표본이다.

## Risks

- `0.3`은 초안성이 강해 기준본으로 쓰기 어렵다.
- `0.5`와 `최종취합`은 방향은 같지만 기대성과와 KPI 요약부 표현이 다듬어졌을 가능성이 있어, 숫자 표는 계속 비교가 필요하다.

## Open Questions

- `71.6%` FAQ 자동응답 해결 수치가 최종 KPI 표에 어떤 형태로 반영됐는가
- 예산/기대성과 수치가 `0.5`에서 최종취합으로 가며 얼마나 조정됐는가
- 발주/CS/포장 3개 축 중 실제 우선 도입 범위는 어디까지인가

## Connected Evidence

- [[RTM_YNG_Project_Index_2026-04-21]]
- [[RTM_YNG_Project_Knowledge_Base_2026-04-21]]
- [[RTM_YNG_Sources_2026-04-21]]
- [[RTM_YNG_Evidence_Log_2026-04-21]]
- [[RTM_YNG_Change_Log_2026-04-21]]
- [[RTM_YNG_Conflict_Register_2026-04-21]]
