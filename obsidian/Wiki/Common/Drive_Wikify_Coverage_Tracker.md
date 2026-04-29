---
type: knowledge
created: 2026-04-29
updated: 2026-04-29
source: "Batch queue tracker for Google Drive wikify work"
---

# Drive Wikify Coverage Tracker

구글 드라이브 전수 위키화 작업의 배치 큐, 커서, 상태를 남기는 문서다.

## 사용 규칙

- 폴더 하나를 잡으면 먼저 이 문서에 등록한다.
- 끝나지 않은 항목은 삭제하지 않는다.
- 상태만 바꾸고, 메모와 다음 액션을 append 한다.
- 같은 폴더를 다시 볼 때는 새 줄을 만들지 말고 기존 항목을 갱신한다.

## 상태값

- `queued`: 아직 시작 전
- `running`: 현재 배치 실행 중
- `done`: 위키 반영 완료
- `hold`: 관련성 또는 맥락 추가 확인 필요
- `retry`: quota, 형식, fetch 실패로 재시도 필요
- `expanded`: 하위 폴더로 작업이 확장됨

## Drive Queue

| Drive | Folder Path | Current Status | Last Cursor | Primary Candidate | Wiki Target | Last Checked | Next Action | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `2026년도 전자부품산업기술개발` | `/` | `expanded` | `root -> 0. 최종_제출서류` | `0. 최종_제출서류` | `Common/ 또는 프로젝트 허브 결정 필요` | `2026-04-29` | `0. 최종_제출서류` 하위에서 대표 기관 폴더와 대표본 문서 선별 | 루트에서 `2. 회의록`, `0. 최종_제출서류`, `1. 지원`, 스프레드시트 2건 확인 |
| `2026년도 전자부품산업기술개발` | `/0. 최종_제출서류` | `expanded` | `기관 폴더 5개 + 총괄 스프레드시트 fetch` | `루트 총괄 스프레드시트`, `1. 알티엠`, `1. (필수)연구개발계획서` | `Common/RTM_GovRnD_2026_PSK_디지털혁신중견기업육성사업` | `2026-04-29` | 기관별 실제 본문 계획서 또는 통합본 추가 fetch, 예산 총액 불일치 재검증 | 총괄 시트에서 참여기관/체크리스트/예산표/역할분담 확인, 총액 상충 후보 존재 |
| `산업현장문제해결형산업AI에이전트기술개발(R&D)` | `/` | `queued` | `root` | 미정 | `Common/ 또는 프로젝트 허브 결정 필요` | `2026-04-29` | 루트 하위 폴더 5~20개 목록화 | Shared Drive 확인 완료 |

## Batch Record Template

```markdown
### Batch - 2026-04-29 14:00
- Drive:
- Folder Path:
- Status Before:
- Status After:
- Files Seen:
- Primary Candidate:
- Secondary Candidates:
- Wiki Target:
- Added Sources:
- Added Evidence:
- Added Conflicts:
- Next Action:
- Notes:
```

### Batch - 2026-04-29 15:00
- Drive: `2026년도 전자부품산업기술개발`
- Folder Path: `/`
- Status Before: `queued`
- Status After: `expanded`
- Files Seen: 루트 기준 5개
- Primary Candidate: `0. 최종_제출서류`
- Secondary Candidates: `2. 회의록`, `1. 지원`
- Wiki Target: `Common/ 또는 관련 정부과제 허브`
- Added Sources: 없음
- Added Evidence: 없음
- Added Conflicts: 없음
- Next Action: `0. 최종_제출서류` 내부 대표 폴더와 대표 문서를 선별
- Notes: 스프레드시트 2건은 운영/관리 문서일 가능성이 높아 후순위

### Batch - 2026-04-29 15:05
- Drive: `2026년도 전자부품산업기술개발`
- Folder Path: `/0. 최종_제출서류`
- Status Before: `queued`
- Status After: `expanded`
- Files Seen: 하위 폴더 5개
- Primary Candidate: `1. 알티엠`, `1. (필수)연구개발계획서`
- Secondary Candidates: `2. S2W`, `3. ETRI`, `4. 성균관대학교`
- Wiki Target: `Common/RTM_GovRnD_* 또는 관련 프로젝트 허브`
- Added Sources: 없음
- Added Evidence: 없음
- Added Conflicts: 없음
- Next Action: `1. 알티엠` 또는 `1. (필수)연구개발계획서` 내부 문서를 열어 대표본 1건 fetch
- Notes: 기관별 제출 패키지와 필수 계획서 폴더가 분리된 제출 구조로 보임

### Batch - 2026-04-29 15:15
- Drive: `2026년도 전자부품산업기술개발`
- Folder Path: `/`
- Status Before: `expanded`
- Status After: `expanded`
- Files Seen: 루트 총괄 스프레드시트 1건 fetch
- Primary Candidate: `2026년도 전자부품산업기술개발` 스프레드시트
- Secondary Candidates: `0. 최종_제출서류` 하위 기관 폴더
- Wiki Target: `Common/RTM_GovRnD_2026_PSK_디지털혁신중견기업육성사업`
- Added Sources: 페이지 내 update block으로 스프레드시트 provenance 기록
- Added Evidence: 참여기관, 문서 작성 분담표, 제출서류 체크리스트, 예산표 핵심 메모 반영
- Added Conflicts: 예산 총액 `5,253,730` vs `5,247,139/5,237,139` 상충 후보 메모
- Next Action: 기관별 실제 계획서 원문 또는 통합본 fetch 후 예산/역할/범위 본문 대조
- Notes: `1. (필수)연구개발계획서` 폴더는 현재 비어 보였고, 총괄 시트가 실질 운영 허브 역할을 함

## Representative Selection Notes

대표본 선정 시 함께 남길 메모:

- Shared Drive 이름
- 상위 폴더
- 상상위 폴더
- 파일명 최종성 표현 여부
- 버전 표기
- 수정일
- 문서 유형 적합성
- 내용 완결성 여부

## Retry Rules

- `retry`가 2회 이상이면 대량 탐색을 멈추고 원인 분류를 먼저 적는다.
- quota 원인이면 다음 실행은 검색보다 폴더 direct listing 위주로 바꾼다.
- 형식 원인이면 `rhwp` 또는 로컬 변환으로 우회한다.

## 연결 문서

- [[Wiki/Common/Drive_Wikify_Batch_Operating_Model]]
- [[Wiki/Common/Drive_Wikify_Model_Prompt_Set]]
- [[Wiki/Common/RTM_Government_RnD_Folder_Coverage_Tracker]]
