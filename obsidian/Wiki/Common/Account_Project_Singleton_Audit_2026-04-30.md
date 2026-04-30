---
type: knowledge
created: 2026-04-30
updated: 2026-04-30
source: "manual audit"
---

# Account Project Singleton Audit 2026-04-30

## 목적

- `Account` 허브가 실제로 계정 차원 역할을 하고 있는지 점검합니다.
- 하위 프로젝트가 1개뿐인 경우 `Account` 유지 실익이 있는지 판단합니다.

## 판정 기준

- `유지 권장`
  - 하위 프로젝트가 2개 이상이거나
  - 고객사 차원 상업 흐름, 공통 리스크, 공통 일정, 다중 워크스트림을 별도로 묶을 필요가 있는 경우
- `통합 후보`
  - 하위 프로젝트가 1개뿐이고
  - Account 문서가 사실상 `Project` 링크 포인터 역할만 하는 경우
- `보류`
  - 현재는 1개지만 곧 다중 프로젝트로 확장될 가능성이 높아 보이는 경우

## 감사 결과

### 통합 후보

- `아사히카세히_Account`
  - 연결 프로젝트: `아사히카세히_Project` 1개
  - 현재 상태: Account 쪽 파일이 `hub.md`, `Project_Relationships.md`뿐이며 대부분 프로젝트 허브 링크와 Common/RTM_YNG 링크 재나열에 가까움
  - 판단: 현재 구조에서는 Project 단독 운영이 더 자연스러움

- `PSK_Account`
  - 연결 프로젝트: `PSK_Project` 1개
  - 현재 상태: Account 쪽 파일이 `hub.md`, `Project_Relationships.md`뿐이며 계정 차원 고유 메모가 거의 없음
  - 판단: 현재 시점 기준 단일 프로젝트 포인터 성격이 강함

- `SeoulBiosys_Account`
  - 연결 프로젝트: `SeoulBiosys_Project` 1개
  - 현재 상태: Account 쪽 파일이 `hub.md`, `Project_Relationships.md`뿐이며 실질 내용은 하위 Project로 내려가 있음
  - 판단: 단일 프로젝트 구조로 합치는 것이 단순함

- `SeoulSemicon_Account`
  - 연결 프로젝트: `SeoulSemicon_Project` 1개
  - 현재 상태: Account 쪽 파일이 `hub.md`, `Project_Relationships.md`뿐이며 고유 계정 운용 내용이 약함
  - 판단: 현재는 Project 중심 운영이 더 효율적

- `LGEnergy_Account`
  - 연결 프로젝트: `LGEnergy_ImageAnalysis_Project` 1개
  - 현재 상태: 단일 프로젝트 포인터 역할이 강함
  - 판단: 계정 허브 유지 필요성이 낮음

- `Pixel_Account`
  - 연결 프로젝트: `Pixel_AIVoucher_Project` 1개
  - 현재 상태: 문구상 DMT 연동 워크스트림을 언급하지만 실제 하위 프로젝트 연결은 1개뿐
  - 판단: 지금은 통합 후보, 향후 다중 워크스트림이 실체화되면 재분리 가능

### 유지 권장

- `KumhoTire_Account`
  - 연결 프로젝트: `KumhoTire_FirstProduct_Xray_Project`, `KumhoTire_CMS_Project`
  - 현재 상태: 실제로 하위 프로젝트가 2개이며 계정 허브 유지 명분이 충분함
  - 판단: 유지 권장

## 권장 액션

- 1차 통합 우선순위
  - `아사히카세히_Account`
  - `PSK_Account`
  - `SeoulBiosys_Account`
  - `SeoulSemicon_Account`

- 2차 통합 검토
  - `LGEnergy_Account`
  - `Pixel_Account`

- 유지
  - `KumhoTire_Account`

## 통합 시 처리 원칙

- Account 허브의 고유 문장이 없다면 `Project` 허브 상단의 `고객/계정 맥락` 섹션으로 흡수합니다.
- `Project_Relationships.md`는 내용이 단순 포인터면 삭제 대신 `Change_Log`에 통합 이력을 남깁니다.
- 기존 Account 링크가 깨지지 않도록 최소한의 리디렉션 메모 또는 통합 안내 블록을 남깁니다.
- Common/RTM_YNG/L1/GLM Chat Project 연결은 `Project` 허브 기준으로 재정렬합니다.
