---
type: knowledge
created: 2026-04-29
updated: 2026-04-29
source: "Closed-loop automation design for collect -> wiki -> log -> validate -> restructure -> wait"
---

# Drive Wikify Automation Loop

`오픈클로`를 배치 실행 오케스트레이터로 두고, 구글 드라이브 기록을 반복적으로 위키화하는 자동 루프를 정의한다.

## 결론

가능하다. 다만 `오픈클로`는 아래 역할로 쓰는 것이 좋다.

- 상태 머신 실행기
- 배치 단위 작업 분배기
- 모델 호출 오케스트레이터
- 위키 규칙 검수기
- 다음 수집 대기 스케줄러

반대로 아래는 오픈클로에 직접 몰아주지 않는 편이 좋다.

- 무제한 Drive 전수 fetch
- 대용량 바이너리 직접 해석
- 위키 규칙 없는 자유 서술

핵심 운영 원칙:

- Google Drive는 rate limit 오류가 비교적 흔하므로, 빠른 완료보다 재개 가능한 배치 처리를 우선한다.
- LLM에는 파일 전체를 한 번에 넣지 않고, 청크 -> 파일 -> 프로젝트 순서로 승격한다.

## 코드 위치 원칙

- 자동화 실행 코드는 `obsidian/Wiki/` 아래에 두지 않는다.
- 실행 코드는 리포지토리의 별도 작업공간인 `automation/drive_wikify/` 아래에 둔다.
- `obsidian/Wiki/Common/Drive_Wikify_*.md` 문서는 실행 코드가 아니라 설계서와 실행 기록의 기준 문서다.
- 실제 커서, 락, 임시 상태는 `automation/drive_wikify/runtime/` 아래에서 관리한다.
- 주 설정은 `automation/drive_wikify/config/.env`에 모은다.
- 원본 Google Drive는 절대 삭제하지 않고, 자동 정리는 `local mirror`에만 적용한다.

## 자동 루프

```text
[WAIT]
  -> [COLLECT]
  -> [TRIAGE]
  -> [WIKIFY]
  -> [LOG]
  -> [VALIDATE]
  -> [RESTRUCTURE]
  -> [READY_TO_SLEEP]
  -> [WAIT]
```

예외 흐름:

- quota 발생: `COLLECT -> RETRY_WAIT`
- 문서 파싱 실패: `WIKIFY -> HOLD`
- 규칙 위반: `VALIDATE -> RESTRUCTURE`
- 충돌 과다: `VALIDATE -> HOLD`

## 상태별 정의

### 1. WAIT

대기 상태다.

- 입력:
  - 큐 문서
  - 마지막 실행 시각
  - 재시도 예정 항목
- 조건:
  - 새 배치 시작 시각 도달
  - 또는 사람이 특정 폴더/프로젝트를 지시
- 출력:
  - 다음 배치 대상 1~3개

### 2. COLLECT

Drive 커넥터로 작은 범위만 수집한다.

- 입력:
  - 대상 Drive
  - 폴더 경로
  - 마지막 커서
- 수행:
  - 폴더 direct listing
  - 필요 시 검색 보조
  - 메타데이터 수집
  - 파일 형식별 추출 가능 여부 판정
- 출력:
  - 파일 후보 목록
  - 폴더 맥락
  - 수정일/형식 정보
  - 다음 배치에 넣을 파일 20~50개

### 3. TRIAGE

메타데이터만으로 대표본 후보를 정한다.

- 권장 모델:
  - `GLM`
- 입력:
  - Shared Drive 이름
  - 상위 폴더 경로
  - 파일명
  - 형식
  - 수정일
- 출력:
  - `primary`
  - `secondary`
  - `hold`
  - `skip`
  - `existing_project_match`
  - `new_project_candidate`
  - `branch_needed`

### 4. WIKIFY

대표본과 비교본을 읽고 위키 초안으로 승격한다.

- 권장 모델:
  - `오픈클로`
- 수행:
  - `rhwp`, `pdf`, `docx`, `pptx`를 포함한 다형식 원문 추출
  - 파일을 8,000~15,000자 청크로 분할
  - 청크별 요약 생성
  - 청크 요약을 파일 요약으로 승격
  - 원문 발췌
  - 수치/결정/제약/충돌 추출
  - 기존 프로젝트와 내용 중복 여부 비교
  - 프로젝트 신규 생성 또는 분기 필요성 추출
  - `Sources`, `Evidence_Log`, `Conflict_Register`, `Change_Log` 초안 작성
- 출력:
  - 위키 append 블록
  - 문서 메모
  - 프로젝트 반영 대상 목록
  - 신규 프로젝트 생성 초안 또는 기존 프로젝트 업데이트 초안
  - 청크 요약 묶음
  - 파일 요약 묶음

### 5. LOG

이번 실행 결과를 append-only로 남긴다.

- 갱신 대상:
  - `[[Wiki/log]]`
  - `[[Wiki/Common/Drive_Wikify_Coverage_Tracker]]`
  - 프로젝트 `Change_Log.md`
- 출력:
  - 처리 폴더
  - 처리 문서 수
  - 대표본 선정 결과
  - 실패/보류 사유

### 6. VALIDATE

위키 규칙, 충돌, 구조 누락을 점검한다.

- 점검 항목:
  - `Sources`, `Evidence_Log`, `Conflict_Register`, `Change_Log` 누락 여부
  - 해석과 원문 분리 여부
  - 수치의 출처 문서명/날짜 존재 여부
  - 충돌값 등록 여부
  - 허브 링크 누락 여부
  - frontmatter 존재 여부
  - 신규 프로젝트가 필요한데 기존 프로젝트에 잘못 흡수되지 않았는지
  - 동일 프로젝트인데 불필요하게 중복 프로젝트가 생성되지 않았는지
