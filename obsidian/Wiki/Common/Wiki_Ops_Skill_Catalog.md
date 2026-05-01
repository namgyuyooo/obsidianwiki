---
type: knowledge
created: 2026-04-29
updated: 2026-04-29
source: "Wiki Ops frontend skill catalog and MCP recommendation pass"
---

# Wiki Ops Skill Catalog

이 문서는 Wiki Ops 운영 화면에 붙인 스킬 카탈로그의 기준 문서다.
목표는 위키를 단순 검색 저장소가 아니라 실제 업무 산출물을 만드는 작업대로 확장하는 것이다.

## 적용 완료

- `보고서 작성용 MD 생성`: 보고서 목적, 핵심 결론, 근거 표, 리스크, 다음 액션을 갖춘 Markdown 초안을 만든다.
- `코딩 작업 스킬`: 기능 구현/버그 수정 작업을 목표, 영향 파일, 테스트, 롤백 기준으로 쪼갠다.
- `근거 검증 스킬`: 수치, 표현, 출처, 충돌 후보를 분리해 검수 체크리스트를 만든다.

생성 위치:

- `automation/wiki_api/runtime/skill_outputs/*.md`

이 위치는 runtime draft이며, 검토 없이 곧바로 위키 본문에 쓰지 않는다.

## 사용 가능 로컬/플러그인 스킬

- `Graphify`: 문서/코드/이미지를 knowledge graph, clustered communities, HTML/JSON/audit report로 변환한다.
- `Documents`: DOCX 작성, 편집, 렌더 검증에 사용한다.
- `Presentations`: PPTX 작성, 수정, 렌더 검증에 사용한다.
- `Spreadsheets`: XLSX/CSV 분석과 표/차트 작업에 사용한다.
- `정부과제 발표평가 발표전략`: 공고문, RFP, 사업계획서, 연구개발계획서, 기존 발표자료, 회의자료를 교차 해석해 평가위원 설득용 발표 논리, 추천 목차, 슬라이드 메시지, 예상 Q&A를 Markdown으로 설계한다.

## MCP 후보

설치형 MCP는 권한 경계가 생기므로 바로 설치하지 않고 후보로만 올린다.

| 후보 | 용도 | 안전 기준 |
| --- | --- | --- |
| GitHub MCP Server | Issue/PR/repo 운영 | token scope 최소화 |
| Microsoft Playwright MCP | 로컬 UI/브라우저 회귀 테스트 | 브라우저 세션/프로필 격리 |
| Filesystem / Fetch MCP | 로컬 파일/웹 근거 읽기 | allowlist와 read-only 우선 |
| Sequential Thinking MCP | 복잡한 판단 구조화 | 패키지 출처/버전 pin 검토 |

## 안전 원칙

- MCP 설치는 별도 승인 후 진행한다.
- 외부 전송, 계정 권한, 로컬 파일 접근이 생기는 MCP는 권한 범위를 먼저 문서화한다.
- 원본 Google Drive 삭제 기능은 어떤 스킬/MCP에도 부여하지 않는다.
- 자동 생성 산출물은 먼저 runtime draft로 만들고, 검토 후 위키에 반영한다.
