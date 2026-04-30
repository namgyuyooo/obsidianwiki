---
type: evidence
created: 2026-04-29
updated: 2026-04-30
source: "2026-04-27 #sales_team thread + /Users/rtm/Documents/GitHub/commonWork/1.POC/쏘닉스/sawnics_poc_report_config.json"
---

# Evidence Log

## 운영 원칙
- 이 문서는 원문 근거, 수치, 발췌, 제약 조건을 남기는 핵심 근거 로그입니다.
- 해석과 원문을 섞지 않고, 중요한 수치에는 출처 문서명과 날짜를 함께 남깁니다.
- 충돌 가능성이 보이면 즉시 [[Wiki/Sawnics_ManufacturingAI_Project/Conflict_Register]]에 연결합니다.

## 활용 연결
- 참조 레지스터: [[Wiki/Sawnics_ManufacturingAI_Project/Reference_Register]]
- 상태 레지스터: [[Wiki/Sawnics_ManufacturingAI_Project/Status]]
- 실무 판단: [[Wiki/Sawnics_ManufacturingAI_Project/Decisions]]
- 실행 항목: [[Wiki/Sawnics_ManufacturingAI_Project/Action_Items]]
- 리스크: [[Wiki/Sawnics_ManufacturingAI_Project/Risks]]

## 기존 정리 메모
## 2026-04-30 / 사업계획서 작성 분석 착수

### Evidence 14
- Source: Local Google Drive folder listing
- Folder: `/Users/rtm/Library/CloudStorage/GoogleDrive-jaykafka12@gmail.com/.shortcut-targets-by-id/1ogQO1tIP_l5pXwttvyRt6YEsP3vkgjzl/RTM_YNG/2026_RTM(drive)/5.국책과제/쏘닉스`
- Date: 확인일 `2026-04-30`
- Topic: 쏘닉스 사업계획서 작성 자산 확보
- Type: 근거
- Original:
  > 공고 PDF, 제출 안내문 PDF, 2026 사업계획서 양식 HWP, 2025 정부일반형 기존본 HWP, 사업신청서 PDF, SW개발비 FP산출내역서 XLSX, PoC PDF/HTML이 같은 쏘닉스 폴더에 존재
- Interpretation:
  - 이제 업무 초점은 파일 확보가 아니라 `사업계획서 합격용 작성 분석`과 `신청서-계획서-사업비 정합성` 검증이다.
- Linked Pages:
  - [[Business_Plan_Writing_Analysis_2026-04-30]]
  - [[Sources]]
  - [[Action_Items]]

### Evidence 15
- Source: Local Report Config
- File: `sawnics_poc_report_config.json`
- Date: 재확인일 `2026-04-30`
- Topic: PoC 결과의 사업계획서 전환 포인트
- Type: 수치
- Original:
  > 총 50장 이미지, 정상 30장, 불량 20장
  >
  > IDT `13 / 13`, Metal `4 / 5`, Non Metal `4 / 5`
  >
  > Metal 미탐 `D_3310`, Non Metal 미탐 `D_2324`
- Interpretation:
  - 대표 AI 시나리오는 `IDT 소자 외관/품질 검사 AI`로 두고, Metal/Non Metal 미탐은 리스크 은폐가 아니라 성능개선 WBS와 검증계획으로 전환해야 한다.
- Linked Pages:
  - [[Business_Plan_Writing_Analysis_2026-04-30]]
  - [[KPI]]
  - [[Conflict_Register]]

### Evidence 16
- Source: Local Report Config
- File: `sawnics_poc_report_config.json`
- Date: 재확인일 `2026-04-30`
- Topic: 미탐 개선 방향
- Type: 결정
- Original:
  > Metal 미탐 케이스는 탐지 threshold 세분화 또는 더 높은 해상도 입력 검토 필요
  >
  > Non Metal 미탐 케이스는 합성 불량 이미지 생성과 라벨링을 통한 재학습 제안
- Interpretation:
  - 사업계획서에는 `고해상도 입력 실험`, `threshold sweep`, `합성/라벨링/재학습`을 성능개선 검증계획으로 명시하는 것이 안전하다.
- Linked Pages:
  - [[Business_Plan_Writing_Analysis_2026-04-30]]
  - [[Action_Items]]
  - [[Risks]]

## 2026-04-30 / 공고·양식 로컬 추출 및 전략화

### Evidence 09
- Source: Local mirrored PDF
- File: `★[공고] 2026년도 제조AI특화 스마트공장 구축지원사업 공고.pdf`
- Date: 공고일 `2026-03-19`, 추출일 `2026-04-30`
- Topic: 지원조건 및 일정
- Type: 수치
- Original:
  > AI공장 구축 최대 9개월, 최대 2억원, 50% 이내 / 데이터 수집·검증 최대 6개월, 최대 0.5억원
  >
  > 신청 기간 `2026-03-19 ~ 2026-04-20 17:00`
