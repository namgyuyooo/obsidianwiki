# Wiki Ops Innovation Plan

## 목표

위키를 자료 저장소가 아니라 CEO/PM이 바로 의사결정할 수 있는 실무 운영 시스템으로 전환한다. 핵심은 수집, 원문 보존, 상태 변화 기록, 중복/충돌 탐지, 병합 전략, 사용자 승인, LLM 채팅 활용까지 한 흐름으로 묶는 것이다.

## TODO

- [x] 운영형 위키 컨버팅 기준 추가
  - 프로젝트 허브를 운영 앵커로 사용
  - `Status.md`, `Business_Flow.md`, `CEO_Brief.md`, `PM_Action_Plan.md`, `Customer_Followup.md`, `Raw_Evidence_Index.md` 생성/연결
  - 파일 원문을 요약으로 대체하지 않는 원칙 적용

- [x] 위키 관리 LLM 명령에 운영형 변환 작업 추가
  - `business_ops_conversion` 계획 타입
  - Decision Queue 승인 후보 생성
  - 원문 보존 레이어와 운영 판단 레이어 분리

- [ ] 신규 데이터 변화 메모 표준화
  - 형식: `YYYY-MM-DD HH:mm 데이터/근거 수집으로 [상태 변화]가 기록되었고 [후속 액션]이 수행/대기됨`
  - `Status.md`, `Business_Flow.md`, `Change_Log.md`, `Raw_Evidence_Index.md`에 append
  - Slack/Drive/File/Paperclip/GLM 채팅 입력 모두 동일한 event memo로 남김

- [ ] Decisions 탭 전체 위키 유사도 스캔
  - 주요 태그, 키워드, 프로젝트명, 고객명, 파일명, 핵심 수치, 일정, 그래프 이웃을 사용
  - 유사 문서/중복 문서/충돌 가능 문서 후보 생성
  - 후보별 병합 전략과 보류 사유 제안

- [ ] 병합 전략 리스트 기반 사용자 액션
  - Decision Queue 카드로 등록
  - 병합안 생성
  - 보류/추가조사/승인 반영
  - 적용 후 상태 변화 메모 자동 append

- [ ] LLM 채팅 활용 흐름 연결
  - 채팅 답변이 프로젝트 허브의 `Status`, `CEO_Brief`, `PM_Action_Plan`, `Decision Queue`, `Raw_Evidence_Index`를 우선 검색
  - 근거 부족 시 확인해야 할 원문 경로를 반환
  - 확정 지식 반영은 승인 게이트를 통과

## 운영 원칙

- 원문은 보존하고, 요약은 색인과 의사결정 보조 레이어로만 사용한다.
- LLM 판단은 확정 사실이 아니라 검토 후보로 취급한다.
- 충돌이 없다는 판단도 근거와 함께 기록한다.
- 모든 변화는 일시, 원천, 수행 내용, 상태 변화, 다음 액션이 남아야 한다.
