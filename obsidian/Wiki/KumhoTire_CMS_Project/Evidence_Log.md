---
type: evidence
created: 2026-04-21
updated: 2026-04-21
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Evidence Log

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

