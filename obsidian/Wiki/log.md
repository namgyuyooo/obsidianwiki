---
type: log
created: 2026-04-21
updated: 2026-04-21
source: "Global wiki operations log"
---

# Wiki Log

이 파일은 위키 운영의 append-only 로그입니다.

## [2026-04-21] ingest | RTM_YNG L1_memory 14개 생성 + Drive 증적 완료

- 작업 범위: RTM_YNG Drive 소스(PDF/HWP/HWPX) 증적 추출 완료 + L1_memory 파일 14개 신규 생성
- Evidence Log 수록 프로젝트 (11개): 산업현장 에이전트(RS-2026-25553046, 65.9억), 탈레스(충돌), 서울반도체(100/143백만), 케타포(K-POP 멀티에이전트), 경동나비엔(167백만 견적), HPP(Acc 0.9487), ZEUS_POC(적용불가), 반도체공정제어(RS-2026-25523818), 화승(430백만), 제우스·픽셀(450+308백만), 한양대(CY260116, 57억)
- 생성된 L1_memory 파일 (14개):
  - `RTM_YNG_산업현장_에이전트_연구개발.md`
  - `RTM_YNG_탈레스_Trust_my_Tech.md`
  - `RTM_YNG_서울반도체.md`
  - `RTM_YNG_케타포_AI바우처.md`
  - `RTM_YNG_경동나비엔.md`
  - `RTM_YNG_HPP.md`
  - `RTM_YNG_ZEUS_POC.md`
  - `RTM_YNG_반도체_공정제어_멀티에이전트.md`
  - `RTM_YNG_화승_AI바우처.md`
  - `RTM_YNG_제우스_픽셀_AI바우처.md`
  - `RTM_YNG_한양대_반도체_자율지능형_에이전트.md`
  - `RTM_YNG_아사히카세이.md`
  - `RTM_YNG_ITM_반도체.md`
  - `RTM_YNG_DMT_POC.md`
- 충돌 등록: 탈레스 vf(20446514/100/143백만) vs 인건비제외(20286906/192/275백만)
- index.md에 RTM_YNG 프로젝트 위키 섹션 추가
- 후속 작업: RTM_YNG 위키 페이지 보강 (KPI 표, 비교본 diff, 리스크 표)

## [2026-04-21] structure | L1 memory layer 전체 생성

- 작업 범위: 전체 19개 프로젝트 L1_memory 스냅샷 초안 생성 + R&D 프로젝트 위키 연결 + AGENTS.md L1_memory 워크플로우 추가
- 생성된 L1 memory 파일 (20개):
  - `L1_memory/AdvancedElectricKorea_Project.md`
  - `L1_memory/BGF_EcoSpecialty_Project.md`
  - `L1_memory/Business_Plan_Project.md`
  - `L1_memory/Daeduck_AFVI_Project.md`
  - `L1_memory/DaehanCable_ProcessInnovation_Project.md`
  - `L1_memory/EPI_Project.md`
  - `L1_memory/HsAIVoucher_Project.md`
  - `L1_memory/HyundaiMobis_Project.md`
  - `L1_memory/KoreaAlbac_Project.md`
  - `L1_memory/KumhoTire_CMS_Project.md`
  - `L1_memory/KumhoTire_FirstProduct_Xray_Project.md`
  - `L1_memory/LGEnergy_ImageAnalysis_Project.md`
  - `L1_memory/Mecaro_Forecast_Project.md`
  - `L1_memory/Nanotech_RnD_Project.md`
  - `L1_memory/PSK_Project.md`
  - `L1_memory/Pixel_AIVoucher_Project.md`
  - `L1_memory/SanupAI_RnD_Project.md`
  - `L1_memory/SeoulBiosys_Project.md`
  - `L1_memory/SeoulSemicon_Project.md`
  - `L1_memory/ZEUS_AIVoucher_Project.md`
- 신규 위키 스페이스: `Wiki/SanupAI_RnD_Project/` (소스 폴더 현재 비어 있음, 문서 추가 대기)
- `AGENTS.md` 업데이트: L1 Memory Workflow 섹션 추가 (생성/갱신/사용 규칙 포함)
- `Wiki/index.md` 업데이트: L1 Memory Layer 섹션 추가, SanupAI_RnD_Project 허브 링크 추가
- 소스: 각 프로젝트 Project_Overview.md + hub.md 기반으로 초안 작성
- 후속 작업: 인제스트 또는 주요 결정 발생 시마다 해당 L1_memory 파일 갱신 필요

## [2026-04-21] structure | global wiki scaffolding

- Added global navigation file: [[Wiki/index]]
- Added global chronological log: [[Wiki/log]]
- Added raw source layer guidance under `obsidian/raw/README.md`
- Added `AGENTS.md` to make the Codex workflow explicit for ingest, query, and lint tasks
- Updated [[Wiki/Schema]] to recognize the raw/wiki/schema layering and the required global files

## Logging Convention

- 제목 형식: `## [YYYY-MM-DD] operation | short label`
- operation 예시: `ingest`, `query`, `lint`, `structure`
- 각 항목에는 변경 문서, 핵심 영향, 후속 작업을 짧게 남깁니다.
