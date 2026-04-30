# Wiki Ops Innovation Plan

## 목표

위키를 자료 저장소가 아니라 CEO/PM이 바로 의사결정할 수 있는 실무 운영 시스템으로 전환한다. 핵심은 수집, 원문 보존, 상태 변화 기록, 중복/충돌 탐지, 병합 전략, 사용자 승인, LLM 채팅 활용까지 한 흐름으로 묶는 것이다.

## TODO

- [x] 운영형 위키 컨버팅 기준 추가
  - 프로젝트 허브를 운영 앵커로 사용
  - `Status.md`, `Business_Flow.md`, `CEO_Brief.md`, `PM_Action_Plan.md`, `Customer_Followup.md`, `Raw_Evidence_Index.md` 생성/연결
  - 파일 원문을 요약으로 대체하지 않는 원칙 적용

- [x] 위키 관리 LLM 명령에 운영형 변환 작업 추가
  - `business_ops_conversion` 계획 타입
  - Decision Queue 승인 후보 생성
  - 원문 보존 레이어와 운영 판단 레이어 분리

- [x] 신규 데이터 변화 메모 표준화
  - 형식: `YYYY-MM-DD HH:mm 데이터/근거 수집으로 [상태 변화]가 기록되었고 [후속 액션]이 수행/대기됨`
  - `Status.md`, `Business_Flow.md`, `Change_Log.md`, `Raw_Evidence_Index.md`에 append
  - Slack/Drive/File/Paperclip/GLM 채팅 입력 모두 동일한 event memo로 남김

- [x] Decisions 탭 전체 위키 유사도 스캔
  - 주요 태그, 키워드, 프로젝트명, 고객명, 파일명, 핵심 수치, 일정, 그래프 이웃을 사용
  - 유사 문서/중복 문서/충돌 가능 문서 후보 생성
  - 후보별 병합 전략과 보류 사유 제안

- [x] 병합 전략 리스트 기반 사용자 액션
  - Decision Queue 카드로 등록
  - 병합안 생성
  - 보류/추가조사/승인 반영
  - 적용 후 상태 변화 메모 자동 append

- [x] 레거시 지침 전역 정리
  - 짧은 요약 중심 지침을 원문 보존 + 운영 판단 레이어 분리 원칙으로 조정
  - `Raw_Evidence_Index.md`, `Status.md`, `Change_Log.md` 사용 규칙을 전역 지침과 인제스트 파이프라인에 반영
  - GLM 전역 지침이 CEO/PM 운영 문서와 Decision Queue를 우선 사용하도록 보강

- [x] 커맨드센터/Spotlite 운영형 위키 흐름 반영
  - 커맨드센터 프로젝트 카드에 운영 문서 준비도, 누락 문서, 상태 변화 메모, CEO/PM/고객 후속 신호 표시
  - 커맨드센터에서 운영형 전환 계획을 바로 생성해 위키 관리 승인 흐름으로 보냄
  - Spotlite에 오늘/이번주/리스크 외 운영형 위키 액션 후보와 Raw Evidence 상태를 표시

- [ ] LLM 채팅 활용 흐름 연결
  - 채팅 답변이 프로젝트 허브의 `Status`, `CEO_Brief`, `PM_Action_Plan`, `Decision Queue`, `Raw_Evidence_Index`를 우선 검색
  - 근거 부족 시 확인해야 할 원문 경로를 반환
  - 확정 지식 반영은 승인 게이트를 통과

- [ ] 병합 후보 고도화
  - LLM으로 후보별 병합 전략 재랭킹
  - 원문 보존 범위 자동 산출
  - 병합 후 hub/Status/CEO_Brief에 어떤 문장을 남길지 미리보기

- [ ] 수집 파이프라인 연동
  - Slack/Drive/File 수집 완료 시 자동으로 변화 메모 후보 생성
  - 신규 데이터가 기존 프로젝트 허브와 얼마나 가까운지 자동 계산
  - 확정 전에는 Decision Queue로만 이동

- [x] 실제 위키 운영 문서 1차 보강
  - `Sawnics_ManufacturingAI_Project`, `아사히카세히_Project`, `ZEUS_AIVoucher_Project`, `Pixel_AIVoucher_Project`, `SanupAI_RnD_Project`에 실제 운영 블록 반영
  - 각 프로젝트에 `Status`, `Business_Flow`, `CEO_Brief`, `PM_Action_Plan`, `Customer_Followup`, `Raw_Evidence_Index`, `Change_Log` 실내용 추가
  - 원문/추출 보존 위치와 CEO/PM 판단 레이어를 분리

- [x] 실제 위키 운영 문서 2차 보강
  - `PSK_Project`, `LGEnergy_ImageAnalysis_Project`, `KumhoTire_FirstProduct_Xray_Project`, `HyundaiMobis_Project`, `SeoulBiosys_Project`에 운영 블록 반영
  - 장기 계정, 요구사항/환경 제약, 현장 납품 전환, 견적/납기 협의, POC 확장 검토처럼 프로젝트별 운영 성격을 명시
  - 금액, PO, 납기, 성능 목표, 가격 제안, 고객 수용 기준을 원문 보존 대상으로 지정

- [x] 실제 위키 운영 문서 3차 보강
  - `KumhoTire_CMS_Project`, `SeoulSemicon_Project`, `Mecaro_Forecast_Project`, `Daeduck_AFVI_Project`, `BGF_EcoSpecialty_Project`에 운영 블록 반영
  - 배포 후 보정, 납품/검수, PoC-제안 전환, 제안/기술검토, 장기 운영 안정화처럼 프로젝트별 운영 성격을 명시
  - 실패 케이스, 계약/검수 문서군, FCST 근거자료, ODB/인터페이스 조건, 성능 지표/항목 제외 기준을 원문 보존 대상으로 지정

- [ ] 실제 위키 운영 문서 4차 보강 후보
  - 근거량 기준 우선순위: `KoreaAlbac_Project`, `AdvancedElectricKorea_Project`, `DaehanCable_ProcessInnovation_Project`, `Nanotech_RnD_Project`, `HsAIVoucher_Project`, `2023_ai_pattern_Project`, `2023_main_mission_title_our_Project`, `2023_필요_불량유형의_대한_허용기준에_반영_자동라벨링_Project`, `2023_sheet1_Project`, `Business_Plan_Project`
  - 완료 기준: 각 프로젝트 7개 운영 문서에 날짜형 실내용 블록이 있고, `Change_Log`에 동일 일시의 변환 기록이 남아야 함

## 운영 원칙

- 원문은 보존하고, 요약은 색인과 의사결정 보조 레이어로만 사용한다.
- LLM 판단은 확정 사실이 아니라 검토 후보로 취급한다.
- 충돌이 없다는 판단도 근거와 함께 기록한다.
- 모든 변화는 일시, 원천, 수행 내용, 상태 변화, 다음 액션이 남아야 한다.
