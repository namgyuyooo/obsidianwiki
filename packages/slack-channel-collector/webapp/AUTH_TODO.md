# Account Permissions TODO

## 목표

Slack 수집, GLM 추론, 명함 OCR, 임베딩 재빌드처럼 데이터 전체와 외부 API 비용에 영향을 주는 작업은 계정 기반 권한을 필수로 한다.

## 1차 MVP

- [x] 사용자/역할/권한 테이블 추가
- [x] API 토큰 기반 운영 인증 추가
- [x] 로그인 API와 로그인창 추가
- [x] 현재 사용자/권한 표시
- [x] 사용자 관리 및 역할 변경 화면
- [x] 역할/권한 매트릭스 화면
- [x] `sync.run`, `sync.backfill`, `sync.configure` 권한 분리
- [x] `ai.infer.one`, `ai.infer.batch`, `ai.vision.ocr`, `ai.embedding.rebuild` 권한 분리
- [x] Slack Sync/재클렌징/GLM/OCR/임베딩 API에 백엔드 권한 가드 적용
- [x] 실행 작업을 `job_runs`에 기록
- [x] 프론트에서 운영 API 키를 저장하고 권한 필요 요청에 헤더 전송

## 2차

- [ ] 비밀번호 변경/초기화
- [ ] 세션 만료/로그아웃
- [ ] 변경 이력에 actor 사용자 연결
- [ ] 삭제/병합/일괄 추론 승인 큐
- [ ] 시스템 계정(`system.slack_sync`, `system.ai`) 기반 자동 작업 감사 기록

## 기본 권한

| 권한 | 설명 | 기본 역할 |
| --- | --- | --- |
| `sync.run` | Slack 증분/채널 수집 실행 | manager, admin |
| `sync.backfill` | 전체 히스토리 수집/재클렌징 | admin |
| `sync.configure` | 수집 채널/주기/콜백 설정 변경 | admin |
| `ai.infer.one` | 단건 GLM 추론/구조화 | manager, admin |
| `ai.infer.batch` | 일괄 GLM 자동추정 | admin |
| `ai.vision.ocr` | 명함 Vision OCR | manager, admin |
| `ai.embedding.rebuild` | 임베딩 재빌드 | admin |
| `slack.raw.apply` | Slack 원문 수동 반영/보관 상태 변경 | manager, admin |
| `audit.rollback` | 변경 이력 되돌리기 | manager, admin |
