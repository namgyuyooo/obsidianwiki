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
- 상태 레지스터: [[Wiki/Sawnics_ManufacturingAI_Project/Status]]
- 실무 판단: [[Wiki/Sawnics_ManufacturingAI_Project/Decisions]]
- 실행 항목: [[Wiki/Sawnics_ManufacturingAI_Project/Action_Items]]
- 리스크: [[Wiki/Sawnics_ManufacturingAI_Project/Risks]]

## 기존 정리 메모
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
