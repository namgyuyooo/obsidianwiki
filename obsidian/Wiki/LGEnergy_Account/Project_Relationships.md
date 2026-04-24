---
type: knowledge
created: 2026-04-21
updated: 2026-04-21
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Project Relationships

LG엔솔 계정은 현재 위키상 `이미지분석` 프로젝트 하나로 정리되어 있지만, 실제 구조는 `복수 세부 분석 과제`, `성능 목표 협의`, `내부 배포 제약`이 함께 움직이는 계정이다. 따라서 하나의 프로젝트 폴더 안에서 기술 목표와 운영 제약을 분리해 읽는 구조가 적절하다.

## 핵심 축

- `분석 과제 축`
  Li 석출 정량화, XRM 분석, CT 관련 목표와 범위가 이 축에 해당한다.
- `환경/목표 축`
  성능 목표, 과제 범위, 데이터 경로, 과제별 요구사항이 이 축의 중심이다.
- `배포 제약 축`
  AWS 사용 가능 여부, 고객 이미지 반출 금지, 사내 서버 활용, 세션 유지/파일 삭제 정책이 이 축의 중심이다.

## 위키 해석

- LG엔솔은 단순 모델 개발보다 `보안과 운영 제약 안에서 분석 과제를 어떻게 구현할지`가 더 중요한 계정이다.
- 따라서 `Environment_and_Targets`와 `Deployment_and_Constraints`를 함께 읽어야 실제 요구사항이 보인다.
- 향후 계약 이후 실제 실행 증적이 더 쌓이면, 하위 프로젝트 분리보다 `kickoff/실행 단계` 문서를 추가하는 편이 우선일 가능성이 높다.

## 연결 문서

- [[Wiki/LGEnergy_ImageAnalysis_Project/hub]]
- [[Wiki/LGEnergy_ImageAnalysis_Project/Environment_and_Targets]]
- [[Wiki/LGEnergy_ImageAnalysis_Project/Deployment_and_Constraints]]
