---
type: knowledge
created: 2026-04-30
updated: 2026-04-30
source: "2026-04-30 link-first wiki restructuring"
---

# Wiki Reference Operating Model

## 목적

- 위키에 모든 내용을 복제하지 않고도 다시 찾아갈 수 있는 운영 구조를 만든다.
- 요약은 남기되, 어디에 설명되어 있고 어떤 문서를 열어봐야 하는지, URL이 무엇인지, 링크가 어려우면 어떤 파일명을 찾아야 하는지를 남긴다.

## 기본 원칙

- `Reference_Register.md`를 참조의 단일 진입점으로 본다.
- 링크는 `Slack 링크 -> 웹 링크 -> Google Drive 링크 -> 로컬 경로 -> 파일명 fallback` 순서로 우선한다.
- 임시 수집 산출물인 `mirror path`는 영구 참조값으로 남기지 않는다.
- Slack은 `channel id`, `last_export_path`, `collection state path`, 스레드/첨부명으로 다시 찾을 수 있게 남긴다.
- Google Drive는 `Shared Drive 이름`, `상위/상상위 폴더`, `대표 파일명`, `file id` 또는 `webViewLink`를 우선 남긴다.
- 본문 위키는 판단과 운영을 위한 요약만 유지하고, 상세 원문 복제는 최소화한다.
- `Sources.md`는 상세 출처 메모, 레거시 source notes, 원문 보존 메타가 필요할 때만 보조적으로 사용한다.
- `Evidence_Log.md`는 실제로 읽은 문장, 수치, 인용, 해석을 남기는 문서다. 링크 레지스터를 대신하지 않는다.

## 참조 항목 최소 필드

- 제목
- 참조 유형
- URL
- fallback 파일명
- fallback 경로
- 재수집 식별자
- 설명 위치
- 관련 위키 문서
- 읽기 상태

## 금지 기준

- 임시 로컬 mirror 경로를 `Reference_Register`의 장기 fallback으로 남기지 않는다.
- 나중에 삭제될 수 있는 캐시/임시 복제 경로를 대표 참조로 취급하지 않는다.

## 언제 어떤 문서에 남기나

- 다시 열어봐야 할 링크와 파일명:
  - `Reference_Register.md`
- 실제로 읽은 내용과 발췌:
  - `Evidence_Log.md`
- 상태, 단계, 막힘:
  - `Status.md`
- 실행 큐:
  - `Action_Items.md`
- 확정 판단:
  - `Decisions.md`
- 상세 원문 출처 메모:
  - `Sources.md`

## 운영 효과

- 위키가 모든 내용을 담지 않아도 탐색성이 유지된다.
- 링크가 끊겨도 파일명 fallback이 남는다.
- LLM이 답할 때 “어디에 설명되어 있는지”와 “무엇을 다시 열어봐야 하는지”를 함께 제시하기 쉬워진다.

## 연결 문서

- [[Wiki/Common/Wiki_Ingest_Operating_Model]]
- [[Wiki/Common/Wiki_Ingest_Templates]]
- [[Wiki/Common/Wiki_Ingest_Prompt_Set]]