- Interpretation:
  - 쏘닉스 건은 현재 날짜 `2026-04-30` 기준 사업신청서 단계는 종료됐고, 요건검토 통과 전제의 사업계획서 작성 단계로 해석해야 한다.
  - 유형 선택이 제안서 전체 구조를 바꾸므로 `AI공장 구축`과 `데이터 수집·검증` 중 어떤 프레임으로 쓸지 먼저 확정해야 한다.
- Linked Pages:
  - [[RFP_Writing_Strategy_2026-04-30]]
  - [[Action_Items]]
  - [[Project_Overview]]

### Evidence 10
- Source: Local mirrored PDF
- File: `★[공고] 2026년도 제조AI특화 스마트공장 구축지원사업 공고.pdf`
- Date: 추출일 `2026-04-30`
- Topic: 기술성평가 배점
- Type: 수치
- Original:
  > 도입·공급기업 역량 20점 / 구축 목표 설정 타당성 25점 / 구축 내용 적절성 30점 / 구축 목표달성 가능성 25점 / 가점 5점
- Interpretation:
  - 최고 배점은 `구축 내용 적절성(30점)`이므로, 쏘닉스 제안서는 회사소개보다 `데이터 집계 포인트`, `AI 기능`, `연계 구조`, `검증 계획`을 가장 두껍게 써야 한다.
- Linked Pages:
  - [[RFP_Writing_Strategy_2026-04-30]]
  - [[KPI]]
  - [[Action_Items]]

### Evidence 11
- Source: Local mirrored PDF
- File: `(필독)2026년도 제조AI특화 스마트공장 구축사업 사업계획서 제출 안내문_경기테크노파크.pdf`
- Date: 추출일 `2026-04-30`
- Topic: 사업계획서 제출 단계 유의사항
- Type: 변경
- Original:
  > 사업계획서 제출기한 `2026-04-27 ~ 2026-05-11`
  >
  > 공급기업 Pool 등록이 안 되어 있으면 제출 마감 최소 10일 전까지 사전 등록 및 승인 필수
- Interpretation:
  - 지금 실무상 병목은 `공고 해석`보다 `제출 단계 준비 완성도`다.
  - 공급기업 Pool, 사업관리시스템 입력값, 양식 본문 값이 어긋나면 내용이 좋아도 제출 리스크가 생긴다.
- Linked Pages:
  - [[RFP_Writing_Strategy_2026-04-30]]
  - [[Action_Items]]
  - [[Risks]]

### Evidence 12
- Source: Local mirrored HWP via `rhwp dump`
- File: `2. [사업계획서] 제조AI특화 스마트공장 사업계획서_양식_260326_01_데이터수집검증 중복화.hwp`
- Date: 추출일 `2026-04-30`
- Topic: 양식 구조
- Type: 결정
- Original:
  > `2.5 AI시스템 구축 계획`, `2.6 AI모델 적용 시나리오 및 성능 목표 수준`, `2.7 데이터 현황 및 수집·검증 계획`, `9. 산업안전 및 보안대책 수립 계획`
- Interpretation:
  - 2026 양식은 일반 스마트공장 서술이 아니라 AI 적용 시나리오와 데이터 검증을 직접 요구한다.
  - 따라서 2025 쏘닉스 기존본을 단순 재사용하면 AI 특화 평가 포인트가 비게 된다.
- Linked Pages:
  - [[RFP_Writing_Strategy_2026-04-30]]
  - [[Conflict_Register]]
  - [[Action_Items]]

### Evidence 13
- Source: Local mirrored HWP via `rhwp dump`
- File: `별첨#02. (신청단계), 2025년 정부일반형 스마트공장 사업계획서_쏘닉스_20250117(보완2).hwp`
- Date: 추출일 `2026-04-30`
- Topic: 기존본 재사용 가능 자산
- Type: 근거
- Original:
  > 기존본에는 `ERP/MES`, `RMS`, `Recipe 관리`, `공정별 설비 인터페이스`, `공정 불량률`, `작업공수` 등 구조화된 현장 서술이 존재
- Interpretation:
  - 기존본은 버릴 문서가 아니라 `현장 베이스라인`으로 매우 유효하다.
  - 다만 2026 제출본에서는 이를 `AI공장`, `데이터 수집`, `예측/판단`, `성능검증` 언어로 재서술해야 한다.
- Linked Pages:
  - [[RFP_Writing_Strategy_2026-04-30]]
  - [[Project_Overview]]
  - [[KPI]]

## 2026-04-29 / Sawnics 초기 위키화

### Evidence 01
- Source: Slack Thread Parent
- Channel: `#sales_team`
- Date: 2026-04-27 10:58 KST
- Thread: 쏘닉스 담당자
- Topic: 담당 호출
- Type: 결정
- Original:
  > <@U025MG70MNX> <@U082RGK8J15>
  >
  > 쏘닉스 담당자