- 출력:
  - `pass`
  - `fix_required`
  - `hold_for_human_review`

### 7. RESTRUCTURE

검수 결과를 바탕으로 링크, 허브, 공통/프로젝트 분리를 다시 정리한다.

- 수행:
  - 공통 지식으로 승격할 항목 이동
  - 프로젝트 허브 링크 보강
  - 고아 문서 연결
  - 중복 문서 정리
  - 신규 프로젝트 위키 생성
  - 동일 계정 하위 프로젝트 분기
  - 계정 허브와 프로젝트 허브 관계 재정렬
- 출력:
  - 구조 수정 블록
  - 후속 수집 우선순위 조정

### 8. READY_TO_SLEEP

다음 수집 전 상태를 안정화한다.

- 수행:
  - 큐 상태 갱신
  - 다음 배치 예약
  - 실패 항목 재시도 간격 설정
- 출력:
  - 다음 배치 시각
  - 다음 폴더 후보
  - 남은 hold/retry 목록

## 오픈클로가 맡기 좋은 것

- 위 상태 전이를 순서대로 강제하기
- 각 단계별 입력/출력 스키마 유지하기
- 실패하면 같은 단계 재실행 대신 `retry`로 넘기기
- 긴 문서 위키화 결과를 바로 `validate` 단계에 태우기
- 사람이 없어도 `대기 -> 재개`를 반복하기
- rate limit 이후 같은 속도로 밀어붙이지 않고 더 작은 배치로 줄이기

## 오픈클로만으로 부족한 것

- Drive API quota 제어
- HWP/HWPX 직접 파싱
- 로컬 위키 파일 변경 안전성 보장
- 커넥터 fetch 실패 시 대체 파서 선택

이 부분은 커넥터와 로컬 파서 레이어가 따로 필요하다.

## 권장 오케스트레이션 분담

| 역할 | 담당 |
| --- | --- |
| Drive 목록화/검색/fetch | Google Drive 커넥터 |
| HWP/HWPX 구조 추출 | `rhwp`, unzip, XML/text 추출 |
| PDF 추출 | PDF 추출기 또는 OCR |
| Word 추출 | DOCX 파서 |
| PowerPoint 추출 | PPTX 파서 |
| 메타데이터 분류 | `GLM` |
| 원문 근거 추출 및 위키 초안 | `오픈클로` |
| 프로젝트 신규 생성/분기 판단 | `GLM` + 규칙 엔진 + 필요 시 `오픈클로` |
| 상태 전이와 루프 실행 | `오픈클로` 또는 상위 오케스트레이터 |
| 최종 파일 반영 | 로컬 위키 편집기 또는 에이전트 |

## 자동화 게이트

각 배치는 아래 게이트를 모두 통과해야 다음 상태로 간다.

### Collect Gate

- 폴더 경로 기록됨
- 파일 목록 5개 이상 또는 빈 폴더 판정 완료
- 마지막 커서 저장됨
- 다음 배치 파일 수가 20~50개 이내로 잘렸음

### Wikify Gate

- `rhwp`, `pdf`, `docx`, `pptx` 중 해당 파일 형식의 본문 추출 시도 완료
- 파일별 8,000~15,000자 청크 분할 완료
- 청크 요약 -> 파일 요약 승격 완료
- `Sources` 초안 생성
- `Evidence_Log` 초안 생성
- 필요 시 `Conflict_Register` 후보 생성
- 프로젝트 대상 페이지 결정
- 신규 프로젝트 생성 또는 기존 프로젝트 업데이트 판단 완료

### Validate Gate

- frontmatter 있음
- 출처 빠진 수치 없음
- 원문 없는 결론 없음
- 충돌 등록 누락 없음
- 프로젝트 분기 판단 누락 없음

### Sleep Gate

- 큐 상태 갱신 완료
- 다음 액션 기록 완료
- 실패 항목 분류 완료

## 자동화 입력/출력 계약

### 입력 계약

```yaml
drive_name:
folder_path:
cursor:
max_files:
max_fetch_docs:
target_project:
mode:
allowed_file_types:
project_creation_mode:
chunk_size_min_chars:
chunk_size_max_chars:
```

### 출력 계약

```yaml
status:
processed_files:
primary_candidates:
secondary_candidates:
wiki_pages_updated:
conflicts_added:
validation_result:
next_action:
next_cursor:
project_decision:
branch_decision:
chunk_count:
```

## 추천 실행 주기

- 짧은 주기:
  - 10~30분 간격
  - 폴더 1개씩
  - 파일 20~50개씩
- 중간 주기:
  - 하루 2~4회
  - 폴더 2~3개씩
  - 파일 20~50개씩
- 수동 개입 조건:
  - 같은 폴더가 `retry` 2회 이상
  - 충돌 항목이 5개 이상
  - 프로젝트 허브가 새로 생겨야 하는 경우

## 사람이 최종 승인해야 하는 순간

- 새 프로젝트 공간 생성
- 기존 프로젝트로의 귀속이 불분명
- 상충 수치가 핵심 KPI에 직접 영향
- 같은 문서군의 대표본 선별이 불안정
- 중복처럼 보이지만 분기 여부가 애매한 경우

## 연결 문서

- [[Wiki/Common/Drive_Wikify_Batch_Operating_Model]]
- [[Wiki/Common/Drive_Wikify_Coverage_Tracker]]
- [[Wiki/Common/Drive_Wikify_Model_Prompt_Set]]
- [[Wiki/Common/Wiki_Ingest_Operating_Model]]
