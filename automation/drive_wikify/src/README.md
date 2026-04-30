# Drive Wikify Source

실제 Drive 위키화 러너 코드는 이 디렉터리에 둔다.

## 현재 구현 모듈

- `cli`
- `config`
- `manifest_builder`
- `rclone_sync`
- `runner`
- `cleanup`
- `project_decider`
- `wiki_writer`
- `wiki_maintenance`
- `slack_collector`
- `extractors/hwp_hwpx`
- `extractors/pdf`
- `extractors/docx`
- `extractors/pptx`

## 책임

- `config/.env`를 주 설정 소스로 읽을 것
- 원본 Google Drive 삭제를 금지할 것
- `rclone copy` 기반의 보수적 mirror 수집만 지원할 것
- Slack은 읽기 전용 API 수집만 허용하고, raw export를 `obsidian/raw/exports/slack` 아래에 보존할 것
- `rhwp`, `pdf`, `docx`, `pptx` 모두에서 본문과 구조를 추출할 것
- 기존 프로젝트와 비교하여 `업데이트` vs `신규 프로젝트 생성` vs `프로젝트 분기`를 판단할 것
- 신규 프로젝트가 필요하면 위키 기본 문서와 `L1_memory`까지 생성할 것
- 위키 변경이 발생하면 sparse 검색 인덱스와 전역 그래프/네비게이션 산출물을 재생성할 것
- 검증이 통과한 파일만 `local mirror`에서 삭제할 것

## Slack 수집 명령

- `python -m drive_wikify.cli slack-channels --json`
- `python -m drive_wikify.cli slack-collect --channel sales_team --channel pjt_zeus_ai바우처 --json`

Slack 수집은 위키 반영을 바로 수행하지 않는다. 먼저 raw export와 상태 파일을 남기고, 이후 `Sources.md`, `Evidence_Log.md`, `Conflict_Register.md`, `Change_Log.md`로 승격하는 후속 단계에서 해석/검수한다.

## 남은 보강 포인트

- `hwp` 직접 추출 품질 향상
- 청크 요약 자체의 저장 구조 강화
- 다중 job 또는 다중 root 수집 구성
