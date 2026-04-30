---
type: log
created: 2026-04-21
updated: 2026-04-30
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Conflict Register

## Open Conflicts
- 상충 수치, 버전 불일치, 고객/내부 판단 불일치, 범위 미확정을 이 문서에 등록합니다.
- 해소 전까지 허브 상단 `현재 막힘 / 충돌`과 연동해 가시화합니다.

## 처리 원칙
- 충돌이 상태에 영향을 주면 [[Wiki/KumhoTire_CMS_Project/Status]]의 blocker와 history에도 반영
- 확정되면 [[Wiki/KumhoTire_CMS_Project/Decisions]]로 승격
- 실행이 필요하면 [[Wiki/KumhoTire_CMS_Project/Action_Items]]로 연결
- 리스크가 커지면 [[Wiki/KumhoTire_CMS_Project/Risks]]로 승격

## 기존 정리 메모
## 2026-04-21

### 항목: 연구소 데이터와 공장 데이터 적합성
- 충돌 내용:
  - 배포 테스트는 결과 파일이 생성되는 수준으로 운영됨
  - 공장 데이터 기준으로는 결과가 거의 맞지 않는다는 피드백이 남아 있음
- 관련 증적:
  - [[Evidence_Log#Evidence 03]]
  - [[Evidence_Log#Evidence 05]]
- 현재 판단:
  - 운영 환경 적합성은 아직 미완료 상태로 보는 편이 타당함
- 연결 페이지:
  - [[Risks]]
  - [[Project_Overview]]

### 항목: 금호타이어 프로젝트 구조
- 충돌 내용:
  - 고객은 동일하나 `첫제품 X-ray`와 `CMS`의 증적 성격이 다름
  - 현재는 별도 폴더로 분리했지만 하위 workstream으로 묶을 여지도 있음
- 관련 증적:
  - [[Project_Overview]]
- 현재 판단:
  - 일단 분리 유지, 이후 상위 금호타이어 허브 필요 여부 판단
- 연결 페이지:
  - [[Project_Overview]]
