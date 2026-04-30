---
type: evidence
created: 2026-04-21
updated: 2026-04-30
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Evidence Log

## 운영 원칙
- 이 문서는 원문 근거, 수치, 발췌, 제약 조건을 남기는 핵심 근거 로그입니다.
- 해석과 원문을 섞지 않고, 중요한 수치에는 출처 문서명과 날짜를 함께 남깁니다.
- 충돌 가능성이 보이면 즉시 [[Wiki/KumhoTire_CMS_Project/Conflict_Register]]에 연결합니다.

## 활용 연결
- 참조 레지스터: [[Wiki/KumhoTire_CMS_Project/Reference_Register]]
- 상태 레지스터: [[Wiki/KumhoTire_CMS_Project/Status]]
- 실무 판단: [[Wiki/KumhoTire_CMS_Project/Decisions]]
- 실행 항목: [[Wiki/KumhoTire_CMS_Project/Action_Items]]
- 리스크: [[Wiki/KumhoTire_CMS_Project/Risks]]

## 기존 정리 메모
## 2026-04-21 / Public Slack Evidence Sweep

### Evidence 01
- Source: Slack Message
- Channel: #pjt_금호타이어_cms
- Date: 2025-12-18
- Thread: 없음
- Topic: 배포 주요 변경 사항
- Type: 변경
- Original:
  > PL1H 추가
  > CENTER_LINE 추가
  > HBW1, 2 시각화 개선
  > 폰트 크기 수정
- Interpretation:
  - CMS 프로젝트는 모델 추론만이 아니라 시각화 기준과 UI 가독성까지 포함해 배포 개선이 진행됐다.
- Linked Pages:
  - [[Project_Overview]]
  - [[Change_Log]]

### Evidence 02
- Source: Slack File
- Channel: #pjt_금호타이어_cms
- Date: 2025-12-18
- Thread: 없음
- Topic: 배포 결과 파일
- Type: 변경
- Original:
  > 20251218_배포시각화_result.zip
- Interpretation:
  - 2025년 말 기준 배포 결과 산출물이 별도 압축파일로 관리됐다.
- Linked Pages:
  - [[Project_Overview]]
  - [[Change_Log]]

### Evidence 03
- Source: Slack Message
- Channel: #pjt_금호타이어_cms
- Date: 2026-04-15
- Thread: 없음
- Topic: 배포 후 테스트 결과
- Type: 결정
- Original:
  > 금일 진행된 금호 타이어 CMS 배포 완료하여 결과 공유 드립니다.
  > 5개 파일로 in 폴더와, out 폴더(결과)가 있으며 0012026071460101Z1 실패한 케이스가 하나 있었습니다.
- Interpretation:
  - 배포는 완료됐지만 테스트 시점에 실패 케이스가 남아 있었다.
- Linked Pages:
  - [[Project_Overview]]
  - [[Risks]]

### Evidence 04
- Source: Slack File
- Channel: #pjt_금호타이어_cms
- Date: 2026-04-15
- Thread: 없음
- Topic: 테스트 결과 산출물
- Type: 변경
- Original:
  > result.zip
  > 0012026071460101Z1_raw.png
- Interpretation:
  - 실패 케이스와 테스트 산출물이 파일 단위로 함께 남아 있다.
- Linked Pages:
  - [[Evidence_Log]]
  - [[Conflict_Register]]

### Evidence 05
- Source: Slack Message
- Channel: #pjt_금호타이어_cms
- Date: 2026-04-16
- Thread: 없음
- Topic: 공장 데이터 해상도 문제
- Type: 리스크
- Original:
  > 연구소 말고 공장데이터로 보이는 ... 결과는 거의 맞는게 없네요ㅠㅠ
- Interpretation:
  - 운영 환경 데이터에서는 연구소/테스트 환경 대비 성능 저하가 뚜렷했다.
- Linked Pages:
  - [[Risks]]
  - [[Project_Overview]]

### Evidence 06
- Source: Slack Message
- Channel: #pjt_금호타이어_cms
- Date: 2026-04-16
- Thread: 없음
- Topic: crop 입력 구조
- Type: 리스크
- Original:
  > Crop Tire 모델을 학습할 때 제가 crop했던 고정 크기(가로 세로 300)으로 잘라서 모델 추론을 진행
- Interpretation:
  - 학습 당시의 고정 crop 크기가 운영 환경 해상도 차이와 직접 연결된 리스크일 수 있다.
- Linked Pages:
  - [[Risks]]
  - [[Conflict_Register]]

### Evidence 07
- Source: Slack Message
- Channel: #pjt_금호타이어_cms
- Date: 2026-01-07
- Thread: 있음
- Topic: 공장과 연구소 니즈 차이
- Type: 리스크
- Original:
  > 공장에서는 중요하게 여기는 8가지 항목들을 기준으로 시작
  > 연구소와 니즈가 다르다
- Interpretation:
  - 고객 내부에서도 현장과 연구소의 평가 기준이 달라 단일 모델/화면으로 모두 만족시키기 어렵다.
- Linked Pages:
  - [[Factory_vs_Lab_Gap]]
  - [[Risks]]

### Evidence 08
- Source: Slack Message
- Channel: #pjt_금호타이어_cms
- Date: 2026-01-07
- Thread: 있음
- Topic: 공장 이미지 기반 개선 필요
- Type: 결정
- Original:
  > 실제 적용을 생각하면 공장 이미지를 기반으로 하는 것이 좋다
- Interpretation:
  - 연구소 데이터 중심 접근보다 공장 데이터 중심 재학습/개선이 우선이라는 방향이 제시됐다.
- Linked Pages:
  - [[Factory_vs_Lab_Gap]]
  - [[Decisions]]

### Evidence 09
- Source: Slack Message
- Channel: #pjt_금호타이어_cms
- Date: 2026-01-23
- Thread: 있음
- Topic: UA 계산 대응 방식
- Type: 결정
- Original:
  > gauge(belt1~2 사이의 거리)를 이용한 수식을 사용하여 UA를 계산
- Interpretation:
  - 일부 측정 항목은 AI 검출이 아닌 규칙 기반 계산으로 먼저 안정화하려는 단계적 접근이 사용됐다.
- Linked Pages:
  - [[Factory_vs_Lab_Gap]]
  - [[Decisions]]

### Evidence 10
- Source: Slack Message
- Channel: #pjt_금호타이어_cms
- Date: 2026-01-23
- Thread: 있음
- Topic: 일정 압박
- Type: 액션
- Original:
  > 금호측 내부 보고 시간을 생각하면 1월 3주가 데드라인
- Interpretation:
  - 이 프로젝트는 기술 개선뿐 아니라 고객 내부 보고 일정에 맞춘 배포 속도도 중요했다.
- Linked Pages:
  - [[Action_Items]]
  - [[Factory_vs_Lab_Gap]]
