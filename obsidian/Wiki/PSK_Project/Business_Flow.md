---
type: business_flow
created: 2026-04-30
updated: 2026-04-30
source: "operational wiki conversion"
---

# Business Flow

## 실제 운영 흐름 - 2026-04-30

1. 수집: Slack 채널 `#psk-견적발주납품현황`, `#tsi_unit`, `#tf_psk-업무대응`의 금액/납기/계약/패치 메시지를 [[Evidence_Log]]에 보존한다.
2. 분류: `공동기술개발 계약`, `EHM 납품/운영`, `PE Agent`, `Precia`, `온도예측task`를 별도 흐름으로 나누고, 금액/납기/서버 사양/현장 제약을 각각 태깅한다.
3. 판단: 비용 인상 근거, 서버 예산, 납기, 현장 데이터 한계를 [[Decisions]]와 [[Risks]]로 올린다.
4. 실행: 계약 자료 전달, 세금계산서/PO 처리, EHM 패치/납품, PE Agent 자료/데모/피드백, Precia 데이터 확보를 [[Action_Items]]에 연결한다.
5. 보고: CEO는 매출/계약/제품화 기회, PM은 하위 workstream별 담당자와 기한을 우선 확인한다.

## 운영 흐름
| 단계 | 현재 상태 | 근거 | 다음 게이트 | 담당 |
| --- | --- | --- | --- | --- |
| 수집/원문 보존 | 운영 문서 구조 생성, 원문 확인 대기 | [[Wiki/PSK_Project/Sources]], [[Wiki/PSK_Project/Raw_Evidence_Index]] | 핵심 문장/수치/버전 체인 확인 | TBD |
| 실무 판단 | CEO/PM 판단 레이어 보강 필요 | [[Wiki/PSK_Project/Evidence_Log]], [[Wiki/PSK_Project/Status]] | 리스크/결정/후속 액션 분리 | TBD |
| 고객 후속 | 고객 접점 영향 확인 필요 | [[Wiki/PSK_Project/Customer_Followup]] | 다음 연락/자료 요청 여부 결정 | TBD |

## 변화 메모
- 2026-04-30 00:00 운영형 위키 전환 기준으로 PSK Project 운영 문서 구조가 생성/점검되었고 원문 보존, 상태 갱신, CEO/PM 후속 판단이 수행/대기됨
