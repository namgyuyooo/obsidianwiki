---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "Karpathy LLM Wiki pattern adapted for this vault"
---

# Raw Sources

이 디렉터리는 원문 보존 계층입니다.

- 원본 파일, 클리핑 결과, 첨부 이미지, 내보낸 문서를 보관합니다.
- 기본 원칙은 immutable입니다.
- LLM은 이 계층을 읽을 수 있지만, 위키 문서처럼 덮어써서 정리하지 않습니다.

## Recommended Usage

- 새로 확보한 문서는 먼저 이 계층에 저장합니다.
- 위키 반영 결과는 `[[Wiki/index]]`를 시작점으로 `Wiki/` 아래에서 관리합니다.
- 원문 링크와 파일명은 각 프로젝트의 `Sources.md`에 기록합니다.
- 이미지가 중요하면 로컬 파일도 함께 저장해 재열람 가능하게 유지합니다.

## Typical Subfolders

- `inbox/`: 아직 분류되지 않은 신규 수집물
- `assets/`: 문서에서 내려받은 이미지와 첨부물
- `exports/`: Drive, Slack, 웹 등에서 내보낸 파일

## Connected Pages

- [[Wiki/Schema]]
- [[Wiki/index]]
- [[Wiki/log]]
