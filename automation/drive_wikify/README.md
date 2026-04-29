# Drive Wikify Automation

구글 드라이브 기록을 보수적으로 수집하고, 위키화하고, 검수하고, 다시 이어서 돌리는 자동화 작업공간이다.

## 가장 중요한 안전 규칙

- 원본 Google Drive는 절대 삭제하지 않는다.
- 자동 삭제는 성공 반영 후 `local mirror` 파일에만 적용한다.
- `rclone`은 `sync`나 `purge`가 아니라 `copy`만 사용한다.
- `DRIVE_DELETE_SOURCE`는 항상 `false`여야 하며, `true`면 실행이 즉시 실패한다.
- Google Drive의 `Github`/`GitHub` 폴더와 업로드된 `Obsidian_wiki` 사본은 수집하지 않는다. 위키 자기 자신을 다시 수집하는 순환을 막기 위해 `RCLONE_EXCLUDE_PATTERNS`로 기본 제외한다.

## 설정

주 설정 파일은 `config/.env`다.

- 예시:
  - `config/drive_wikify.example.env`
- 실제 로컬 설정:
  - `config/.env`
- legacy 참고:
  - `config/pipeline.example.yaml`
  - `config/rclone.example.env`

핵심 env 키:

- 위키 런타임:
  - `WIKI_ROOT`
  - `L1_MEMORY_ROOT`
  - `COVERAGE_TRACKER`
  - `LOG_PAGE`
  - `STATE_DIR`
  - `LOCK_FILE`
  - `DELETION_LOG`
  - `AUTO_CREATE_PROJECT_SPACE`
  - `CLEANUP_LOCAL_MIRROR`
- 수집:
  - `RCLONE_REMOTE`
  - `RCLONE_REMOTE_PATH`
  - `RCLONE_MIRROR_ROOT`
  - `RCLONE_BWLIMIT`
  - `RCLONE_TPSLIMIT`
  - `RCLONE_CHECKERS`
  - `RCLONE_TRANSFERS`
  - `RCLONE_EXCLUDE_PATTERNS`
- 배치:
  - `ALLOWED_FILE_TYPES`
  - `MAX_FOLDERS_PER_RUN`
  - `MAX_FILES_PER_FOLDER`
  - `MAX_FETCH_DOCS`
  - `CHUNK_SIZE_MIN_CHARS`
  - `CHUNK_SIZE_MAX_CHARS`

## 권장 흐름

1. `rclone-copy`로 Shared Drive 또는 폴더를 아주 보수적으로 `local mirror`에 누적
2. `build-manifest`로 mirror에서 `hwp/hwpx/pdf/docx/pptx/html` 목록 생성
3. `run`으로 배치를 위키 프로젝트 업데이트에 반영
4. 검증이 통과한 파일만 `local mirror`에서 삭제하고 `deletion_log.jsonl`에 기록

## 실행 예시

```bash
PYTHONPATH=automation/drive_wikify/src \
/Users/rtm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
-m drive_wikify.cli rclone-copy --dry-run
```

```bash
PYTHONPATH=automation/drive_wikify/src \
/Users/rtm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
-m drive_wikify.cli build-manifest
```

```bash
PYTHONPATH=automation/drive_wikify/src \
/Users/rtm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
-m drive_wikify.cli run
```

`--env-file`로 다른 `.env`를 지정할 수 있고, `--config`는 legacy YAML/JSON 호환용이다.

## 기본 운용값

- `rclone copy`
- `--tpslimit 1`
- `--checkers 1`
- `--transfers 1`
- `--bwlimit 1M`
- `--exclude Github/**`
- `--exclude GitHub/**`
- `--exclude Obsidian_wiki/**`
- 1배치 = 20~50개 파일
- 1파일 = 8,000~15,000자 청크
- `청크 요약 -> 파일 요약 -> 프로젝트 위키 반영`

## 산출물

- manifest:
  - `MANIFEST_PATH`
- run output:
  - `RUN_OUTPUT_PATH`
- local mirror deletion log:
  - `DELETION_LOG`

## 형식 지원 상태

- `hwpx`, `pdf`, `pptx`는 실배치에서 usable 수준으로 확인됨
- `html`, `htm` 보고서는 `script/style/svg/canvas`를 제외하고 본문/헤딩 중심으로 추출함
- `hwp`는 현재 fallback 경로 품질 편차가 있어 추가 보강이 필요함
- `docx`는 추출 경로를 지원하지만 이번 실배치 대표 검증에는 아직 포함되지 않았음

## 주의

- 여기의 코드는 `obsidian/Wiki/`에 두지 않는다.
- 위키 문서는 이 자동화의 설계 문서이자 결과 반영 대상이다.
