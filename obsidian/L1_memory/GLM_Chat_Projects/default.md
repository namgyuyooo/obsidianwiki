---
type: auxiliary_chat_project_memory
project_id: "default"
project_name: "기본 업무 챗"
status: "active"
knowledge_role: auxiliary_not_decision
created: 2026-04-29T04:11:08.843Z
updated: 2026-04-29T07:11:13.908Z
source: wiki_api chat_projects.json
---

# GLM Chat Project - 기본 업무 챗

## 지식 성격
- 이 문서는 프로젝트별 GLM 챗 지침, 관리 메모리, 대화 내용을 위키/L1 memory에 보존하기 위한 보조 지식이다.
- 대화내역은 검증/승인된 결정 사항이 아닐 수 있으므로 `보조 맥락`으로만 사용한다.
- 실제 프로젝트 사실, 수치, 결정은 별도 근거 Markdown, Sources, Evidence Log, Change Log, Conflict Register로 승격되어야 한다.

## 프로젝트별 특수 지침
- 없음

## 관리 메모리
- 없음

## 최근 대화내역
### 1. user · 2026-04-29T04:18:52.355Z

> Paperclip은 이 프로젝트에서 어떤 역할로 써야 해? 짧게 정리

### 2. assistant · 2026-04-29T04:18:52.357Z

> **1) 현재 업무상태**
> 현재 구글 드라이브에 흩어진 정부 R&D 과제 및 사업 계획서 자료를 로컬 Obsidian 위키로 구조화하여 수집하고 정리하는 'Drive Wikify' 파이프라인 구축 작업이 진행 중입니다.
> 
> **2) 진행/완료**
> *   **진행:** Google Drive 배치 수집이 67% 진행되었으며, `전자부품산업기술개발` Drive의 최종 제출 서류 폴더까지 확장(expanded) 완료했습니다.
> *   **완료:** 프로젝트 코어 지식(서술 가이드, 역할 가이드, 어필 은행, 근거 로그) 위키화가 완료되어 향후 제안서 작성 시 즉시 재사용할 수 있는 템플릿/자산이 확보되었습니다.
> 
> **3) 리스크/충돌**
> *   **수집 지연:** Paperclip 에이전트 연결(fetch failed)이 실패하여 자동화 파이프라인이 대기 중입니다. 최근 시도한 OpenClaw 자동화 트리거 역시 실패했습니다.
> *   **데이터 불일치:** 일부 Drive 내 예산 총액 및 기관별 항목에서 불일치가 확인되어 재검증이 필요합니다.
> 
> **4) 다음 액션**
> *   수집이 지연되고 있는 `산업현장문제해결형산업AI에이전트기술개발(R&D)` Drive 루트 폴더의 하위 목록(5~20개)을 수동으로 확인하고 위키에 업데이트합니다.
> *   Paperclip/OpenClaw 연결 이슈 원인을 파악하기 전까지, `Drive Collector` 에이전트를 사용해 `전자부품산업기술개발`의 기관별 대표 계획서를 안전하게 작은 배치 단위로 수동 fetch 합니다.
> 
> **5) 근거**
> *   `obsidian/Wiki/Common/Drive_Wikify_Batch_Operating_Model.md` (배치 운영 기준)
> *   `obsidian/Wiki/Common/RTM_YNG_Evidence_Log_2026-04-21.md` (검증된 핵심 근거)

## 승격 규칙
- 대화 중 나온 사실은 원문 근거가 확인되기 전까지 확정 지식으로 쓰지 않는다.
- 사용자가 결정하거나 근거 문서로 확인된 내용만 프로젝트 위키 본문 또는 Evidence Log로 승격한다.
- 서로 다른 대화에서 충돌하는 내용은 Conflict Register 후보로 남긴다.