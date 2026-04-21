---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
tags:
  - slack
  - evidence
  - operations-project
---

# Operations Project Evidence Map

회의록, KPI, 공수, 로드맵, 리스크가 장기간 누적되는 운영형 프로젝트를 위한 증적맵이다. 단발성 제안보다 지속 운영과 단계별 변경 추적이 중요할 때 사용한다.

## 핵심 판별 기준

- `회의록`, `KPI`, `공수`, `로드맵`, `리스크`가 반복적으로 등장한다.
- 다수 채널이 하나의 고객/프로젝트 아래 연결된다.
- 결정사항과 변경사항이 시간축으로 누적된다.

## Operations Candidates

| 후보 | 대표 채널 | 핵심 파일 | 현재 판단 | 우선 읽을 증적 |
| --- | --- | --- | --- | --- |
| PSK / PSKH | `#tf_psk-업무대응`, `#pjt_psk_pe-agent`, `#pjt_psk_precia`, `#psk-견적발주납품현황`, `#pjt_pskh` | `PSK MI-RTM 주간회의록`, `PE Agent 질문 리스트_허정회신.xlsx`, `공수 산정.xlsx`, `Roadmap.pdf`, 계약/발주 파일 | 최우선 | 회의록, KPI, 공수, 계약, threshold 리스크, 데모 구조 |

## 증적 수집 순서

1. 회의록과 KPI 파일을 먼저 읽어 시간축을 만든다.
2. 공수 산정, 로드맵, 예산 파일로 수치 근거를 연결한다.
3. 리스크/충돌 항목은 채널별로 분산되지 않게 Conflict Register에 모은다.

## 권장 위키 페이지

- `[[Project Overview]]`
- `[[KPI]]`
- `[[Sources]]`
- `[[Evidence Log]]`
- `[[Decisions]]`
- `[[Risks]]`
- `[[Change Log]]`
- `[[Conflict Register]]`
- `[[Action Items]]`

## 리스크 포인트

- 장기 운영 프로젝트는 같은 항목이 여러 채널과 여러 파일에 반복되어 최신본 판별이 어렵다.
- 계약 수치, KPI 수치, 현장 리스크가 서로 다른 시점 문서에 나뉘어 남을 수 있다.
- 운영형 프로젝트는 공통 지식과 프로젝트 고유 지식이 섞이므로 Common 승격 후보를 분리해야 한다.

## 연결 문서

- [[Wiki/Common/Evidence_Candidate_Map]]
- [[Wiki/Common/Project_Candidate_Register]]
- [[Wiki/PSK_Project/hub]]