- Interpretation:
  - 쏘닉스 건이 내부 영업/대응 단위로 호출되었고, 최소 두 명의 직접 관련자가 스레드에 태그됐다.
- Linked Pages:
  - [[Project_Overview]]
  - [[Action_Items]]

### Evidence 02
- Source: Slack Thread Reply
- Channel: `#sales_team`
- Date: 2026-04-27 12:42 KST
- Thread: 쏘닉스 담당자
- Topic: 자료 공유
- Type: 변경
- Original:
  > 지원사업 자료와 POC보고서 공유드립니다.
  > 메일로도 전달드리겠습니다.
- Interpretation:
  - 쏘닉스 건은 PoC 보고서 단독이 아니라 지원사업 자료와 함께 움직이고 있으며, 비공개 메일 전달까지 포함한 실제 대응 단계다.
- Attached Files:
  - `SAWNICS_PoC_Report.pdf`
  - `sawnics_poc_report.html`
  - `(필독)2026년도 제조AI특화 스마트공장 구축사업 사업계획서 제출 안내문_경기테크노파크.pdf`
  - `제출서류 양식.zip`
- Linked Pages:
  - [[Sources]]
  - [[Project_Overview]]
  - [[Next_Meeting_Prep]]

### Evidence 03
- Source: Slack Thread Reply
- Channel: `#sales_team`
- Date: 2026-04-27 11:14 KST
- Thread: 쏘닉스 담당자
- Topic: 과제 성격 질의
- Type: 리스크
- Original:
  > 혹시 어떤 과제일까요?
- Interpretation:
  - 내부에서도 과제 유형이 즉시 공유된 상태는 아니었고, 사업명/트랙/요건이 추가 설명이 필요한 상황이었다.
- Linked Pages:
  - [[Risks]]
  - [[Conflict_Register]]

### Evidence 04
- Source: Slack Thread Reply
- Channel: `#sales_team`
- Date: 2026-04-27 15:32 KST
- Thread: 쏘닉스 담당자
- Topic: 미팅 참석자 지정
- Type: 결정
- Original:
  > 쏘닉스건 미팅은 제가 다녀오기로 되었습니다  <@U082RGK8J15> 방문미팅이후 이욱이사님과 논의하시죠
- Interpretation:
  - 유남규가 이번 미팅 주체를 맡기로 정리됐고, 방문미팅 이후 이욱 이사와의 내부 의사결정 루프가 예정되어 있다.
- Linked Pages:
  - [[Action_Items]]
  - [[Next_Meeting_Prep]]

### Evidence 05
- Source: Local Report Config
- File: `sawnics_poc_report_config.json`
- Date: 2026-04-28 생성본
- Topic: 데이터 규모
- Type: 수치
- Original:
  > 대상은 정상 30장과 불량 20장을 포함한 총 50장 이미지
- Interpretation:
  - 현재 PoC 메시지는 소량이지만 명확한 표본 집합에 기반하며, 전체 데이터 확장성은 아직 미확인이다.
- Linked Pages:
  - [[Project_Overview]]
  - [[KPI]]

### Evidence 06
- Source: Local Report Config
- File: `sawnics_poc_report_config.json`
- Date: 2026-04-28 생성본
- Topic: 영역별 성과
- Type: 수치
- Original:
  > IDT 13 / 13
  > Metal 4 / 5
  > Non Metal 4 / 5
- Interpretation:
  - IDT 영역은 전건 탐지로 강점이 뚜렷하지만, 나머지 두 영역은 아직 추가 보강이 필요하다.
- Linked Pages:
  - [[KPI]]
  - [[Project_Overview]]
  - [[Risks]]

### Evidence 07
- Source: Local Report Config
- File: `sawnics_poc_report_config.json`
- Date: 2026-04-28 생성본
- Topic: 미탐 케이스
- Type: 리스크
- Original:
  > Metal에서는 D_3310이 미탐이었고, Non Metal에서는 D_2324가 미탐이었습니다.
- Interpretation:
  - 제안서/미팅에서는 성과만이 아니라 현재 한계 사례까지 포함해 설명해야 한다.
- Linked Pages:
  - [[Risks]]
  - [[Conflict_Register]]

### Evidence 08
- Source: Local Report Config
- File: `sawnics_poc_report_config.json`
- Date: 2026-04-28 생성본
- Topic: 개선 방향
- Type: 결정
- Original:
  > Metal 미탐 케이스에 대해서는 탐지 threshold 세분화 또는 더 높은 해상도 입력 검토가 필요합니다.
  >
  > Non Metal 미탐 케이스에 대해서는 합성 불량 이미지 생성과 라벨링을 통한 재학습이 제안되었습니다.
- Interpretation:
  - 후속 액션은 이미 기술적으로 어느 정도 정리되어 있으므로, 고객 요구와 연결만 되면 다음 실험 계획으로 바로 전환할 수 있다.
- Linked Pages:
  - [[Action_Items]]
  - [[Next_Meeting_Prep]]
