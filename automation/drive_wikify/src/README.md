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
- `extractors/hwp_hwpx`
- `extractors/pdf`
- `extractors/docx`
- `extractors/pptx`

## 책임

- `config/.env`를 주 설정 소스로 읽을 것
- 원본 Google Drive 삭제를 금지할 것
- `rclone copy` 기반의 보수적 mirror 수집만 지원할 것
- `rhwp`, `pdf`, `docx`, `pptx` 모두에서 본문과 구조를 추출할 것
- 기존 프로젝트와 비교하여 `업데이트` vs `신규 프로젝트 생성` vs `프로젝트 분기`를 판단할 것
- 신규 프로젝트가 필요하면 위키 기본 문서와 `L1_memory`까지 생성할 것
- 검증이 통과한 파일만 `local mirror`에서 삭제할 것

## 남은 보강 포인트

- `hwp` 직접 추출 품질 향상
- 청크 요약 자체의 저장 구조 강화
- 다중 job 또는 다중 root 수집 구성
