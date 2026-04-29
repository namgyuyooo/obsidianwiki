# Source Placeholder

실제 Drive 위키화 러너 코드는 이 디렉터리에 둔다.

예상 모듈:

- `collector`
- `extractors/hwp_hwpx`
- `extractors/pdf`
- `extractors/docx`
- `extractors/pptx`
- `triage`
- `project_decider`
- `manifest_builder`
- `rclone_sync`
- `wikifier`
- `validator`
- `restructure`
- `scheduler`

필수 책임:

- `rhwp`, `pdf`, `docx`, `pptx` 모두에서 본문과 구조를 추출할 것
- 기존 프로젝트와 비교하여 `업데이트` vs `신규 프로젝트 생성` vs `프로젝트 분기`를 판단할 것
- 신규 프로젝트가 필요하면 위키 기본 문서와 `L1_memory`까지 생성할 것
