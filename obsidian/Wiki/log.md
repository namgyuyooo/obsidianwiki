---
type: log
created: 2026-04-21
updated: 2026-04-29
source: "Global wiki operations log"
---

# Wiki Log

이 파일은 위키 운영의 append-only 로그입니다.

## 2026-04-29
- [[Wiki/Common/Search_Evidence_Deletion_Registry]]: 사용자 요청에 따른 검색 증적 삭제 실제 근거 링크와 프로젝트 연결 레지스트리 생성
- PSK_Project/hub.md, RTM_YNG_Project_Index_2026-04-21.md: 검색 증적 삭제 레지스트리 링크 추가
- Wiki/index.md: 검색 증적 삭제 레지스트리를 공통 지식 섹션에 등록

## [2026-04-29] structure | Drive batch wikify operating layer for GLM and 오픈클로

- 작업 범위: 구글 드라이브 전수 위키화를 과부하 없이 이어가기 위한 배치형 운영 문서와 상태 추적 문서 추가
- 생성 문서:
  - `Common/Drive_Wikify_Batch_Operating_Model.md`
  - `Common/Drive_Wikify_Coverage_Tracker.md`
  - `Common/Drive_Wikify_Model_Prompt_Set.md`
- 갱신 문서:
  - `Common/hub.md`
  - `index.md`
  - `log.md`
- 핵심 판단:
  - Drive 조회와 모델 해석을 분리하고, 모델은 `GLM` 분류기와 `오픈클로` 원문 추출기로 나눠 쓴다.
  - 전수 탐색은 `Shared Drive -> 폴더 큐 -> 대표본 선별 -> 위키 반영`의 작은 배치로만 진행한다.
  - 중간 실패나 quota 이후에도 이어갈 수 있도록 `Coverage_Tracker`를 공용 커서 문서로 사용한다.

## [2026-04-29] structure | Drive wikify closed-loop automation design

- 작업 범위: `수집 -> 위키화 -> 로그 -> 충돌/규칙 검수 -> 재구조화 -> 대기 -> 재수집` 루프를 자동화하기 위한 상태 머신 정의
- 생성 문서:
  - `Common/Drive_Wikify_Automation_Loop.md`
- 갱신 문서:
  - `Common/Drive_Wikify_Batch_Operating_Model.md`
  - `Common/Drive_Wikify_Model_Prompt_Set.md`
  - `Common/hub.md`
  - `index.md`
  - `log.md`
- 핵심 판단:
  - `오픈클로`는 전수 수집기보다 오케스트레이터에 가깝게 쓰는 편이 안정적이다.
  - `GLM`은 메타데이터 triage, `오픈클로`는 Evidence/Conflict 추출, 검수 단계는 별도 게이트로 분리한다.
  - 자동화는 큐 문서와 append-only 로그를 기준으로 재개 가능해야 한다.

## [2026-04-29] ingest | Drive batch test on 2026년도 전자부품산업기술개발

- 작업 범위: `2026년도 전자부품산업기술개발` Shared Drive에 대해 실제 소배치 테스트 수행
- 확인한 경로:
  - Drive 루트
  - `0. 최종_제출서류`
  - `1. 알티엠`
  - 루트 총괄 스프레드시트 `2026년도 전자부품산업기술개발`
- 갱신 문서:
  - `Common/Drive_Wikify_Coverage_Tracker.md`
  - `Common/RTM_GovRnD_2026_PSK_디지털혁신중견기업육성사업.md`
  - `log.md`
- 실제 확인 결과:
  - 루트에서 `0. 최종_제출서류`, `2. 회의록`, `1. 지원`, 운영 스프레드시트 2건을 확인
  - `0. 최종_제출서류` 아래에서 `1. 알티엠`, `2. S2W`, `3. ETRI`, `4. 성균관대학교`, `1. (필수)연구개발계획서`를 확인
  - 총괄 스프레드시트 fetch 결과 참여기관, 연락처, 문서 작성 분담표, 제출서류 체크리스트, 역할/범위 메모, 예산표가 한 파일에 혼재함을 확인
  - 예산 총액은 `5,253,730`으로 읽히는 블록과 `5,247,139 / 5,237,139`로 읽히는 블록이 함께 보여 상충 후보로 보류
- 후속 작업:
  - 기관별 실제 계획서 원문 또는 통합본 fetch
  - 총액 상충 여부 재검증
  - 이 폴더를 `운영 허브 + 제출 패키지` 복합 구조로 재분류할지 판단

