---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
tags:
  - slack
  - evidence
  - coverage
---

# Collection Coverage Assessment

공개 Slack 최근 2년 기준으로 현재까지 생성한 프로젝트 문서의 증적량을 계량하고, 남은 공개 프로젝트 채널의 신규 분리 가능성을 평가한다.

## 평가 기준

- `Evidence Count`: `Evidence_Log.md`의 `### Evidence` 개수
- `Source Section`: `Sources.md`의 `###` 개수
- `Overview Size`: `Project_Overview.md` 줄 수
- 판단 기준:
  - `충분`: 증적 6건 이상이거나 파일/결정/리스크 흐름이 이미 안정적으로 확인됨
  - `중간`: 증적 4~5건 수준으로 뼈대는 있으나 수치/결정/후속 맥락 보강 필요
  - `보강 필요`: 증적 3건 이하이거나 파일/결정 연결이 아직 약함

## 현재 프로젝트 수집량

| 프로젝트 | Evidence Count | Source Section | Overview Size | 현재 판단 | 의미 | 다음 액션 |
| --- | ---: | ---: | ---: | --- | --- | --- |
| PSK | 17 | 3 | 53 | 충분 | 계약, KPI, 공수, 데모, 리스크까지 장기 운영형 증적이 가장 두텁다 | `PSKH` 분리 여부와 하위 workstream 정리 |
| KumhoTire FirstProduct Xray | 7 | 2 | 76 | 충분 | 현장회의, 경과보고, 산출물, 설치 전환 흐름이 선명하다 | 납품 이후 안정화 메시지 후속 수집 |
| HyundaiMobis | 6 | 2 | 70 | 충분 | 요구사항-제작사양-견적 수정-납기 충돌 흐름이 잡혀 있다 | 계약 목표 일정과 실무 추정 일정의 차이 정리 |
| Mecaro Forecast | 6 | 2 | 69 | 충분 | Pre-PoC, 결과발표, 단계별 제안, FCST 근거자료 흐름이 있다 | 근거자료 질의 이후 후속 답변 보강 |
| SeoulSemicon | 5 | 2 | 87 | 충분 | 계약/PO/Invoice/Acceptance Report와 출장 운영이 연결된다 | 2025~2026 문서군 차수 연결 정리 |
| KoreaAlbac | 5 | 2 | 69 | 중간 | 제안/견적/최종리뷰는 확보됐지만 문제정의와 범위 진화가 더 필요하다 | v1-v2 제안 변화와 PoC 범위 비교 |
| HsAIVoucher | 4 | 2 | 66 | 중간 | 바우처 사업과 기능추가개발 연결은 보이나 범위 분리가 덜 됐다 | 본 사업과 후속 개발 범위 분리 |
| LGEnergy ImageAnalysis | 4 | 2 | 76 | 중간 | 기술 요구와 인프라 제약은 잘 보이지만 파일형 계약/결과 문서가 더 필요하다 | Li 정량화/XRM 과제 구분과 성능 문서 재탐색 |
| SeoulBiosys | 3 | 2 | 64 | 보강 필요 | POC 결과와 AI agent 확장 흐름은 보이나 단계별 결정이 아직 성글다 | 1차/2차 결과 차이와 후속 실행 여부 탐색 |

## 남은 공개 채널 탐색 결과

### 1차 분리 후보

| 후보 | 대표 채널 | 확인된 파일/증적 | 현재 판단 | 다음 액션 |
| --- | --- | --- | --- | --- |
| KumhoTire CMS | `#pjt_금호타이어_cms` | `result.zip`, `*_raw.png`, `*_overlay.png`, 테스트/배포/실패 케이스 공유 | 독립 프로젝트 후보 강함 | 첫제품 X-ray와 별도 폴더 분리 여부 판단 |
| Advanced Electric Korea | `#hubble-pjt-어드벤스일렉트릭코리아` | 세금계산서, 하자이행보증증권, `recipes.zip`, 제품검사 개선요청사항, 고객 피드백 | 납품형 프로젝트 후보 강함 | 계약-검사개선-운영 이슈 축으로 승격 검토 |
| Daeduck AFVI | `#hubble-pjt-대덕전자_afvi` | AFVI 제안서, 주요 산출물 canvas, ODB feature 파일, 네트워크 구성도 | 제안/기술검토형 후보 강함 | AFVI 1차/2차 과제 구분 후 폴더 생성 검토 |
| 대한전선 공정혁신과제 | `#pjt-대한전선-공정혁신과제-호반혁신기술공모전` | `압연 2_Daily.csv`, `압연 12_Daily.csv`, 불량이미지.zip, user guide | 데이터 분석/제안형 후보 강함 | 센서/SCADA/불량이미지 축으로 독립 후보 등록 |
| BGF에코스페셜티(구 FLK) | `#pjt-비지에프에코스페셜티-구-flk` | 운영 리뷰 ppt/pdf, 장애처리보고서, 운영 성능/변색 이슈 메시지 | 운영형 프로젝트 후보 강함 | 운영 리뷰 기반 장기 운영 과제 여부 판단 |
| Nanotech 정출연과제 | `#pjt_나노텍_정출연과제` | OES 활용사례 고도화, 협업 Item, 초회 미팅 docx, 과제 신청서류 | 과제/협업 제안형 후보 강함 | PSK 연계 과제인지 독립 과제인지 구조화 |

### 2차 탐색 후보

| 후보 | 대표 채널 | 확인된 증적 | 현재 판단 | 다음 액션 |
| --- | --- | --- | --- | --- |
| Pixel AI Voucher | `#pjt_픽셀_ai바우처` | 패키지/도메인 매핑, 이미지 샘플 다수, generic filename 위주 | 탐색 필요 | 제안서/견적/결과 문서 존재 여부 재탐색 |
| ZEUS AI바우처 | `#pjt_zeus_ai바우처` | 일반 기술/압축파일 위주 | 탐색 필요 | 고객명/과제명 변형 키워드 재탐색 |
| DMT | `#pjt_dmt` | 배포 가이드, 스크립트/도커/DB 운영 메시지 | 기술 운영 채널 가능성 높음 | 고객 프로젝트인지 내부 운영인지 구분 |
| PSK 온도예측task | `#pjt_psk_온도예측task` | 이번 검색에서 파일 미확인 | 탐색 필요 | 메시지 중심 재탐색 |
| 한맥-pjt | `#한맥-pjt` | 이번 검색에서 고가치 파일 미확인 | 탐색 필요 | 채널 실체와 프로젝트성 재확인 |

## 판정 메모

- `금호타이어 CMS`는 현재의 `금호타이어 첫제품 X-ray`와 고객사는 같지만 증적 성격이 다르다. 이미지 처리 결과와 배포 테스트가 별도 축으로 보이므로 별도 프로젝트 또는 하위 workstream 후보로 다룰 가치가 있다.
- `Advanced Electric Korea`는 단순 기술 검토가 아니라 세금계산서와 하자이행보증증권까지 보인다. 납품형 프로젝트로 승격할 근거가 강하다.
- `Daeduck AFVI`, `대한전선`, `나노텍`은 제안/분석/과제형 증적이 뚜렷하다. 실제 위키 프로젝트 후보로 올릴 만하다.
- `Pixel`, `ZEUS`, `DMT`는 현재까지는 파일명 밀도나 고객 deliverable 성격이 약하다. 조금 더 보수적으로 다루는 편이 안전하다.

## 연결 문서

- [[Wiki/Common/Evidence_Candidate_Map]]
- [[Wiki/Common/Project_Candidate_Register]]
- [[Wiki/Common/Project_Deepening_TODO]]
