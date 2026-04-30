---
type: business_flow
created: 2026-04-30
updated: 2026-04-30
source: "operational wiki conversion"
---

# Business Flow

## 운영 흐름
| 단계 | 현재 상태 | 근거 | 다음 게이트 | 담당 |
| --- | --- | --- | --- | --- |
| 수집/원문 보존 | 운영 문서 구조 생성, 원문 확인 대기 | [[Wiki/DaehanCable_ProcessInnovation_Project/Sources]], [[Wiki/DaehanCable_ProcessInnovation_Project/Raw_Evidence_Index]] | 핵심 문장/수치/버전 체인 확인 | TBD |
| 실무 판단 | CEO/PM 판단 레이어 보강 필요 | [[Wiki/DaehanCable_ProcessInnovation_Project/Evidence_Log]], [[Wiki/DaehanCable_ProcessInnovation_Project/Status]] | 리스크/결정/후속 액션 분리 | TBD |
| 고객 후속 | 고객 접점 영향 확인 필요 | [[Wiki/DaehanCable_ProcessInnovation_Project/Customer_Followup]] | 다음 연락/자료 요청 여부 결정 | TBD |

## 변화 메모
- 2026-04-30 00:00 운영형 위키 전환 기준으로 DaehanCable ProcessInnovation Project 운영 문서 구조가 생성/점검되었고 원문 보존, 상태 갱신, CEO/PM 후속 판단이 수행/대기됨

## 실제 운영 흐름 - 2026-05-01

1. 수집: `대한전선 불량이미지.zip`, `압연 2_Daily.csv`, `압연 12_Daily.csv`, `ADV user guide.pdf`, SCADA/Monit 메시지를 [[Evidence_Log]]와 [[Raw_Evidence_Index]]에 묶어 둔다.
2. 분석: 외관검사 샘플 해석과 설비 이상 탐지 데이터를 분리하지 말고, 각각 어떤 고객 질문에 답하는지 목적별로 나눈다.
3. 판단: `압연 2번 RPM / 12번 Hz` 단위 차이, 상관관계 기준(`r>.9`, `r>0.8`), 추가 촬영/추가 데이터 필요 여부를 [[Decisions]]와 [[Risks]]에 올린다.
4. 실행: 데이터 단위 정규화, 고객 질의 대응용 분석 기준서, 외관검사 솔루션 제안 범위 정리를 [[Action_Items]]와 [[Conflict_Register]]로 연결한다.
5. 보고: CEO는 과제형 제안으로서의 사업성보다 데이터 신뢰도 리스크를, PM은 고객에게 설명 가능한 분석 전제와 샘플 확보 계획을 우선 점검한다.
