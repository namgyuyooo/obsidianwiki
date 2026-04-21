---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "RTM_YNG proposal pdf and pre-poc evidence"
tags:
  - drive
  - project
  - rtm
  - kyungdong-navien
---

# 경동나비엔 RTM

## Project Overview

- 대표본은 경동나비엔 대상 AI 솔루션 제안서이며, 볼트 및 클립 누락 검사 과제를 핵심 범위로 다룬다.
- 문서는 RTM 회사 소개, Manufacturing AI 역량, 기존 고객 사례를 함께 넣은 영업형 제안서 구조다.
- 선행 `Pre-PoC`에서는 체결 로봇 동작시간 기반 이상탐지 가능성을 먼저 검토했고, 이후 비전 기반 검사와 구축안 제안으로 범위가 확장됐다.

## Performance

| 단계 | 기준 |
| --- | --- |
| 1차 POC | `11개 검사포인트`, `1,642장 이미지`, `정확도 100%` |
| 2차 POC | `176개 포인트`, `탐지 성능 97.2%` |

## Technical Scope

- AWS Lookout for Vision 기반 운영을 RTM 학습/추론 솔루션으로 대체 또는 전환
- ROI 자동 지정
- 제품별 검사영역 설정
- PLC 연동
- 사내 추론서버 활용
- 신규 고정식 광학 시스템 도입

## Budget

| 항목 | 기준 |
| --- | --- |
| 1라인 총 견적 | `167,100,000원` |
| 솔루션 라이선스 | `25,000,000원` |
| 개발 | `112,100,000원` |
| HW | `30,000,000원` |
| 라인 확장안 | `150,000,000원` |

## Stage Snapshot

| 단계 | 중심 내용 |
| --- | --- |
| `Pre-PoC` | 체결 로봇 동작시간 기반 이상탐지 가능성 검토 |
| 1차 POC | 검사포인트 `11개`, 이미지 `1,642장`, 정확도 `100%` |
| 2차 POC / 제안 | 검사포인트 `176개`, 탐지 성능 `97.2%`, 구축안/견적 포함 |

## Document Status

- Primary:
  - `250423_경동나비엔-RTM 과제 제안서 2차_04.pdf`
- Secondary:
  - `2025_경동나비엔_MCSC 과제 Pre-PoC결과 및 요구사항 논의_250205.pdf`
  - `250924_경동나비엔-RTM poc 제안서_00.pptx`
- Hold:
  - `11개 검사포인트 설명.png`
  - `자료설명.txt`

## Version Notes

- `Pre-PoC` 단계에서는 체결 로봇 동작시간 데이터를 이용한 이상탐지 모델 가능성 검토가 중심이었다.
- `2차 제안서`로 가면서 검사 포인트, 정확도, 구축 범위, PLC 연동, 광학 시스템, 견적 구조까지 포함한 비전 기반 제안으로 확장됐다.
- 후속 `poc 제안서_00.pptx`는 고객 대응 과정에서 범위나 패키징이 다시 조정됐을 가능성이 있다.

## Risks

- `Pre-PoC`, 1차 POC, 2차 POC는 평가 대상과 데이터셋이 달라 성능을 같은 축으로 비교하면 안 된다.
- `png`, `txt`, 후속 `poc 제안서_00.pptx`를 열어 검사 포인트 정의와 ROI 규칙을 더 세분화할 필요가 있다.

## Open Questions

- 1차 POC와 2차 POC의 정확도 비교 기준은 동일한가
- 1라인 구축안과 라인 확장안은 어떤 구성 차이로 갈리는가
- 후속 `poc 제안서_00.pptx`에서 가격 또는 범위가 달라졌는가

## Connected Evidence

- [[RTM_YNG_Project_Index_2026-04-21]]
- [[RTM_YNG_Project_Knowledge_Base_2026-04-21]]
- [[RTM_YNG_Sources_2026-04-21]]
- [[RTM_YNG_Evidence_Log_2026-04-21]]
- [[RTM_YNG_Change_Log_2026-04-21]]
- [[RTM_YNG_Conflict_Register_2026-04-21]]
