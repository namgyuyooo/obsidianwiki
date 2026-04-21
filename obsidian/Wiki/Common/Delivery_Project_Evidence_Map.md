---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
tags:
  - slack
  - evidence
  - delivery-project
---

# Delivery Project Evidence Map

계약, 발주, 납품, 검수 흐름이 파일로 남아 있는 납품형 프로젝트를 위한 증적맵이다. 이 맵은 수주 이후 실행 단계의 증적을 복원하는 데 초점을 둔다.

## 핵심 판별 기준

- `계약서`, `PO`, `Invoice`, `Acceptance Report` 중 2종 이상이 존재한다.
- 출장 보고, 설치/운영 로그, 납기 관련 메시지가 함께 보인다.
- 프로젝트 채널 또는 고객 전용 채널이 별도로 존재한다.

## Delivery Candidates

| 후보 | 대표 채널 | 핵심 파일 | 현재 판단 | 우선 읽을 증적 |
| --- | --- | --- | --- | --- |
| 서울세미콘 / SSC Vina | `#hubble-pjt-seoulsemicon`, `#tf_seoulsemicon-vina` | `[NDA] SSCvina.pdf`, `[계약서] Repair AI Xray_SSCvina.pdf`, `[PO] Repair AI Xray.pdf`, `[Invoice] Repair AI Xray.pdf`, `[Acceptance Report] Repair Xray.pdf` | 최우선 | 계약 체결, 발주, 인보이스, 검수, 출장 운영 |
| 화승 AI바우처 | `#pjt_화승_ai바우처` | `기능추가개발 견적서.pdf`, `검수확인서.pdf` | 높음 | 견적 확정, 기능 범위, 검수 완료 여부 |
| PSK / PSKH 일부 | `#psk-견적발주납품현황`, `#tf_psk-업무대응` | 견적서 PDF, 발주/납기 관련 파일 및 메시지 | 높음 | 발주번호, 납기일, 견적 변경 이력 |

## 증적 수집 순서

1. 계약서/PO/Invoice/Acceptance Report를 먼저 정리한다.
2. 같은 날짜 전후의 채널 메시지에서 납기, 수정 요청, 검수 결과를 연결한다.
3. 출장 보고나 운영 로그가 있으면 Change Log와 Risks로 분리한다.

## 권장 위키 페이지

- `[[Sources]]`
- `[[Evidence Log]]`
- `[[Decisions]]`
- `[[Change Log]]`
- `[[Risks]]`

## 리스크 포인트

- 최신 계약본과 실제 발주본이 다를 수 있다.
- Invoice와 Acceptance Report가 있어도 실제 범위 변경 이력은 메시지에만 남아 있을 수 있다.
- 납기일은 계약서 기준과 실무 일정이 다를 수 있어 Conflict Register가 필요하다.

## 연결 문서

- [[Wiki/Common/Evidence_Candidate_Map]]
- [[Wiki/Common/Project_Candidate_Register]]
