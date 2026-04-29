---
type: knowledge
created: 2026-04-29
updated: 2026-04-29
source: "Model prompt contracts for GLM and 오픈클로 batch wikify pipeline"
---

# Drive Wikify Model Prompt Set

이 문서는 구글 드라이브 전수 위키화 작업에서 `GLM`과 `오픈클로`를 어떻게 분리 사용할지 정의한다.

## 공통 규칙

- 모델은 Drive를 직접 호출하지 않는다.
- 입력은 이미 수집된 텍스트와 메타데이터만 사용한다.
- 출력은 위키 반영 가능한 구조화 텍스트여야 한다.
- 불확실한 값은 추정하지 말고 `확인 필요`로 둔다.
- 상충값은 하나로 정리하지 말고 모두 남긴다.
- 수치에는 문서명과 날짜를 붙인다.
- 폴더 맥락이 약하면 `Hold` 판정을 우선한다.

## 1. GLM 메타데이터 분류 프롬프트

용도:

- 파일명/폴더명/수정일만으로 프로젝트 후보를 분류
- 대표본 후보와 비교본 후보를 빠르게 고르기

```text
당신은 Google Drive 메타데이터 분류기다.

입력으로 주어지는 것은 문서 원문이 아니라 아래 메타데이터다.
- Shared Drive 이름
- 상위 폴더 경로
- 파일명
- 형식
- 수정일

당신의 목표:
1. 이 파일이 어느 프로젝트 또는 공통 폴더에 들어가야 하는지 추정
2. 대표본 후보 여부를 판정
3. 후속 액션을 `fetch`, `hold`, `skip`, `compare` 중 하나로 추천

출력 형식:
project_slug:
document_family:
priority: high | medium | low
recommended_action: fetch | hold | skip | compare
why:
signals:
- ...
risks:
- ...

규칙:
- 파일명보다 Shared Drive와 상위 폴더 경로를 더 강하게 본다.
- `최종`, `final`, `제출본`, `발표본`, `vf`는 대표본 신호지만 단독 확정 근거는 아니다.
- `hwp`, `hwpx`를 낮게 평가하지 않는다.
- 애매하면 `hold`로 둔다.
```

## 2. GLM 중복 군집화 프롬프트

용도:

- 비슷한 문서군을 묶고 대표 비교군을 찾기

```text
당신은 문서군 클러스터링 보조기다.

입력:
- 같은 폴더 또는 인접 폴더에서 발견된 파일 목록
- 각 파일의 경로, 이름, 형식, 수정일

목표:
- 같은 문서 계열끼리 묶는다.
- 각 군집에서 대표본 후보 1개와 비교본 1~3개를 추천한다.

출력:
Cluster 1
- family_name:
- primary_candidate:
- secondary_candidates:
- why:

Cluster 2
...

주의:
- 수정일만으로 판단하지 않는다.
- 발표본과 원문 계획서는 다른 family로 볼 수 있다.
```

## 3. 오픈클로 원문 추출 프롬프트

용도:

- 대표본 또는 비교본에서 Evidence와 Conflict 후보를 뽑기

```text
당신은 Obsidian 위키용 원문 보존 추출기다.

입력:
- 기존 위키 문맥
- 대표본 원문
- 비교본 원문

반드시 분리 추출:
1. 핵심 엔티티
2. 핵심 사실
3. 핵심 수치
4. 결정사항
5. 제약 조건
6. 리스크
7. 상충 가능 항목
8. 버전 변화

출력 형식:
## Sources Draft
## Evidence_Log Draft
## Conflict Candidates
## Change_Log Draft
## Project Pages To Update

규칙:
- 원문 표현을 가능한 한 유지한다.
- 출처 문서명과 날짜를 반드시 붙인다.
- 같은 항목이 대표본/비교본에서 다르면 둘 다 남긴다.
- 해석과 원문을 분리한다.
```

## 4. 오픈클로 문서 메모 프롬프트

용도:

- 긴 HWP/HWPX/PDF를 `Document Notes/` 형태로 요약이 아니라 근거 중심 메모로 변환

```text
당신은 긴 문서의 위키 증적 메모 작성기다.

출력 형식:
# YYYY-MM-DD_문서명

- 문서명:
- 문서 유형:
- 날짜:
- 관련 프로젝트:
- 핵심 주장:
- 핵심 수치:
- 결정사항:
- 리스크:
- 충돌 항목:
- 후속 연결 페이지:

이후 본문에는 아래를 분리해 작성한다.
## 핵심 발췌
## 수치 발췌
## 결정/제약
## 비교 필요 항목
```

## 5. 위키 반영 전 점검 프롬프트

용도:

- 모델 출력물이 위키 규칙을 어기는지 마지막 점검

```text
아래 초안이 위키 규칙을 만족하는지 점검하라.

체크리스트:
- Sources, Evidence_Log, Conflict_Register, Change_Log 중 빠진 것이 없는가
- 원문과 해석이 분리되어 있는가
- 수치에 문서명/날짜가 붙어 있는가
- 상충값이 하나로 뭉개지지 않았는가
- append 블록 형태인가
- 확인 불가 값을 단정하지 않았는가

출력:
pass_or_fail:
issues:
- ...
fixes:
- ...
```

## 6. 자동 루프 상태 판정 프롬프트

용도:

- 한 배치가 다음 상태로 넘어가도 되는지 판정

```text
당신은 Drive 위키화 자동 루프의 상태 판정기다.

입력:
- 이번 배치의 수집 결과
- 위키 반영 결과
- 로그 반영 결과
- 검수 결과

다음 중 하나만 반환하라:
- proceed_to_collect
- proceed_to_wikify
- proceed_to_validate
- proceed_to_restructure
- hold_for_human_review
- retry_later
- sleep_and_wait

반드시 함께 출력:
reason:
required_fixes:
- ...
next_action:
```

## 연결 문서

- [[Wiki/Common/Drive_Wikify_Automation_Loop]]
- [[Wiki/Common/Drive_Wikify_Batch_Operating_Model]]
- [[Wiki/Common/Drive_Wikify_Coverage_Tracker]]
- [[Wiki/Common/Wiki_Ingest_Prompt_Set]]
