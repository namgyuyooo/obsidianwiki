# Wiki RAG Module Purpose

이 패키지는 Obsidian 스타일 Markdown 위키를 다른 제품의 지식 검색/응답 계층으로 재사용하기 위한 읽기 전용 RAG 모듈입니다.

## 무엇을 포함하나

- Markdown 파일 재귀 인덱싱
- YAML frontmatter, 제목, heading, wikilink 추출
- 한국어/영어 혼합 sparse 검색
- 근거 문서 종류별 가중치: hub, Evidence_Log, Conflict_Register, L1 memory 등
- `[[wikilink]]`와 Markdown 링크 기반 1-hop 그래프 확장
- LLM 입력용 압축 context card 생성
- OpenAI-compatible chat completion을 통한 선택적 답변 생성
- 작은 HTTP 서버: `/search`, `/context`, `/answer`, `/page`, `/refresh`

## 무엇을 제외하나

- Google Drive/Slack 수집
- 문서 변환, HWP/PDF/PPTX 추출
- 위키 파일 쓰기, 승격, 병합, 삭제
- 사용자별 상태 관리와 승인 큐
- 기존 제품의 프론트엔드/운영 콘솔

## 설계 의도

다른 프로덕트에서는 보통 “위키를 어떻게 수집할지”보다 “이미 있는 위키를 안전하게 어떻게 검색하고 LLM 근거로 압축할지”가 먼저 필요합니다. 그래서 이 모듈은 기본값을 읽기 전용으로 고정하고, 검색/컨텍스트/답변 경계만 제공합니다.