## [2026-04-29] structure | Separate automation workspace from wiki content

- 작업 범위: Drive 위키화 자동화 코드를 위키 본문 계층과 분리하기 위한 작업공간 스캐폴딩 추가
- 생성 경로:
  - `automation/README.md`
  - `automation/drive_wikify/README.md`
  - `automation/drive_wikify/config/pipeline.example.yaml`
  - `automation/drive_wikify/runtime/README.md`
  - `automation/drive_wikify/src/README.md`
- 갱신 문서:
  - `Common/Drive_Wikify_Automation_Loop.md`
  - `Common/Drive_Wikify_Batch_Operating_Model.md`
  - `log.md`
- 핵심 판단:
  - `obsidian/Wiki/`는 지식/근거/기록 계층으로 유지한다.
  - 실제 실행 코드는 `automation/drive_wikify/` 아래에만 둔다.
  - 위키 문서는 코드가 아니라 자동화의 설계서와 실행 결과 저장소 역할을 맡는다.

## [2026-04-29] structure | Multi-format extraction and project branching rules

- 작업 범위: 자동화 파이프라인에 `rhwp`, `pdf`, `docx`, `pptx` 추출 의무와 신규 프로젝트/프로젝트 분기 판단 규칙 반영
- 갱신 문서:
  - `Common/Drive_Wikify_Batch_Operating_Model.md`
  - `Common/Drive_Wikify_Automation_Loop.md`
  - `automation/drive_wikify/config/pipeline.example.yaml`
  - `automation/drive_wikify/src/README.md`
  - `log.md`
- 핵심 판단:
  - 파일 존재 기록만으로는 충분하지 않고, `hwp/hwpx/pdf/docx/pptx` 모두 실제 본문 추출 대상이어야 한다.
  - 프로젝트로 정의될 수 있는 문서군이면 신규 프로젝트 위키 생성까지 자동화 범위에 포함한다.
  - 중복 또는 유사 내용은 자동 병합하지 않고 `동일 프로젝트 업데이트`와 `별도 프로젝트 분기`를 먼저 판정해야 한다.

## [2026-04-29] structure | Resume-friendly batching and chunked LLM processing

- 작업 범위: Drive rate limit 대응을 위해 `재개 가능한 배치 처리`와 `청크 -> 파일 -> 프로젝트` 승격 규칙 반영
- 갱신 문서:
  - `Common/Drive_Wikify_Batch_Operating_Model.md`
  - `Common/Drive_Wikify_Automation_Loop.md`
  - `automation/drive_wikify/config/pipeline.example.yaml`
  - `automation/drive_wikify/README.md`
  - `log.md`
- 핵심 판단:
  - Google Drive rate limit 환경에서는 빠른 완료보다 중단 후 재개 가능한 배치 설계가 더 중요하다.
  - LLM 입력은 1배치 20~50개 파일, 1파일 8,000~15,000자 청크 기준으로 자르고 `청크 요약 -> 파일 요약 -> 프로젝트 위키 반영`으로 승격한다.

## [2026-04-27] structure | RTM government RnD folder-wide wiki layer

- 작업 범위: 국책과제/바우처/조상 아카이브 폴더를 폴더 단위로 전수 위키화하는 상위 구조와 폴더 위키 생성
- 생성 문서:
  - `Common/RTM_Government_RnD_Folder_Index.md`
  - `Common/RTM_Government_RnD_Folder_Candidate_Register.md`
  - `Common/RTM_Government_RnD_Folder_Coverage_Tracker.md`
  - `Common/RTM_GovRnD_2026_산업현장_에이전트_연구개발.md`
  - `Common/RTM_GovRnD_2026_AI_응용제품_신속_상용화.md`
  - `Common/RTM_GovRnD_2026_TMT2차.md`
  - `Common/RTM_GovRnD_2026_대학연스타트업_한양대.md`
  - `Common/RTM_GovRnD_2026_AI바우처.md`
  - `Common/RTM_GovRnD_2026_PSK_디지털혁신중견기업육성사업.md`
  - `Common/RTM_GovRnD_2026_인공지능_기술사업화_지원사업.md`
  - `Common/RTM_GovRnD_2025_자율제조_AI_Agent.md`
  - `Common/RTM_GovRnD_2026_xaas.md`
  - `Common/RTM_GovRnD_2026_뿌리산업.md`
  - `Common/RTM_GovRnD_2026_바이오시스_상생혁신.md`
  - `Common/RTM_GovRnD_2022_AI바우처_2022.md`
  - `Common/RTM_GovRnD_2022_엔업.md`
  - `Common/RTM_GovRnD_2021_산업디지털_전환_연대공급기업.md`
  - `Common/RTM_GovRnD_2021_스마트공장_고도화2.md`
