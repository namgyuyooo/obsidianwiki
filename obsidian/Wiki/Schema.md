---
type: schema
created: 2026-04-20
updated: 2026-04-20
source: ""
---

# Wiki Schema

이 파일은 이 Obsidian 위키에서 사용하는 규칙과 스키마를 정의합니다.

- 모든 페이지는 YAML 프런트매터(frontmatter)를 포함해야 합니다.
  - `type`: entity, project, process, knowledge, hub, schema 중 하나입니다.
  - `created`: ISO 8601 형식(YYYY-MM-DD)의 생성일입니다.
  - `updated`: ISO 8601 형식의 마지막 업데이트일입니다.
  - `source`: 원본 자료나 참고 링크를 기록합니다.
- 링크는 `[[Wiki/Namespace/Page]]` 형식으로 작성합니다.
- 허브(hub) 페이지는 해당 네임스페이스의 하위 페이지 목록을 포함합니다.
- 모든 페이지는 적어도 하나의 들어오는 링크와 나가는 링크를 갖도록 노력합니다.
- 민감한 자격증명(비밀번호, 토큰 등)은 wiki에 저장하지 않습니다.
