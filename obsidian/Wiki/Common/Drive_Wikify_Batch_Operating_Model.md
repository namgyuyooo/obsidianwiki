---
type: knowledge
created: 2026-04-29
updated: 2026-04-29
source: "Google Drive connector inventory plus batch wikify design"
---

# Drive Wikify Batch Operating Model

구글 드라이브 전체를 한 번에 과도하게 조회하지 않고, 중간 중단 이후에도 이어서 진행할 수 있도록 배치형 위키화 파이프라인을 정의한다.

## 목표

- 접근 가능한 Google Drive와 Shared Drive의 기록을 폴더 단위로 위키화한다.
- 한 번에 대량 fetch 하지 않고 `폴더 스냅샷 -> 후보 선별 -> 대표본 추출 -> 위키 반영` 순서로 쪼갠다.
- `오픈클로`와 `GLM`은 수집기가 아니라 해석기 역할로 분리한다.
- 중간 실패, quota, 과부화가 발생해도 마지막 커서부터 재개 가능하게 한다.

## 코드와 위키 분리

- 실행 코드는 `automation/drive_wikify/` 아래에 둔다.
- 위키에는 설계 문서, 배치 기록, 증거, 충돌, 로그만 남긴다.
- 따라서 이 문서는 코드 저장 위치가 아니라 운영 기준 문서다.

## 현재 확인된 Drive 범위

2026-04-29 기준 커넥터에서 확인된 Shared Drive:

- `2026년도 전자부품산업기술개발`
- `산업현장문제해결형산업AI에이전트기술개발(R&D)`

이 문서는 위 두 Drive부터 시작하되, 이후 접근 가능한 Drive가 늘어나면 같은 구조로 확장한다.

## 핵심 원칙

- Drive 전수 탐색을 하더라도 API 호출은 작게 쪼갠다.
- 폴더 전체 raw dump를 바로 위키 본문으로 넣지 않는다.
- 파일명만 보지 않고 Shared Drive 이름, 상위 폴더, 상상위 폴더를 함께 기록한다.
- `hwp`, `hwpx`, `pdf`, `docx`, `pptx`, Google Docs, Google Slides를 모두 후보군에 포함한다.
- `hwp`, `hwpx`, `pdf`, `docx`, `pptx`는 모두 실제 본문 추출 대상이다.
- `hwp`, `hwpx`는 필요 시 `rhwp`, `unzip`, XML/text 추출을 사용한다.
- `pdf`는 텍스트 추출 실패 시 OCR 여부를 기록한다.
- `docx`는 본문, 표, 제목 구조를 함께 추출한다.
- `pptx`는 슬라이드 제목, 본문, 표, 핵심 수치, 노트 존재 여부까지 추출한다.
- 대표본과 비교본을 분리하고, 충돌은 `Conflict_Register.md`에 남긴다.
- 위키 반영 전 상태를 큐 문서와 커버리지 문서에 먼저 남긴다.
- 프로젝트로 정의될 수 있는 문서군이면 신규 프로젝트 위키 생성을 기본 후보에 포함한다.
- 유사하거나 중복된 내용이 있더라도 자동 병합하지 않고, `기존 프로젝트 업데이트`와 `별도 프로젝트 분기`를 먼저 판정한다.
- 중요한 것은 `빠르게 끝내기`가 아니라 `중단되어도 재개 가능한 배치 처리`다.

## 배치 단위

기본 배치 단위는 아래 순서를 따른다.

1. Shared Drive 하나를 선택한다.
2. 즉시 하위 폴더 5~20개만 목록화한다.
3. 폴더별로 `Primary Candidate`, `Secondary Candidate`, `Skip`, `Hold`를 판정한다.
4. 후보 폴더 안에서 파일 20~50개 단위로 다시 확인한다.
5. 대표본 1개, 비교본 1~3개만 fetch 또는 원문 추출하되, 같은 배치 안의 보조 파일도 manifest에 남긴다.
6. `Sources`, `Evidence_Log`, `Conflict_Register`, `Change_Log`를 갱신한다.
7. 큐 상태를 `done`, `hold`, `retry`, `expanded` 중 하나로 마감한다.