- 갱신 문서:
  - `Common/Government_RnD_Reusable_Wiki_Hub.md`
  - `Common/hub.md`
  - `index.md`
  - `Common/RTM_YNG_Project_Index_2026-04-21.md`
  - `log.md`
- 핵심 판단:
  - 기존 개별 과제 페이지는 유지하고, 새 폴더 위키를 상위 컨테이너로 둔다.
  - 대표본이 약한 폴더도 삭제하지 않고 `현재 미확인` 상태로 보존한다.

## [2026-04-27] ingest | Final-body style asset expansion from PSK XaaS and technology-commercialization finals

- 작업 범위: `PSK`, `XaaS`, `기술사업화/상생형` 최종본 계열을 반영해 정부과제 문체/표현 자산 보강
- 갱신 문서:
  - `Common/Government_RnD_HWP_Expression_Bank.md`
  - `Common/Government_RnD_Writing_Style_Guide.md`
- 반영한 최종본/대표 근거:
  - `1. 연구개발계획서_통합.hwpx/pdf` (PSK 계열)
  - `1. 사업수행계획서_최종.hwp` (XaaS 계열)
  - `2026년 인공지능 기술사업화 지원사업 연구개발계획서_통합_0310.pdf`
  - `1-1. (설반)연구개발계획서_(최종)통합본.hwp`
- 추가된 핵심 자산:
  - `실시간 운영 및 유지보수 에이전트`
  - `사업수행계획서형` 문체
  - `라인 단위 On-Prem 공급 + 연간 갱신/유지보수`
  - `Fab 테스트베드`, `현장 베타테스트`, `도메인 문서 10만 건 이상`

## [2026-04-27] structure | RTM government RnD appeal bank and reference bank

- 작업 범위: 알티엠 정부과제용 회사 어필 포인트와 고객/성과 레퍼런스 자산을 공통 문서로 분리 생성
- 생성 문서:
  - `Common/RTM_Government_RnD_Appeal_Bank.md`
  - `Common/RTM_Government_RnD_Reference_Bank.md`
- 주요 근거:
  - `Common/RTM_YNG_Company_Profile_2026-04-21.md`
  - `글로벌기업협업프로그램_TrustMyTech_알티엠_최종.pptx`
  - `RTM_회사소개서_품질검사_0609.pdf`
  - `industrial_agent_final.hwp`
  - `seoul_final.hwp`
  - `pixel_final.hwpx`
  - `zeus_final_sales.hwpx`
- 갱신 문서:
  - `Common/Government_RnD_Reusable_Wiki_Hub.md`
  - `Common/hub.md`
  - `index.md`
  - `log.md`
- 후속 작업:
  - `PSK`, `LG에너지솔루션`, `플루오린코리아` 계열의 정량 KPI와 과제명 보강
  - 신규 HWP/HWPX에서 고객별 유사실적 문장을 더 직접 승격

## [2026-04-27] structure | Government RnD reusable wiki asset set

- 작업 범위: 정부 R&D 과제 재활용을 위한 공통 문장 자산, 역할 서술 규칙, 자료 체크리스트, 위키 운영 가이드 신규 생성
- 생성 문서:
  - `Common/Government_RnD_Reusable_Wiki_Hub.md`
  - `Common/Government_RnD_Writing_Style_Guide.md`
  - `Common/Government_RnD_HWP_Expression_Bank.md`
  - `Common/Government_RnD_Participant_Role_Guide.md`
  - `Common/Government_RnD_Source_Checklist.md`
  - `Common/Government_RnD_Wiki_Operating_Guide.md`
  - `Common/Government_RnD_Project_Starter_Template.md`
  - `Common/Government_RnD_Prompt_Set.md`
  - `Common/Government_RnD_Section_Skeletons.md`
- 근거 대표본:
  - `산업현장 에이전트_연구개발계획서_RS-2026-25553046(알티엠).pdf`
  - `(서식01) 연구개발계획서(양식)_산업현장문제해결형산업AI에이전트기술개발(R&D).pdf`
  - `1. 사업계획서(도입_서울반도체).pdf`
  - `(kr)별첨1-9. (탈레스) Trust my Tech 프로그램 사업계획서_vf.pdf`
