---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# EHM Operations

PSK EHM 영역은 제품 설치 자체보다 `버전 명시`, `patch`, `export`, `납기`, `운영 안정성`이 핵심이다.

## 핵심 사실

- 2024년 12월 메시지에서 `Export 버전 패치 완료`, `PSK 요청사항 처리`가 함께 언급된다.
- 이는 2024년 말 이미 현장 운영 이슈가 기능 개발보다 패치/수정 중심으로 전환됐음을 의미한다.
- 2026년 4월에는 `PO No. 4500391911`, `수량 1ea`, `납기일 2026-05-20`이 직접 확인된다.

## 운영 원칙

- 내부 결정 메모에서는 EHM 납품 시 소프트웨어 버전 명시가 필요하다는 운영 원칙이 형성된다.
- 이 원칙은 현장 설치 이후 “무슨 버전이 들어갔는지”가 불분명해지는 리스크를 막기 위한 것으로 해석된다.
- 기존 위험 정리에서도 export 기능 관련 서버 다운, heap space 문제, 버전 명시 누락 리스크가 함께 언급된다.

## 위키 해석

- EHM은 단순 납품 항목이 아니라 설치 후 운영 리스크가 큰 workstream이다.
- 따라서 실제 위키에서는 `발주/납기`와 `패치/운영 이슈`를 한 문서에 섞기보다 분리하는 편이 좋다.
- 현 단계에서는 발주 근거는 확보됐고, 다음 심화 포인트는 `실제 납품 버전`, `export 이슈 재발 여부`, `현장 메모리 이슈`다.

## 연결 문서

- [[Wiki/PSK_Project/Project_Overview]]
- [[Wiki/PSK_Project/Contract_and_Commercial]]
- [[Wiki/PSK_Project/Risks]]
- [[Wiki/PSK_Project/Action_Items]]
