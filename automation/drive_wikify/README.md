# Drive Wikify Automation

구글 드라이브 기록을 배치 수집하고, 위키화하고, 검수하고, 재구조화한 뒤 다음 배치를 대기시키는 자동화 작업공간이다.

## 책임 범위

- Drive 수집
- 배치 큐 실행
- 모델 호출 오케스트레이션
- 위키 규칙 검수
- 재시도/대기 상태 관리
- `rclone` 기반의 보수적 로컬 미러링

## 디렉터리

- `config/`: 실행 설정
- `prompts/`: 모델 프롬프트 원본
- `runtime/`: 커서, 임시 산출물, 락, 실행 상태
- `src/`: 실제 러너 코드

## 권장 흐름

1. `rclone copy`로 Shared Drive 또는 폴더를 아주 보수적으로 로컬 mirror에 누적
2. `build-manifest`로 mirror에서 `hwp/hwpx/pdf/docx/pptx` 목록 생성
3. `run`으로 20~50개 파일 배치를 선택
4. 파일별 8,000~15,000자 청크 처리 후 파일 요약 생성
5. 프로젝트 판정, 신규 프로젝트 생성, 위키 반영 수행

기본값은 `sync`가 아니라 `copy`다.
로컬 파일 삭제를 자동화 기본동작에 넣지 않기 위해서다.

기본 throttling도 보수적으로 둔다.

- `--tpslimit 1`
- `--checkers 1`
- `--transfers 1`
- `--bwlimit 1M`

Google Docs 계열은 `--drive-export-formats`에 따라 내려오며, export 시 확장자가 붙는 전제를 사용한다.

LLM 처리 단위도 보수적으로 유지한다.

- 1배치 = 20~50개 파일
- 1파일 = 최대 8,000~15,000자 청크
- 청크 요약 -> 파일 요약 -> 프로젝트 위키 반영

## 주의

- 여기의 코드는 `obsidian/Wiki/`에 두지 않는다.
- 위키 문서는 이 자동화의 설계 문서이자 결과 반영 대상이다.
