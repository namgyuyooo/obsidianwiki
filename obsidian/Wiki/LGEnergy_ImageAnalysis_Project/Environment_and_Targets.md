---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Environment and Targets

LG엔솔 이미지분석 프로젝트는 기술 자체보다 `성능 목표`와 `데이터/배포 제약`을 먼저 고정해야 하는 프로젝트다.

## 확인된 목표

- Li 석출 정량화는 `MAE 2% 이내`
- XRM 분석은 `정확도 95% 이상`
- CT 이미지 분석은 초안에서 `99.5% 이상`이 언급되지만, 후속 메시지에서는 `95%`로 조정 의견이 나온다.

## 확인된 제약

- AWS 사용 자체는 가능하다고 언급되지만, 고객 이미지가 AWS로 올라가는 것은 불가하다고 정리된다.
- 따라서 `클라우드 계산 자원 사용 가능`과 `고객 데이터 반출 가능`은 서로 다른 조건이다.
- Python, Docker, Message Queue 지원 여부도 구현 가능성에 직접 연결된다.

## 현재 단계 해석

- 채널 생성 메시지에서 `계약 절차 진행 중`, `계약 완료 후 kickoff`가 직접 언급된다.
- 즉 이 프로젝트는 단순 정보 수집이 아니라 계약 직전 요구사항 정렬 단계다.

## 연결 문서

- [[Wiki/LGEnergy_ImageAnalysis_Project/Project_Overview]]
- [[Wiki/LGEnergy_ImageAnalysis_Project/Evidence_Log]]
- [[Wiki/LGEnergy_ImageAnalysis_Project/Risks]]
- [[Wiki/LGEnergy_ImageAnalysis_Project/Conflict_Register]]