한 배치에서 다루는 기준:

- 폴더 1~3개
- 파일 20~50개
- 대표본 1~3개
- 비교본 0~5개
- 문서 원문 추출은 30분 이내로 끝나는 범위
- 1파일은 최대 8,000~15,000자 청크로 잘라 처리

## 파이프라인

### 1. Discovery Layer

커넥터 기반으로 폴더와 파일의 존재를 확인하는 단계다.

- 사용 도구:
  - Drive 목록 확인
  - 폴더 direct listing
  - 키워드 search
  - metadata read
- 저장 위치:
  - `[[Wiki/Common/Drive_Wikify_Coverage_Tracker]]`
  - 프로젝트별 `Sources.md`
- 산출물:
  - 폴더 경로
  - 파일명
  - 문서 형식
  - 수정일
  - 대표성 후보 여부

### 2. Triage Layer

파일 전부를 읽지 않고, 어떤 폴더와 문서를 먼저 볼지 정하는 단계다.

- `GLM` 권장 역할:
  - 폴더명/파일명 기반 1차 분류
  - 문서 계열 추정
  - 대표본 후보 랭킹
  - 중복 파일명 군집화
  - 신규 프로젝트 후보 판정
  - 기존 프로젝트와의 분기 필요 여부 판정
- 입력:
  - Shared Drive 이름
  - 상위 폴더 경로
  - 파일명
  - 수정일
  - 파일 형식
- 출력:
  - `project_slug`
  - `document_family`
  - `priority`
  - `recommended_action`
  - `project_decision`
  - `why`

`project_decision` 허용값:

- `update_existing_project`
- `create_new_project`
- `create_account_level_hub`
- `hold_for_human_review`

### 3. Evidence Extraction Layer

대표본과 비교본의 실제 내용을 읽고 근거를 발췌하는 단계다.

- `오픈클로` 권장 역할:
  - 긴 문서의 원문 보존형 추출
  - 핵심 수치, 결정, 제약, 충돌 후보 식별
  - 위키 append 블록 초안 작성
  - 중복 내용의 차이점 추출
  - 별도 프로젝트 분기 필요성 추출
- 입력:
  - 대표본 원문 또는 추출 텍스트
  - 비교본 원문 또는 추출 텍스트
  - 기존 위키 페이지
- 출력:
  - `Sources.md` 등록 초안
  - `Evidence_Log.md` 발췌 초안
  - `Conflict_Register.md` 후보
  - `Change_Log.md` 추가 블록
  - `new_project_candidate` 판단 메모

청크 처리 순서:

1. 파일 원문을 8,000~15,000자 단위로 분할
2. 청크별 핵심 문장, 수치, 결정, 제약, 충돌 후보를 추출
3. 청크 요약을 합쳐 파일 요약과 증거 초안을 생성
4. 파일 요약을 합쳐 프로젝트 위키 문서에 반영

### 4. Wiki Promotion Layer

모델 출력물을 위키 스키마에 맞게 승격하는 단계다.

- 반드시 남길 문서:
  - `Sources.md`
  - `Evidence_Log.md`
  - `Conflict_Register.md`
  - `Change_Log.md`
- 필요 시 추가:
  - `Project_Overview.md`
  - `Decisions.md`
  - `Risks.md`
  - `KPI.md`
  - `Document Notes/`

신규 프로젝트로 판정되면 아래를 함께 생성 대상으로 본다.

- `hub.md`
- `Project_Overview.md`
- `Sources.md`
- `Evidence_Log.md`
- `Conflict_Register.md`
- `Change_Log.md`
- `Decisions.md`
- `Risks.md`
- `obsidian/L1_memory/{ProjectName}.md`

## 모델 역할 분리

모델은 아래처럼 나눠 쓰는 것을 기본값으로 한다.

| 단계 | 기본 역할 | 추천 모델 |
| --- | --- | --- |
| Discovery | 비모델, 커넥터 호출 | 없음 |
| Triage | 파일/폴더 메타데이터 분류 | `GLM` |
| Extraction | 원문 발췌, 수치/결정/충돌 추출 | `오픈클로` |
| Project Decision | 신규 프로젝트 생성/분기 판단 | `GLM` + `오픈클로` |
| Rewrite Check | 위키 블록 품질 점검 | `GLM` 또는 `오픈클로` |

