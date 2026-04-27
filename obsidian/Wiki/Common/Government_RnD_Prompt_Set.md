---
type: knowledge
created: 2026-04-27
updated: 2026-04-27
source: "Government R&D working prompts compiled on 2026-04-27"
---

# Government RnD Prompt Set

## 1. 신규 과제 초기 세팅

```text
이번 실행은 정부 R&D 신규 과제 세팅 모드다.

목표:
- 현재 위키와 Google Drive를 함께 확인하고
- 대표본 문서를 선정하고
- 프로젝트 전용 문서와 공통 승격 자산을 분리하고
- 바로 재사용 가능한 프로젝트 위키 초안을 만드는 것

반드시 수행:
1. 기존 Wiki/Common/Government_RnD_* 문서를 먼저 읽는다.
2. Google Drive에서 공고문, 양식, 대표본, 비교본, hwp/hwpx를 찾는다.
3. Sources, Evidence Log, Conflict Register, Change Log 초안을 만든다.
4. 참여기관/수요기업 역할 문장을 별도 정리한다.
5. 공통 자산으로 승격할 문장은 Common 문서 후보로 분리한다.
```

## 2. HWP/HWPX 표현 추출

```text
이번 실행은 HWP/HWPX 표현 추출 모드다.

목표:
- hwp/hwpx의 항목별 주요 표현, 문구, 서술 스타일을 추출하고
- 재사용 가능한 공통 문장 자산으로 바꾸는 것

반드시 수행:
1. 앞표지, 요약문, 세부 목표, 역할표, KPI, 보안/운영, 예산 파트를 우선 읽는다.
2. 항목별 반복 표현을 그대로 발췌한다.
3. 특정 기관 고유값은 분리하고 문장 골격만 남긴다.
4. 결과는 Government_RnD_HWP_Expression_Bank에 반영 가능한 형태로 정리한다.
```

## 3. 참여기관/수요기업 역할 재작성

```text
이번 실행은 역할 서술 정교화 모드다.

목표:
- 기관별 역할이 겹치지 않게 정리하고
- 수요기업의 현장 제공 가치와 참여기관의 기술 기여를 명확하게 쓰는 것

반드시 수행:
1. 주관기관, 참여기관, 수요기업을 분리한다.
2. 각 기관마다 보유 역량, 담당 범위, 실증 기여를 쓴다.
3. '지원', '협력' 같은 약한 표현은 구체적 책임으로 바꾼다.
4. 데이터 제공, 테스트베드, 검증 환경, 확산 경로를 명시한다.
```

## 4. 사업화/확산 문단 보강

```text
이번 실행은 사업화/확산 보강 모드다.

목표:
- 기술 설명을 넘어서 실제 고객 확산 경로와 상용화 패키지 구조를 보이게 하는 것

반드시 수행:
1. 기존 고객 확산, 계열사 확산, 해외 PoC, 패키지화 경로를 구분한다.
2. 단순 매출 전망보다 도입 경로와 재현 가능한 배포 단위를 먼저 쓴다.
3. 수요기업 검증 이후 확산 로드맵을 연차별로 정리한다.
```

## 연결 문서

- [[Wiki/Common/Government_RnD_Project_Starter_Template]]
- [[Wiki/Common/Government_RnD_Section_Skeletons]]
- [[Wiki/Common/Government_RnD_Reusable_Wiki_Hub]]