- 갱신 문서:
  - `Common/hub.md`
  - `index.md`
  - `log.md`
  - `Business_Plan_Project/hub.md`
  - `L1_memory/Business_Plan_Project.md`
- 후속 작업:
  - 신규 정부과제 인제스트 시 프로젝트별 Evidence Log에서 문장 자산을 추가 승격
  - HWP/HWPX 대표본이 더 확보되면 항목별 표현 예시 확장

## [2026-04-27] ingest | Government RnD drive source map from 5.국책과제

- 작업 범위: `5.국책과제` Drive 폴더 구조 확인 및 정부과제 공통 소스 풀 맵 작성
- 신규 문서:
  - `Common/Government_RnD_Drive_Source_Map_2026-04-27.md`
- 확인한 상위 묶음:
  - `산업현장 에이전트_연구개발`
  - `(중기) AI 응용제품 신속 상용화 지원사업`
  - `TMT2차`
  - `2026년 대학연스타트업 과제_한양대`
  - `2026년도 전자부품산업기술개발`
  - `AI바우처`
- 핵심 판단:
  - 이 폴더는 정부과제 재활용용 공통 소스 풀로 사용할 가치가 높음
  - `공고/양식 -> 작성중 분절본 -> 취합본 -> 최종본 -> 제출서류` 흐름이 반복 확인됨
  - `hwp/hwpx`가 실제 항목 표현 보존에 가장 유리함

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

## [2026-04-27] ingest | local final-body extraction for government RnD style assets

- 로컬 동기화 Google Drive 경로에서 `산업현장 에이전트_연구개발계획서_RS-2026-25553046(알티엠).pdf`와 `PSK 작업중_v9.hwpx`를 직접 확인함.
- `Government_RnD_HWP_Expression_Bank`에 운영형 최종본 문구, 오케스트레이션형 표현, 대체 실증 경로, 4M/온톨로지/온디바이스 계열 문장 자산을 추가함.
- `Government_RnD_Writing_Style_Guide`에 로컬 직접 추출 기반 관찰, 문장 연결 습관, 역할 중심 목표 서술, 대비형 부정 문장 패턴을 추가함.
- 후속 작업: `XaaS`, `설반`, `기술사업화` 최종본도 로컬 동기화본이 확보되면 같은 방식으로 직접 추출해 문장 예시를 더 누적할 것.

## [2026-04-27] ingest | local final-body extraction for service and commercialization variants

- 로컬 동기화 Google Drive 경로에서 `사업계획서_서울반도체.hwpx`, `2026년 인공지능 기술사업화 지원사업 연구개발계획서_통합_0310.pdf`, `AI바우처_사업계획서(26)_케타포_최종취합.hwpx`를 직접 확인함.
- `Government_RnD_HWP_Expression_Bank`에 `설반 상용화형`, `기술사업화 공급형`, `XaaS/AI바우처 오케스트레이션형` 표현군과 문장 자산을 추가함.
- `Government_RnD_Writing_Style_Guide`에 `AS-IS/TO-BE 비교형`, `폐쇄망 RAG 업데이트형`, `중앙 오케스트레이터 기반 서비스형` 서술 패턴과 사업화/운영 KPI 닫힘 문장을 추가함.

## [2026-04-27] ingest | RTM section-ready paragraph samples

- `RTM_Government_RnD_Appeal_Bank`에 `연구개발 필요성`, `수행기관 역량`, `개발 내용 및 수행방법`, `수행기관-수요기업 역할`, `사업화 및 확산`, `기대효과`용 실전 문단 샘플을 추가함.
- 로컬 직접 추출로 정리한 `운영형`, `상용화형`, `공급형`, `오케스트레이션형` 문장 습관을 알티엠 고유 포트폴리오와 결합해 바로 붙여넣기 가능한 수준으로 정리함.

## [2026-04-27] structure | RTM government RnD complete draft template

- `RTM_Government_RnD_Complete_Template`를 신규 생성하고, `목차별 완성본 초안`, `교체 슬롯`, `문서 유형별 분기`, `최종 점검 체크리스트`를 한 문서로 정리함.
- `Government_RnD_Reusable_Wiki_Hub`, `Common/hub`, `index.md`에 새 템플릿 링크를 추가해 정부과제 공통 자산에서 바로 진입 가능하게 연결함.

