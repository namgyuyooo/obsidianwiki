---
type: knowledge
created: 2026-04-30
updated: 2026-04-30
source: "Reference_Register URL restoration sweep"
---

# Reference Link Restoration Queue

## 목적

- `Reference_Register`에 이미 파일명과 경로 fallback은 있으나 실제 URL이 비어 있는 항목을 한곳에 모아 관리한다.
- 로컬에서 바로 복원 가능한 링크와, Slack/Drive 재조회가 필요한 링크를 구분한다.

## 현재 상태

- URL 미복원 항목: `96건`
- 유형별 현황:
  - `Google Drive`: `50건`
  - `Slack`: `40건`
  - `Local File`: `3건`
  - `Other`: `1건`
  - `이미지`: `1건`
  - `설명 텍스트`: `1건`

## 커넥터 상태

- `2026-04-30` 기준 `Slack`, `Google Drive` 커넥터 모두 `token_expired`로 실시간 재조회 실패
- 따라서 현재 큐는 `로컬 raw export`, `기존 Wiki source note`, `원격 폴더 분류`, `Drive 후보 근거`를 먼저 보강한 상태다.
- 우회 수집 경로:
  - `Slack`: `automation/drive_wikify/src/drive_wikify/slack_collector.py` SSL fallback 보강 후 `slack-channels`, `slack-collect --dry-run` 동작 확인
  - `Google Drive`: `rclone lsf`, `drive_wikify.cli rclone-copy`로 타겟 폴더의 파일 실재와 파일명을 검증
- 현재 확인된 시스템 상태:
  - `#sales_team` (`C08PPRAS00P`): `last_collected_at=2026-04-30T03:53:56.467526+00:00`, raw export 확보, filter 단계는 `http_429 insufficient balance`
  - `#경동나비엔` (`C0ATZJWHG82`): `last_collected_at=2026-04-30T03:35:27.248712+00:00`, `message_count=8`, `filtered_message_count=3`
- 재인증 뒤 가장 먼저 할 일:
  - `Slack`: `#sales_team` channel id `C08PPRAS00P` 기준 스레드 permalink와 첨부 permalink 복원
  - `Google Drive`: 대표본 파일명 기준 `fileId`와 `webViewLink` 재조회

## 복원 원칙

- `Google Drive`:
  - 본문 또는 source 문서에 `file id`가 있으면 `https://drive.google.com/open?id=...` 형태로 우선 복원
  - `file id`가 없으면 Drive 분류, 파일명, fetch 기록을 기준으로 후속 재조회
- `Slack`:
  - 현재 위키에는 permalink가 거의 없으므로 채널명, 스레드명, 첨부명 기준으로 후속 복원
  - 가능하면 `slack-wiki-evidence-ingest` 또는 Slack 원문 재조회 때 permalink를 함께 저장
- `Local File`:
  - 절대 경로 접근이 가능한 경우 로컬 경로를 유지
  - 외부 공유가 필요한 문서는 Drive 또는 첨부 원본 링크로 승격

## 1차 우선 복원 대상

- `Common/RTM_YNG_*` 계열 중 `Google Drive` 참조:
  - 프로젝트 실행/제안서/보고서 대표본이 많아 복원 가치가 높다.
- `Sawnics_ManufacturingAI_Project`:
  - `#sales_team` 스레드 첨부와 로컬 보고서 재구성본이 함께 있어 permalink 복원 효과가 크다.
- Slack 프로젝트 허브 전반:
  - 현재는 채널명 fallback 중심이라, permalink만 추가돼도 탐색성이 크게 올라간다.

## 현재 남은 대표 미복원 예시

### Slack

- `[[Wiki/Sawnics_ManufacturingAI_Project/Reference_Register]]`
  - `#sales_team 쏘닉스 스레드`
  - `SAWNICS_PoC_Report.pdf`
  - `제출서류 양식.zip`
  - 원격 파일명 재확인: `SAWNICS_PoC_Report.pdf`, `sawnics_poc_report.html`, `(필독)...경기테크노파크.pdf`, 개별 양식 파일 4종
- `[[Wiki/AdvancedElectricKorea_Project/Reference_Register]]`
  - `어드벤스일렉트릭코리아 공개 Slack 메시지 묶음`
- `[[Wiki/PSK_Project/Reference_Register]]`
  - `PSK 공개 Slack 메시지 묶음`

### Google Drive

- `[[Wiki/Common/RTM_YNG_산업현장_에이전트_연구개발_Reference_Register]]`
  - `산업현장 에이전트_연구개발계획서_RS-2026-25553046(알티엠).pdf`
  - 원격 파일명 재확인: `2026년 인공지능 기술사업화 지원사업 연구개발계획서_통합_0310.pdf`, `산업현장 에이전트_연구개발계획서_RS-2026-25553046(알티엠).hwp`
- `[[Wiki/Common/RTM_YNG_서울반도체_AI_응용제품_신속_상용화_Reference_Register]]`
  - `1. 사업계획서(도입_서울반도체).pdf`
  - 원격 파일명 재확인: `(양식1) 사업계획서.pdf`, `(양식1) 사업계획서.hwp`, `(양식1) 사업계획서_1.hwp`, `(양식1) 사업계획서_2.hwp`
- `[[Wiki/Common/RTM_YNG_경동나비엔_RTM_Reference_Register]]`
  - `250423_경동나비엔-RTM 과제 제안서 2차_04.pdf`

### Local File

- `[[Wiki/Sawnics_ManufacturingAI_Project/Reference_Register]]`
  - `sawnics_poc_report_config.json`
- `[[Wiki/Common/RTM_YNG_DMT_POC_Reference_Register]]`
  - `상세 결과 시트/라벨링 현황 자료`

## 다음 작업

- Slack permalink 복원:
  - 채널/스레드명 fallback을 기준으로 실제 permalink를 재조회해 `Reference_Register`에 반영
- Google Drive 링크 복원:
  - Drive fetch 기록 또는 source 문서의 `file id`를 추가 발굴해 대표본 URL 채우기
- 자동화 개선:
  - 새 인제스트부터는 `Reference_Register` 생성 시 URL과 fallback을 동시에 기록하도록 프롬프트와 파이프라인을 더 강제
  - 시스템 수집 단계에서는 `last_export_path`, `collection state path`, `원격 폴더 분류`, `대표 파일명`을 기본 카드 속성으로 함께 남기기
