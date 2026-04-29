# Runtime State

이 디렉터리는 자동화 실행 중 생성되는 커서, 잠금 파일, manifest, run output, deletion log, sparse 검색 인덱스, 그래프 스냅샷을 두는 위치다.

- Git에 꼭 남겨야 하는 템플릿이나 설명만 보관한다.
- 실제 실행 중 생성되는 임시 파일은 필요 시 `.gitignore`로 제외한다.
- 자동 정리는 원본 Google Drive가 아니라 여기의 `local mirror` 파일에만 적용한다.
