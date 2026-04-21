---
type: l1_memory
project: PSK_Project
updated: 2026-04-21
---

# PSK 프로젝트 — L1 Memory Snapshot

## 한줄 요약
RTM의 가장 깊은 장기 고객 계정. 공동기술개발 계약 + EHM 납품 + PE Agent 제품화 + Precia 현장 적용이 동시에 진행 중. 워크스트림별 분리 관리 필요.

## 프로젝트 유형
장기 다중 워크스트림 고객 계정 (납품+운영+제품화 동시 진행)

## 워크스트림 요약
| 워크스트림 | 현재 상태 |
|---|---|
| 공동기술개발 계약 | 2024-12 기준 2억원 규모, 계약 항목 조정 중 |
| EHM 납품/운영 | PO No. 4500391911, 납기 2026-05-20, 버전/설치/export 이슈 관리 중 |
| PE Agent 제품화 | 서버 사양 확정, 사업계획서 수치 보강 중, Confluence PSK 공간 정리 |
| Precia Vision | Milestone 운영 중, threshold 일반화 한계가 핵심 리스크 |

## 핵심 수치
- 공동기술개발: 총 2억원 (1억 2024-09 발행 완료, 1억 연내 발행 필요)
- PSK 발주: 5천만원(VAT 별도) (2024-12)
- PE Agent 서버 예산: 29,000천원 × 2대 = 58,000천원
- 서버 최소 사양: GPU VRAM 32GB+, RAM 256GB+, SSD 4TB+
- 서버 단가: RAM 512GB 기준 17,000,000원 / RAM 256GB 기준 13,400,000원
- EHM 최신 발주: PO No. 4500391911, 수량 1ea, 납기 2026-05-20

## 운영 환경 (판교 CentOS 앱 포트)
- health-score-analysis `8511` / health-score-trend `8512` / within-lot-seq-analysis `8513`
- TS Offline App `8515` / LLTMPM `8517` / Overlay `8518`
- HS Dashboard Milano `8601` / HS Dashboard Ecolite `8602`

## 미해결 이슈 / 확인 필요
- 계약 항목별 금액 방어 논리 안정화 필요
- EHM export 이슈 대응 현황
- Precia 실사용 데이터 추가 확보 및 threshold 일반화 한계 해결 방향
- PEE팀 PE Agent 개발 방향과 RTM 개발 목표 정렬 상태

## 주의사항 (Gotchas)
- PSK 단일 프로젝트가 아님 — PSKH, PE Agent, Precia, EHM 납품이 각각 별개 흐름
- 주간회의 회의록 양식 개편 + 업무관리툴 전환 논의 병행 중
- Confluence PSK 공간이 공식 자료 공유 채널로 지정됨
- 숫자(서버 단가, 계약금액)는 항목별로 정합성 검증 필수

## 드릴다운
- [[Wiki/PSK_Project/hub]]
- [[Wiki/PSK_Project/KPI]]
- [[Wiki/PSK_Project/Evidence_Log]]
- [[Wiki/PSK_Project/EPI_Process]]