주의:

- 모델이 Drive를 직접 순회하게 하지 않는다.
- 모델에게 대량 바이너리를 한 번에 넣지 않는다.
- 배치마다 입력 본문 길이 상한을 둔다.

## 실패 대응

### quota 또는 rate limit

- 현재 배치를 즉시 종료한다.
- 마지막 성공 폴더를 `Coverage_Tracker`에 기록한다.
- 실패 폴더를 `retry`로 남긴다.
- 이후에는 폴더 직접 목록화보다 로컬 동기화본 또는 이미 fetch한 대표본 중심으로 전환한다.
- `속도를 더 높여 재시도`하지 않고, 배치 크기와 호출 속도를 더 줄이는 방향으로 대응한다.

### 문서 형식 문제

- `hwp`, `hwpx`는 `rhwp` 또는 구조 덤프로 우회한다.
- Google Docs/Slides는 커넥터 fetch를 우선 사용한다.
- 이미지/스캔 PDF는 OCR 여부를 `Sources.md` 비고에 남긴다.
- `docx`, `pptx`는 존재 기록만 하지 말고 반드시 텍스트/구조 추출을 시도한다.
- 표 중심 문서도 프로젝트 판정용 증거로 보존한다.

### 폴더 맥락이 약한 경우

- 즉시 프로젝트 문서로 승격하지 않는다.
- `Hold`로 남기고 상위 폴더 재탐색 후 결정한다.

### 중복 또는 유사 프로젝트가 보이는 경우

- 문서 내용을 자동 병합하지 않는다.
- 아래를 비교한 후 `동일 프로젝트 업데이트`인지 `별도 프로젝트 분기`인지 판정한다.
  - 고객사
  - 과제명
  - 연도
  - 참여기관 조합
  - KPI
  - 예산 총액
  - 적용 공정/장비
  - 문서 목적
- 2개 이상 핵심 축이 달라지면 별도 프로젝트 후보로 올린다.
- 같은 고객사라도 과제명, 연도, 예산, 참여기관이 달라지면 신규 프로젝트 위키를 우선 검토한다.

## 커서와 상태 관리

각 배치 실행은 아래 상태를 가져야 한다.

- `queued`
- `running`
- `done`
- `hold`
- `retry`
- `expanded`

반드시 기록할 필드:

- drive 이름
- 폴더 경로
- 마지막 확인 시각
- 마지막 확인 파일 수
- 대표본 선정 여부
- 위키 반영 여부
- 다음 액션

## 위키 반영 순서

1. `Drive_Wikify_Coverage_Tracker`에 상태 기록
2. 기존 프로젝트 매칭 또는 신규 프로젝트 생성 여부를 판정
3. 프로젝트 허브가 없으면 생성 후보 등록 또는 실제 생성
4. `Sources.md`에 문서 provenance 등록
5. `Evidence_Log.md`에 원문 발췌 추가
6. `Conflict_Register.md`에 상충값 등록
7. `Change_Log.md`에 이번 배치 작업 기록
8. 신규 프로젝트 생성 시 `index.md`, `Common/hub.md`, `log.md`, `L1_memory`를 함께 갱신

## 권장 실행 리듬

- 1회 실행당 Drive 1개
- 1회 실행당 폴더 1~3개
- 1회 실행당 파일 20~50개
- 1회 실행당 대표본 최대 3개
- 긴 문서는 extract 후 다음 실행에서 정제
- 매 실행 종료 시 반드시 상태 기록

## 연결 문서

- [[Wiki/Common/Drive_Wikify_Automation_Loop]]
- [[Wiki/Common/Drive_Wikify_Coverage_Tracker]]
- [[Wiki/Common/Drive_Wikify_Model_Prompt_Set]]
- [[Wiki/Common/Wiki_Ingest_Operating_Model]]
- [[Wiki/Common/Wiki_Ingest_Templates]]
- [[Wiki/Schema]]