## [2026-04-27] structure | Trust my Tech validation worksheet

- `RTM_YNG_탈레스_Trust_my_Tech_Validation_2026-04-27`를 생성해 `Trust my Tech 2차`를 정부과제 템플릿 재현력 검증용 기준 케이스로 정리함.
- 대표본, 비교본, 충돌값, 재생성 비교축, 통과/실패 판정 기준을 한 문서로 묶고 기존 `RTM_YNG_탈레스_Trust_my_Tech` 페이지에서 바로 연결되게 링크를 추가함.

## [2026-04-27] ingest | Trust my Tech regenerated draft and comparison

- `RTM_YNG_탈레스_Trust_my_Tech_Regenerated_Draft_2026-04-27`를 생성해 `vf` 대표본 기준 템플릿 재생성 초안을 작성함.
- `RTM_YNG_탈레스_Trust_my_Tech_Regeneration_Comparison_2026-04-27`를 생성해 원본 대표본과 재생성본의 재현 정도, 누락 요소, 템플릿 보완 포인트를 비교 정리함.
- 기존 `RTM_YNG_탈레스_Trust_my_Tech` 및 검증 워크시트에서 새 산출물로 바로 이동 가능하게 링크를 추가함.

## [2026-04-27] ingest | Trust my Tech body-style draft

- `RTM_YNG_탈레스_Trust_my_Tech_Body_Draft_2026-04-27`를 생성해 `사업 개요 -> 필요성 -> 목표 -> 개발내용 -> 역량 -> 역할 -> 실증 -> 사업화 -> 기대효과` 흐름의 본문형 초안을 작성함.
- 검증 워크시트와 기존 프로젝트 페이지에서 본문 초안으로 바로 이동 가능하게 링크를 추가하고, 충돌 중인 과제번호/예산은 본문 하단 메모로 분리 유지함.

## [2026-04-27] structure | Trust my Tech submission-grade assembly draft

- `RTM_YNG_탈레스_Trust_my_Tech_Submission_Draft_2026-04-27`를 생성해 `공고/지원내용/vf 대표본`을 바탕으로 한 제출형 조립 규칙을 추가함.
- 단락별 목표 분량, 표/이미지 슬롯, 외부자료 각주 규칙, 실전 조립 순서, 누락 방지 메모를 정리함.
- 기존 `Trust my Tech` 프로젝트 페이지에서 새 제출형 초안으로 바로 진입할 수 있도록 링크를 추가함.
- 로컬 드라이브 경로에서 `붙임1 공고`, `붙임2 지원내용`, `vf 대표본 pdf`를 직접 읽어 `15페이지 이내`, `PDF 제출`, `국문/영문 동시 제출`, `평균 1억원 내외`, `탈레스 플랫폼/코칭/PoC/MVP/네트워킹 지원` 규정을 제출형 초안에 반영함.

## [2026-04-27] ingest | Trust my Tech submission-ready body draft

- `RTM_YNG_탈레스_Trust_my_Tech_Submission_Body_Draft_2026-04-27`를 생성해 로컬 드라이브에서 직접 확인한 공고문, 지원내용, `vf` 대표본을 바탕으로 실제 제출문 톤의 본문 초안을 작성함.
- `문제인식 -> 실현가능성 -> 성장전략 -> 협업 구조 -> 실증 -> 기대효과` 흐름으로 재구성하고, `15페이지 이내 제출`, `국문/영문 동시 제출`, `탈레스 지원 포인트`, `TRL 5->7`, `Top-5 적중률 90%`, `MTTR 30% 단축` 등 실제 근거를 반영함.
- 기존 `Trust my Tech` 프로젝트 페이지에서 새 제출용 본문 초안으로 바로 이동 가능하게 링크를 추가함.

## [2026-04-27] structure | Trust my Tech HWP field-level pack

- `RTM_YNG_탈레스_Trust_my_Tech_HWP_Field_Pack_2026-04-27`를 생성해 `vf` 양식의 실제 칸 순서에 맞춘 붙여넣기용 문단 세트를 정리함.
- `프로그램 특화 항목 -> 개요 요약 -> 문제인식 -> 실현가능성 -> 성장전략 -> 팀 -> ESG` 순으로 각 칸별 `본문`, `표/이미지 슬롯`, `각주 메모`를 분리함.
- 실제 HWP 작성 시 칸별로 바로 옮겨 적을 수 있도록 `양식 칸 단위 작업본`으로 연결함.
